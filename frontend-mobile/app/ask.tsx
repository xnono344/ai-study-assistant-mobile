/**
 * Ask (Q&A) — ask questions about lessons. Uses user's Gemini API.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, Send, Sparkles, Brain } from 'lucide-react-native';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassInput } from '../components/ui/GlassInput';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../hooks/useT';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Spacing, Radius } from '../constants/spacing';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export default function AskScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [lessonId, setLessonId] = useState('');

  const askMutation = useMutation({
    mutationFn: ({ lessonId, question }: { lessonId: string; question: string }) =>
      api.questions.ask(lessonId, question),
    onSuccess: (response) => {
      // Backend may return empty / missing answer on partial failure. Fall
      // back to a translated placeholder so the chat bubble still renders.
      const text = response?.answer || t('errors.generic');
      setMessages((m) => [...m, { id: `${Date.now()}-a`, role: 'assistant', text }]);
    },
    onError: (e: any) => {
      const { message } = getErrorMessage(e);
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: 'assistant', text: t(message) }]);
    },
  });

  const handleAsk = () => {
    if (!question.trim() || !lessonId.trim()) return;
    if (user?.isAnonymous) {
      router.push('/(auth)/connect-google');
      return;
    }
    const userMsg: Message = { id: `${Date.now()}-u`, role: 'user', text: question };
    setMessages((m) => [...m, userMsg]);
    askMutation.mutate({ lessonId, question });
    setQuestion('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={20}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]}>{t('ask.title')}</Text>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
              {t('ask.poweredByGemini')}
            </Text>
          </View>
          <Brain size={20} color={Colors.gold.metallic} />
        </View>

        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Sparkles size={48} color={Colors.gold.metallic} />
            <Text style={[Typography.headlineSmall, { color: Colors.gold.metallic, marginTop: Spacing[4], textAlign: 'center' }]}>
              {t('ask.emptyTitle')}
            </Text>
            <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, marginTop: Spacing[2], textAlign: 'center' }]}>
              {t('ask.emptySubtitle')}
            </Text>
            <View style={styles.examples}>
              {(t('ask.examples', { returnObjects: true }) as string[]).map((q, i) => (
                <GlassCard
                  key={i}
                  variant="default"
                  pressable
                  onPress={() => setQuestion(q)}
                  style={styles.exampleCard}
                >
                  <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>{q}</Text>
                </GlassCard>
              ))}
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.messages}>
            {messages.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.message,
                  m.role === 'user' ? styles.userMessage : styles.assistantMessage,
                ]}
              >
                <Text style={[
                  Typography.bodyMedium,
                  { color: '#FFFFFF' },
                ]}>
                  {m.text}
                </Text>
              </View>
            ))}
            {askMutation.isPending && (
              <View style={[styles.message, styles.assistantMessage]}>
                <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary }]}>
                  {t('ask.thinking')}
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.inputBar}>
          <GlassInput
            placeholder={t('ask.lessonIdPlaceholder')}
            value={lessonId}
            onChangeText={setLessonId}
            containerStyle={{ marginBottom: Spacing[2] }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <GlassInput
                placeholder={t('ask.questionPlaceholder')}
                value={question}
                onChangeText={setQuestion}
                onSubmitEditing={handleAsk}
                returnKeyType="send"
              />
            </View>
            <GlassButton
              variant="primary"
              onPress={handleAsk}
              disabled={!question.trim() || !lessonId.trim()}
              loading={askMutation.isPending}
              style={styles.sendBtn}
              icon={<Send size={18} color="#FFFFFF" />}
              accessibilityLabel={t('ask.send')}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[8],
  },
  examples: {
    marginTop: Spacing[6],
    width: '100%',
    gap: Spacing[2],
  },
  exampleCard: {
    width: '100%',
  },
  messages: {
    padding: Spacing[4],
    gap: Spacing[3],
  },
  message: {
    padding: Spacing[3],
    borderRadius: Radius.lg,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.purple[500],
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  inputBar: {
    padding: Spacing[4],
    paddingTop: Spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.glass.border,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing[2],
  },
  sendBtn: {
    marginBottom: 0,
  },
});
