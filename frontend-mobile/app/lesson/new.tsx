/**
 * Create Lesson — topic input or file upload (PDF, image, text).
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Sparkles, Camera, FileText, Upload } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { GlassCard } from '../../components/ui/GlassCard';
import { GlassButton } from '../../components/ui/GlassButton';
import { GlassInput } from '../../components/ui/GlassInput';
import { NexusLogo } from '../../components/ui/NexusLogo';
import { api, getErrorMessage } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useT';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing, Radius } from '../../constants/spacing';

const SUBJECTS = ['Math', 'Physics', 'Chemistry', 'Biology', 'Arabic', 'French', 'English', 'History', 'Philosophy', 'Computer Science'];
const LEVELS = ['Middle School', 'High School', '1st Year Bac', '2nd Year Bac', 'University'];

export default function NewLessonScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Physics');
  const [level, setLevel] = useState('1st Year Bac');
  const [chapter, setChapter] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [step, setStep] = useState<'input' | 'processing'>('input');
  const [processingStage, setProcessingStage] = useState('lesson.processing.connecting');

  const createMutation = useMutation({
    mutationFn: (input: any) => api.lessons.create(input),
    onSuccess: async (lesson) => {
      setStep('processing');
      const stagesTemplate = [
        { key: 'lesson.processing.connecting', delay: 1500 },
        { key: 'lesson.processing.analyzing', delay: 2000 },
        { key: 'lesson.processing.structuring', delay: 2000 },
        { key: 'lesson.processing.generating', delay: 2000 },
        { key: 'lesson.processing.ready', delay: 500 },
      ];
      for (const s of stagesTemplate) {
        setProcessingStage(t(s.key));
        await new Promise((r) => setTimeout(r, s.delay));
      }
      // The real LLM call now takes over. Show a distinct message so the
      // user knows we're past the fake warm-up and actually waiting on the
      // network — otherwise the spinner looks stuck for 30-60s.
      setProcessingStage(t('lesson.processing.generatingLive'));
      // Try to process the lesson (this calls the LLM)
      try {
        await api.lessons.process(lesson.id);
      } catch (e) {
        if (__DEV__) console.warn('[new lesson] process failed:', e);
        Alert.alert(
          t('lesson.processFailed'),
          t('lesson.processFailedBody'),
          [
            { text: t('common.ok'), onPress: () => {
              queryClient.invalidateQueries({ queryKey: ['lessons'] });
              router.replace(`/lesson/${lesson.id}`);
            }},
          ]
        );
        return; // Don't continue to the rest of onSuccess
      }
      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      router.replace(`/lesson/${lesson.id}`);
    },
    onError: (e: any) => {
      // Without this handler, a create failure (network down, 4xx/5xx) leaves
      // the form stuck in its loading state with no feedback. Surface the
      // mapped error to the user and snap the screen back to input.
      if (__DEV__) console.warn('[new lesson] create failed:', e?.message ?? e);
      const { title, message } = getErrorMessage(e);
      Alert.alert(t(title), t(message));
      setStep('input');
    },
  });

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('lesson.cameraRequired'), t('lesson.cameraRequiredBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      setUploadedFile({
        uri: asset.uri,
        name: `photo-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
    }
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('lesson.libraryPermissionRequired'), t('lesson.libraryPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      setUploadedFile({
        uri: asset.uri,
        name: asset.fileName ?? `image-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
    }
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain'],
      copyToCacheDirectory: true,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      setUploadedFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      });
    }
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    if (user?.isAnonymous) {
      // Show connect Google prompt
      router.push('/(auth)/connect-google');
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      subject,
      level,
      chapter: chapter.trim() || undefined,
    });
  };

  if (step === 'processing') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.processingContainer}>
          <NexusLogo size={120} />
          <Text style={[Typography.headlineLarge, { color: Colors.gold.metallic, marginTop: Spacing[8], textAlign: 'center' }]}>
            {t(processingStage)}
          </Text>
          <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, marginTop: Spacing[3], textAlign: 'center' }]}>
            {t('lesson.processing.body')}
          </Text>
          <ActivityIndicator color={Colors.gold.metallic} size="large" style={{ marginTop: Spacing[8] }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]}>
            {t('lesson.newLesson')}
          </Text>
        </View>

        <View style={styles.heroSection}>
          <NexusLogo size={64} />
          <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, marginTop: Spacing[3], textAlign: 'center' }]}>
            {t('lesson.create')}
          </Text>
          <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, marginTop: Spacing[2], textAlign: 'center' }]}>
            {t('lesson.createSubtitle')}
          </Text>
        </View>

        {/* Topic input */}
        <GlassCard variant="elevated" style={styles.card}>
          <GlassInput
            label={t('lesson.topic')}
            placeholder={t('lesson.topicPlaceholder')}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            containerStyle={{ marginBottom: Spacing[3] }}
          />
          <GlassInput
            label={t('lesson.chapterOptional')}
            placeholder={t('lesson.chapterPlaceholder')}
            value={chapter}
            onChangeText={setChapter}
            maxLength={100}
          />
        </GlassCard>

        {/* Subject selector */}
        <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, marginTop: Spacing[4], marginBottom: Spacing[2], paddingHorizontal: Spacing[1] }]}>
          {t('lesson.subject')}
        </Text>
        <View style={styles.chipRow}>
          {SUBJECTS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSubject(s)}
              style={[styles.chip, subject === s && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={s}
              accessibilityState={{ selected: subject === s }}
            >
              <Text style={[
                Typography.bodySmall,
                { color: subject === s ? '#FFFFFF' : Colors.text.tertiary, fontWeight: subject === s ? '600' : '400' },
              ]}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Level selector */}
        <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, marginTop: Spacing[4], marginBottom: Spacing[2], paddingHorizontal: Spacing[1] }]}>
          {t('lesson.level')}
        </Text>
        <View style={styles.chipRow}>
          {LEVELS.map((l) => (
            <Pressable
              key={l}
              onPress={() => setLevel(l)}
              style={[styles.chip, level === l && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={l}
              accessibilityState={{ selected: level === l }}
            >
              <Text style={[Typography.bodySmall,
                { color: level === l ? '#FFFFFF' : Colors.text.tertiary, fontWeight: level === l ? '600' : '400' },
              ]}>
                {l}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Upload section */}
        <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, marginTop: Spacing[4], marginBottom: Spacing[2], paddingHorizontal: Spacing[1] }]}>
          {t('lesson.orUploadOptional')}
        </Text>
        <View style={styles.uploadRow}>
          <GlassCard variant="default" pressable onPress={pickFromCamera} style={styles.uploadCard}>
            <Camera size={22} color={Colors.purple[300]} />
            <Text style={[Typography.bodySmall, { color: '#FFFFFF', marginTop: Spacing[2] }]}>
              {t('lesson.camera')}
            </Text>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: Spacing[1], textAlign: 'center' }]}>
              {t('lesson.cameraSub')}
            </Text>
          </GlassCard>
          <GlassCard variant="default" pressable onPress={pickFromLibrary} style={styles.uploadCard}>
            <Upload size={22} color={Colors.purple[300]} />
            <Text style={[Typography.bodySmall, { color: '#FFFFFF', marginTop: Spacing[2] }]}>
              {t('lesson.library')}
            </Text>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: Spacing[1], textAlign: 'center' }]}>
              {t('lesson.librarySub')}
            </Text>
          </GlassCard>
          <GlassCard variant="default" pressable onPress={pickFile} style={styles.uploadCard}>
            <FileText size={22} color={Colors.purple[300]} />
            <Text style={[Typography.bodySmall, { color: '#FFFFFF', marginTop: Spacing[2] }]}>
              {t('lesson.pdf')}
            </Text>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: Spacing[1], textAlign: 'center' }]}>
              {t('lesson.pdfSub')}
            </Text>
          </GlassCard>
        </View>

        {uploadedFile && (
          <GlassCard variant="elevated" style={[styles.card, { marginTop: Spacing[3] }]}>
            <View style={styles.fileRow}>
              <FileText size={20} color={Colors.gold.metallic} />
              <View style={{ flex: 1 }}>
                <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]} numberOfLines={1}>{uploadedFile.name}</Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]} numberOfLines={1}>{uploadedFile.type}</Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* Create button */}
        <GlassButton
          variant="gold"
          onPress={handleCreate}
          fullWidth
          size="lg"
          loading={createMutation.isPending}
          disabled={!title.trim()}
          style={{ marginTop: Spacing[6] }}
          icon={<Sparkles size={18} color={Colors.gold.metallic} />}
        >
          {t('lesson.generate')}
        </GlassButton>

        <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, textAlign: 'center', marginTop: Spacing[4] }]}>
          {t('lesson.poweredByGemini')}
        </Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing[4],
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing[6],
  },
  card: {
    marginTop: Spacing[3],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  chipActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderColor: Colors.purple[400],
  },
  uploadRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  uploadCard: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing[4],
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[8],
  },
});
