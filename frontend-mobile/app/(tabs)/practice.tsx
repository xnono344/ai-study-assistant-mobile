/**
 * Practice — fully translated (EN/FR/AR).
 */

import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { Check, X, ChevronRight, RefreshCw, Lightbulb } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../../components/ui/GlassCard';
import { GlassButton } from '../../components/ui/GlassButton';
import { api } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing, Radius } from '../../constants/spacing';
import { useT } from '../../hooks/useT';

type Difficulty = 'easy' | 'medium' | 'hard';
type Mode = 'random' | 'sequential';

const DIFFICULTY_COLORS = { easy: Colors.success, medium: Colors.warning, hard: Colors.error };

interface PracticeExercise {
  id: string;
  title: string;
  content: string;
  difficulty: Difficulty;
  hasSolution: boolean;
  sourceName: string;
  sourceUrl: string;
  isAiGenerated: boolean;
  lesson_id?: string;
  lesson_title?: string;
}

export default function PracticeScreen() {
  const router = useRouter();
  const { t } = useT();
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [mode, setMode] = useState<Mode>('sequential');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [startTime, setStartTime] = useState(Date.now());

  const { data: lessons } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => api.lessons.list(),
  });

  const { data: workspaces } = useQuery({
    queryKey: ['practice-exercises'],
    queryFn: async () => {
      if (!lessons) return [];
      // Parallel fetch: was an N+1 sequential loop. Now all lesson workspaces
      // are requested concurrently and failures are logged (not silently
      // swallowed) so the screen still renders partial data.
      const results = await Promise.all(
        lessons.map(async (lesson) => {
          try {
            const ws = await api.lessons.workspace(lesson.id);
            const exercises: PracticeExercise[] = [];
            for (const section of ws.sections || []) {
              for (const ex of section.exercises || []) {
                exercises.push({ ...ex, lesson_id: lesson.id, lesson_title: lesson.title });
              }
            }
            return exercises;
          } catch (e: any) {
            if (__DEV__) console.warn(`[practice] failed to load workspace for lesson ${lesson.id}:`, e?.message ?? e);
            return [] as PracticeExercise[];
          }
        })
      );
      return results.flat();
    },
    enabled: !!lessons && lessons.length > 0,
  });

  const filtered = useMemo(() => {
    let exs = workspaces ?? [];
    if (difficulty !== 'all') exs = exs.filter((e) => e.difficulty === difficulty);
    if (mode === 'random') exs = [...exs].sort(() => Math.random() - 0.5);
    return exs;
  }, [workspaces, difficulty, mode]);

  // Guard: if filter changes shrunk the list below currentIndex, clamp so we
  // never index out of bounds (which returns undefined and breaks submit).
  const safeIndex = filtered.length > 0 ? Math.min(currentIndex, filtered.length - 1) : 0;
  const current = filtered[safeIndex];

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error('No active exercise');
      const elapsed = Math.max(0, Math.round((Date.now() - startTime) / 1000));
      return api.exercises.attempt(current.id, userAnswer, elapsed);
    },
    onSuccess: (res) => {
      // Haptic feedback so the user feels the result, not just sees it.
      // Wrapped in try/catch — some devices / permissions throw on
      // notification feedback, and the answer state must still update.
      try {
        if (res.is_correct) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch {}
      setCorrect(res.is_correct);
      setAnswered(true);
      setScore((s) => ({
        correct: s.correct + (res.is_correct ? 1 : 0),
        total: s.total + 1,
      }));
    },
    onError: (e: any) => {
      // Fall back to "submitted" feedback rather than crashing or silently
      // pretending the answer was correct. The user sees something happened,
      // but we don't claim correctness we don't have — and we don't inflate
      // the score when the server couldn't be reached.
      if (__DEV__) console.warn('[practice] attempt submission failed:', e?.message ?? e);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
      setCorrect(null);
      setAnswered(true);
    },
  });

  const handleSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitMutation.mutate();
  };

  const handleNext = () => {
    Haptics.selectionAsync();
    submitMutation.reset();
    setCurrentIndex((i) => (filtered.length > 0 ? (i + 1) % filtered.length : 0));
    setUserAnswer('');
    setShowHint(false);
    setAnswered(false);
    setCorrect(null);
    setStartTime(Date.now());
  };

  if (!workspaces) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.gold.metallic} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (filtered.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, fontSize: 28 }]}>
            {t('practice.title')}
          </Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={[Typography.headlineSmall, { marginTop: Spacing[3] }]}>{t('practice.noExercises')}</Text>
          <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, textAlign: 'center', marginTop: Spacing[2] }]}>
            {t('practice.noExercisesSubtitle')}
          </Text>
          <GlassButton
            variant="primary"
            onPress={() => router.push('/lesson/new')}
            style={{ marginTop: Spacing[4] }}
          >
            {t('lessons.createFirst')}
          </GlassButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, fontSize: 28 }]}>
              {t('practice.title')}
            </Text>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
              {score.total > 0 ? t('practice.score', { correct: score.correct, total: score.total }) : t('practice.exercisesAvailable', { count: filtered.length })}
            </Text>
          </View>
          <GlassButton
            variant="ghost"
            onPress={handleNext}
            icon={<RefreshCw size={16} color={Colors.gold.metallic} />}
          >
            {mode === 'random' ? t('practice.shuffle') : t('practice.skip')}
          </GlassButton>
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          {(['all', 'easy', 'medium', 'hard'] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => { setDifficulty(d); setCurrentIndex(0); }}
              style={[
                styles.chip,
                difficulty === d && {
                  backgroundColor: d === 'all' ? 'rgba(168, 85, 247, 0.2)' : `${DIFFICULTY_COLORS[d as Difficulty]}20`,
                  borderColor: d === 'all' ? Colors.purple[400] : DIFFICULTY_COLORS[d as Difficulty],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={d === 'all' ? t('practice.all') : t(`practice.${d}`)}
              accessibilityState={{ selected: difficulty === d }}
            >
              <Text style={[
                styles.chipText,
                difficulty === d && { color: '#FFFFFF', fontWeight: '600' },
              ]}>
                {d === 'all' ? t('practice.all') : t(`practice.${d}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => setMode('sequential')}
            style={[styles.modeBtn, mode === 'sequential' && styles.modeBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={t('practice.sequential')}
            accessibilityState={{ selected: mode === 'sequential' }}
          >
            <Text style={[styles.modeText, mode === 'sequential' && styles.modeTextActive]}>
              {t('practice.sequential')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('random')}
            style={[styles.modeBtn, mode === 'random' && styles.modeBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={t('practice.random')}
            accessibilityState={{ selected: mode === 'random' }}
          >
            <Text style={[styles.modeText, mode === 'random' && styles.modeTextActive]}>
              {t('practice.random')}
            </Text>
          </Pressable>
        </View>

        {/* Exercise card */}
        {current && (
          <Animated.View
            key={`${current.id}-${currentIndex}`}
            entering={SlideInRight.duration(300)}
            exiting={SlideOutLeft.duration(300)}
          >
            <GlassCard variant="elevated" style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <View style={[styles.diffBadge, { backgroundColor: `${DIFFICULTY_COLORS[current.difficulty]}20`, borderColor: DIFFICULTY_COLORS[current.difficulty] }]}>
                  <Text style={[Typography.labelSmall, { color: DIFFICULTY_COLORS[current.difficulty] }]}>
                    {current.difficulty.toUpperCase()}
                  </Text>
                </View>
                {current.lesson_title && (
                  <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginLeft: Spacing[2] }]} numberOfLines={1}>
                    {current.lesson_title}
                  </Text>
                )}
              </View>

              <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[3] }]}>
                {current.title}
              </Text>
              <Text style={[Typography.bodyMedium, { color: Colors.text.secondary, marginTop: Spacing[2] }]}>
                {current.content}
              </Text>

              {/* Answer input */}
              <View style={styles.answerSection}>
                <Text style={[Typography.labelLarge, { color: Colors.text.tertiary, marginBottom: Spacing[2] }]}>
                  {t('practice.yourAnswer')}
                </Text>
                <View style={styles.answerInput}>
                  <Text style={[Typography.bodyLarge, { color: userAnswer ? '#FFFFFF' : Colors.text.tertiary }]}>
                    {userAnswer || t('practice.typeAnswer')}
                  </Text>
                </View>

                {/* Quick keys */}
                <View style={styles.quickKeys}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '='].map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => setUserAnswer((a) => a + key)}
                      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={key}
                    >
                      <Text style={styles.keyText}>{key}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => setUserAnswer((a) => a.slice(0, -1))}
                    style={styles.keyDel}
                    accessibilityRole="button"
                    accessibilityLabel="Delete"
                  >
                    <X size={16} color={Colors.text.tertiary} />
                  </Pressable>
                </View>
              </View>

              {/* Actions */}
              {answered ? (
                <Animated.View entering={FadeIn} style={styles.resultSection}>
                  <View style={[
                    styles.resultBanner,
                    {
                      // Three states: correct (green), wrong (red), unknown
                      // because the server couldn't be reached (gold/neutral).
                      backgroundColor: correct === true
                        ? 'rgba(34, 197, 94, 0.15)'
                        : correct === false
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(255, 215, 0, 0.12)',
                      borderColor: correct === true
                        ? Colors.success
                        : correct === false
                          ? Colors.error
                          : Colors.gold.metallic,
                    },
                  ]}>
                    {correct === true ? (
                      <Check size={20} color={Colors.success} />
                    ) : correct === false ? (
                      <X size={20} color={Colors.error} />
                    ) : (
                      <Lightbulb size={20} color={Colors.gold.metallic} />
                    )}
                    <Text style={[
                      Typography.bodyMedium,
                      {
                        color: correct === true
                          ? Colors.success
                          : correct === false
                            ? Colors.error
                            : Colors.gold.metallic,
                        marginLeft: Spacing[2],
                      },
                    ]}>
                      {correct === true
                        ? t('practice.correct')
                        : correct === false
                          ? t('practice.tryAgain')
                          : t('practice.submitted')}
                    </Text>
                  </View>
                  <GlassButton variant="primary" onPress={handleNext} fullWidth size="lg" icon={<ChevronRight size={18} color="#FFFFFF" />}>
                    {t('practice.nextExercise')}
                  </GlassButton>
                </Animated.View>
              ) : (
                <View style={styles.actions}>
                  {current.hasSolution && (
                    <GlassButton
                      variant="ghost"
                      onPress={() => setShowHint(!showHint)}
                      icon={<Lightbulb size={16} color={Colors.gold.metallic} />}
                    >
                      {showHint ? t('practice.hideHint') : t('practice.showHint')}
                    </GlassButton>
                  )}
                  <GlassButton
                    variant="primary"
                    onPress={handleSubmit}
                    disabled={userAnswer.length < 2}
                    fullWidth
                    size="lg"
                  >
                    {t('practice.submitAnswer')}
                  </GlassButton>
                </View>
              )}

              {showHint && (
                <Animated.View entering={FadeIn} style={styles.hintBox}>
                  <Lightbulb size={14} color={Colors.gold.metallic} />
                  <Text style={[Typography.bodySmall, { color: Colors.text.secondary, marginLeft: Spacing[2] }]}>
                    {current.sourceName}
                  </Text>
                </Animated.View>
              )}
            </GlassCard>
          </Animated.View>
        )}

        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
            {currentIndex + 1} / {filtered.length}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((currentIndex + 1) / filtered.length) * 100}%` }]} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: Spacing[4] },
  filterRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[3] },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  chipText: { fontSize: 13, color: Colors.text.tertiary, fontWeight: '500' },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  modeBtn: { flex: 1, paddingVertical: Spacing[2], borderRadius: Radius.md, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.purple[500] },
  modeText: { fontSize: 14, color: Colors.text.tertiary, fontWeight: '500' },
  modeTextActive: { color: '#FFFFFF', fontWeight: '600' },
  exerciseCard: { marginBottom: Spacing[4] },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center' },
  diffBadge: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: Radius.sm, borderWidth: 1 },
  answerSection: { marginTop: Spacing[4] },
  answerInput: {
    padding: Spacing[4],
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    minHeight: 60,
    marginBottom: Spacing[3],
  },
  quickKeys: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[4] },
  key: {
    width: '23%',
    paddingVertical: Spacing[3],
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  keyPressed: { backgroundColor: 'rgba(168, 85, 247, 0.2)' },
  keyText: { fontSize: 20, color: '#FFFFFF', fontWeight: '600' },
  keyDel: {
    width: '23%',
    paddingVertical: Spacing[3],
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  actions: { gap: Spacing[2] },
  resultSection: { gap: Spacing[3] },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[3],
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[3],
    backgroundColor: 'rgba(255, 215, 0, 0.06)',
    borderRadius: Radius.lg,
    marginTop: Spacing[3],
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.gold.metallic, borderRadius: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing[8] },
  emptyEmoji: { fontSize: 64 },
});
