/**
 * Upload — PDF / image / text upload with OCR + lesson creation.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Camera, Upload, FileText, Image as ImageIcon, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassProgressBar } from '../components/ui/GlassProgressBar';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../hooks/useT';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing } from '../constants/spacing';

export default function UploadScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useT();
  const [file, setFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [stage, setStage] = useState<'select' | 'uploading' | 'ocr' | 'processing' | 'done'>('select');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  // Hold the post-success redirect timer so we can cancel it on unmount —
  // otherwise router.replace fires after the screen is gone and the timer
  // leaks across navigation.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  const pickImage = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      const asset = result.assets?.[0];
      if (!result.canceled && asset?.uri) {
        setFile({ uri: asset.uri, name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' });
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
      const asset = result.assets?.[0];
      if (!result.canceled && asset?.uri) {
        setFile({
          uri: asset.uri,
          name: asset.fileName ?? `image-${Date.now()}.jpg`,
          type: 'image/jpeg',
        });
      }
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      setFile({
        uri: asset.uri,
        name: asset.name,
        type: 'application/pdf',
      });
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (user?.isAnonymous) {
      router.push('/(auth)/connect-google');
      return;
    }
    try {
      // 1. Upload file
      setStage('uploading');
      setStatusText(t('upload.uploading'));
      setProgress(0);
      await api.uploads.create(file, (p) => setProgress(p));
      setProgress(100);

      // 2. OCR progress (simulated — backend is doing the real work)
      setStage('ocr');
      setStatusText(t('upload.ocr'));
      setProgress(0);
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i);
        await new Promise((r) => setTimeout(r, 200));
      }

      // 3. Create a lesson from the uploaded file
      setStage('processing');
      setStatusText(t('upload.creating'));
      setProgress(0);
      const lesson = await api.lessons.create({
        title: file.name.replace(/\.[^.]+$/, ''),  // strip extension
        subject: 'General',
        level: 'All Levels',
      });

      // 4. Kick off AI processing (best-effort — failure is non-fatal,
      //    the lesson still exists and the user can retry from workspace)
      try {
        for (let i = 0; i <= 100; i += 20) {
          setProgress(i);
          await new Promise((r) => setTimeout(r, 200));
        }
        await api.lessons.process(lesson.id);
      } catch (e: any) {
        if (__DEV__) console.warn('[upload] process failed:', e?.message ?? e);
      }

      queryClient.invalidateQueries({ queryKey: ['lessons'] });
      setStage('done');
      setStatusText(t('upload.done'));

      // 5. Auto-navigate to the new lesson after a short delay so the user
      //    sees the success state instead of a jarring blank screen
      redirectTimer.current = setTimeout(() => router.replace(`/lesson/${lesson.id}`), 1500);
    } catch (e: any) {
      const { title, message } = getErrorMessage(e);
      Alert.alert(t(title), t(message));
      setStage('select');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
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
          <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]}>{t('upload.title')}</Text>
        </View>

        {stage === 'select' && (
          <>
            <Text style={[Typography.bodyMedium, { color: Colors.text.secondary, marginBottom: Spacing[4], textAlign: 'center' }]}>
              {t('upload.subtitle')}
            </Text>

            <View style={styles.uploadGrid}>
              <GlassCard variant="elevated" pressable onPress={() => pickImage('camera')} style={styles.uploadCard}>
                <Camera size={32} color={Colors.gold.metallic} />
                <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[3] }]}>
                  {t('upload.camera')}
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: Spacing[1], textAlign: 'center' }]}>
                  {t('upload.capture')}
                </Text>
              </GlassCard>

              <GlassCard variant="elevated" pressable onPress={() => pickImage('library')} style={styles.uploadCard}>
                <ImageIcon size={32} color={Colors.purple[300]} />
                <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[3] }]}>
                  {t('upload.library')}
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: Spacing[1], textAlign: 'center' }]}>
                  {t('upload.fromGallery')}
                </Text>
              </GlassCard>

              <GlassCard variant="elevated" pressable onPress={pickPdf} style={styles.uploadCard}>
                <FileText size={32} color="#60A5FA" />
                <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[3] }]}>
                  {t('upload.pdf')}
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: Spacing[1], textAlign: 'center' }]}>
                  {t('upload.documents')}
                </Text>
              </GlassCard>
            </View>

            {file && (
              <GlassCard variant="elevated" style={[styles.card, { marginTop: Spacing[6] }]}>
                <View style={styles.fileRow}>
                  <View style={[styles.fileIcon, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
                    <FileText size={20} color={Colors.gold.metallic} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]} numberOfLines={1}>{file.name}</Text>
                    <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]} numberOfLines={1}>{file.type}</Text>
                  </View>
                  <Check size={20} color={Colors.success} />
                </View>
                <GlassButton
                  variant="gold"
                  onPress={handleUpload}
                  fullWidth
                  size="lg"
                  style={{ marginTop: Spacing[4] }}
                  icon={<Upload size={18} color={Colors.gold.metallic} />}
                >
                  {t('upload.process')}
                </GlassButton>
              </GlassCard>
            )}
          </>
        )}

        {(stage === 'uploading' || stage === 'ocr' || stage === 'processing' || stage === 'done') && (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="large" color={Colors.gold.metallic} />
            <Text style={[Typography.headlineSmall, { color: Colors.gold.metallic, marginTop: Spacing[6], textAlign: 'center' }]}>
              {statusText}
            </Text>
            <View style={{ width: '100%', marginTop: Spacing[6] }}>
              <GlassProgressBar progress={progress / 100} animated />
            </View>
            {stage === 'done' && (
              <GlassButton
                variant="primary"
                onPress={() => router.back()}
                style={{ marginTop: Spacing[6] }}
              >
                {t('common.done')}
              </GlassButton>
            )}
          </View>
        )}
      </ScrollView>
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
  uploadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  uploadCard: {
    flexBasis: '47%',
    alignItems: 'center',
    padding: Spacing[5],
  },
  card: {},
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    alignItems: 'center',
    paddingTop: Spacing[16],
  },
});
