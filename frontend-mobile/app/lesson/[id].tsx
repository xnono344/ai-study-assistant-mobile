/**
 * Lesson Workspace — horizontal pager with sections, concept cards, formulas,
 * checklist, exercises, sources. The core learning screen.
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share, Platform, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BookOpen, Lightbulb, AlertCircle, Target, Zap, FileText, CheckCircle2, Circle, Copy, Share2, ChevronLeft, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../../components/ui/GlassCard';
import { GlassButton } from '../../components/ui/GlassButton';
import { GlassProgressBar } from '../../components/ui/GlassProgressBar';
import { api, LessonWorkspace, Section, ChecklistItem } from '../../lib/api';
import { cacheLesson, enqueueSync, getCachedLesson } from '../../lib/offline';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useT';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing, Radius } from '../../constants/spacing';

export default function LessonWorkspaceScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useT();
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'checklist' | 'exercises' | 'sources'>('overview');

  const { data: workspace, isLoading } = useQuery<LessonWorkspace | null>({
    queryKey: ['lesson-workspace', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const ws = await api.lessons.workspace(id);
        await cacheLesson(id, ws);
        return ws;
      } catch {
        return (await getCachedLesson(id)) as LessonWorkspace | null;
      }
    },
    enabled: !!id,
  });

  const completeSectionMutation = useMutation({
    mutationFn: (sectionId: string) => api.sections.complete(sectionId, 'medium'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });

  const completeOffline = async (sectionId: string) => {
    if (!user) return;
    if (user.isAnonymous) {
      // Queue offline (will sync when signed in)
      await enqueueSync('CREATE', 'section_complete', sectionId, { section_id: sectionId, confidence: 'medium' });
    }
  };

  const currentSection = workspace?.sections[activeSectionIndex];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.gold.metallic} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!workspace) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color={Colors.error} />
          <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[4] }]}>
            {t('lesson.notFound')}
          </Text>
          <GlassButton variant="primary" onPress={() => router.back()} style={{ marginTop: Spacing[4] }}>
            {t('lesson.goBack')}
          </GlassButton>
        </View>
      </SafeAreaView>
    );
  }

  const tabs = [
    { id: 'overview' as const, label: t('lesson.sections.overview'), icon: BookOpen },
    { id: 'checklist' as const, label: t('lesson.sections.checklist'), icon: Target },
    { id: 'exercises' as const, label: t('lesson.sections.practice'), icon: Zap },
    { id: 'sources' as const, label: t('lesson.sections.sources'), icon: FileText },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
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
        <View style={{ flex: 1 }}>
          <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]} numberOfLines={1}>
            {workspace.subject} • {workspace.level}
          </Text>
          <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]} numberOfLines={1}>
            {workspace.title}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => Share.share({ message: t('lesson.sharing', { title: workspace.title }) })}
          accessibilityLabel={t('lesson.share')}
          accessibilityRole="button"
        >
          <Share2 size={20} color={Colors.text.secondary} />
        </Pressable>
      </View>

      {/* Section pager */}
      <SectionPager
        sections={workspace.sections}
        activeIndex={activeSectionIndex}
        onChange={setActiveSectionIndex}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Tabs */}
        <View style={styles.tabsRow}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tab, isActive && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
              >
                <Icon size={16} color={isActive ? Colors.gold.metallic : Colors.text.tertiary} />
                <Text style={[Typography.labelSmall, { color: isActive ? Colors.gold.metallic : Colors.text.tertiary, marginTop: 4 }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        {currentSection && activeTab === 'overview' && (
          <OverviewTab section={currentSection} onComplete={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            completeSectionMutation.mutate(currentSection.id);
            completeOffline(currentSection.id);
          }} />
        )}
        {currentSection && activeTab === 'checklist' && (
          <ChecklistTab items={currentSection.checklist} />
        )}
        {currentSection && activeTab === 'exercises' && (
          <ExercisesTab exercises={currentSection.exercises} />
        )}
        {currentSection && activeTab === 'sources' && (
          <SourcesTab sources={workspace.sources} />
        )}

        {/* Mark complete button */}
        {currentSection && activeTab === 'overview' && (
          <GlassButton
            variant="primary"
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              completeSectionMutation.mutate(currentSection.id);
              completeOffline(currentSection.id);
              if (activeSectionIndex < workspace.sections.length - 1) {
                setTimeout(() => setActiveSectionIndex((i) => i + 1), 300);
              }
            }}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing[6] }}
            icon={<CheckCircle2 size={18} color="#FFFFFF" />}
          >
            {t('lesson.completeAndNext')}
          </GlassButton>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const SectionPager = ({ sections, activeIndex, onChange }: { sections: Section[]; activeIndex: number; onChange: (i: number) => void }) => (
  <View style={styles.pager}>
    <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pagerScroll}
    >
      {sections.map((s, i) => {
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={s.id}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(i);
            }}
            style={[styles.pagerDot, isActive && styles.pagerDotActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Section ${i + 1}: ${s.title}`}
            accessibilityHint={`Go to section ${i + 1} of ${sections.length}`}
          >
            <Text style={[Typography.labelSmall, { color: isActive ? Colors.gold.metallic : Colors.text.tertiary }]}>
              {i + 1}. {s.title.length > 16 ? s.title.slice(0, 14) + '…' : s.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
    <View style={styles.pagerIndicator}>
      {sections.map((_, i) => (
        <View
          key={i}
          style={[
            styles.pagerIndicatorDot,
            { backgroundColor: i === activeIndex ? Colors.gold.metallic : 'rgba(255, 255, 255, 0.2)' },
            i === activeIndex && { width: 16 },
          ]}
        />
      ))}
    </View>
  </View>
);

const OverviewTab = ({ section, onComplete }: { section: Section; onComplete: () => void }) => {
  const { t } = useT();
  return (
  <Animated.View entering={FadeIn.duration(300)}>
    {/* Summary */}
    {section.shortSummary && (
      <GlassCard variant="elevated" style={styles.card}>
        <View style={styles.cardHeader}>
          <Sparkles size={18} color={Colors.gold.metallic} />
          <Text style={[Typography.headlineSmall, { color: Colors.gold.metallic, marginLeft: Spacing[2] }]}>
            {t('lesson.summary')}
          </Text>
        </View>
        <Text style={[Typography.bodyMedium, { color: '#FFFFFF', marginTop: Spacing[2] }]}>
          {section.shortSummary}
        </Text>
      </GlassCard>
    )}

    {/* Content */}
    <GlassCard variant="default" style={styles.card}>
      <Text style={[Typography.bodyLarge, { color: '#FFFFFF', lineHeight: 26 }]}>
        {section.content}
      </Text>
    </GlassCard>

    {/* Important Points */}
    {section.importantPoints && section.importantPoints.length > 0 && (
      <ConceptCard
        icon="⭐"
        color={Colors.gold.metallic}
        title={t('lesson.importantPoints')}
        items={section.importantPoints.map((p) => p.text)}
      />
    )}

    {/* Definitions */}
    {section.definitions && section.definitions.length > 0 && (
      <ConceptCard
        icon="📖"
        color={Colors.purple[400]}
        title={t('lesson.definitions')}
        items={section.definitions.map((d) => `${d.term} — ${d.definition}`)}
      />
    )}

    {/* Formulas */}
    {section.formulas && section.formulas.length > 0 && (
      <View style={{ marginTop: Spacing[4] }}>
        {section.formulas.map((f) => (
          <FormulaCard key={f.id} formula={f} />
        ))}
      </View>
    )}

    {/* Rules */}
    {section.rules && section.rules.length > 0 && (
      <ConceptCard
        icon="📐"
        color={Colors.warning}
        title={t('lesson.rules')}
        items={section.rules.map((r) => r.statement)}
      />
    )}

    {/* Memorization */}
    {section.memorizationItems && section.memorizationItems.length > 0 && (
      <View style={{ marginTop: Spacing[4], gap: Spacing[2] }}>
        {section.memorizationItems.map((m) => (
          <GlassCard key={m.id} variant="gold" style={{ padding: Spacing[3] }}>
            <View style={styles.memoRow}>
              <Lightbulb size={16} color={Colors.gold.metallic} />
              <Text style={[Typography.bodyMedium, { color: '#FFFFFF', flex: 1, marginLeft: Spacing[2] }]}>
                {m.text}
              </Text>
            </View>
            {m.hint && (
              <Text style={[Typography.bodySmall, { color: Colors.gold.metallic, marginTop: Spacing[2] }]}>
                💡 {m.hint}
              </Text>
            )}
          </GlassCard>
        ))}
      </View>
    )}

    {/* Common Mistakes */}
    {section.commonMistakes && section.commonMistakes.length > 0 && (
      <ConceptCard
        icon="⚠️"
        color={Colors.error}
        title={t('lesson.commonMistakes')}
        items={section.commonMistakes}
      />
    )}

    {/* Worked Examples */}
    {section.workedExamples && section.workedExamples.length > 0 && (
      <View style={{ marginTop: Spacing[4], gap: Spacing[3] }}>
        {section.workedExamples.map((we) => (
          <GlassCard key={we.id} variant="elevated">
            <Text style={[Typography.labelLarge, { color: Colors.purple[300] }]}>{t('lesson.workedExamples')}</Text>
            <Text style={[Typography.bodyLarge, { color: '#FFFFFF', marginTop: Spacing[2] }]}>{we.problem}</Text>
            <View style={styles.stepsContainer}>
              {we.solutionSteps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={[Typography.labelSmall, { color: Colors.gold.metallic }]}>{i + 1}</Text>
                  </View>
                  <Text style={[Typography.bodyMedium, { color: '#FFFFFF', flex: 1 }]}>{step}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        ))}
      </View>
    )}
  </Animated.View>
  );
};

const FormulaCard = ({ formula }: { formula: any }) => {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    Haptics.selectionAsync();
    try {
      await Clipboard.setStringAsync(formula.latex ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e: any) {
      if (__DEV__) console.warn('[FormulaCard] copy failed:', e?.message ?? e);
    }
  };
  return (
    <GlassCard variant="elevated" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={[Typography.headlineSmall, { color: Colors.gold.metallic }]}>∑ {t('lesson.formulas')}</Text>
        <Pressable
          hitSlop={8}
          onPress={handleCopy}
          accessibilityRole="button"
          accessibilityLabel={t('lesson.copyFormula')}
        >
          <Copy size={16} color={copied ? Colors.gold.metallic : Colors.text.tertiary} />
        </Pressable>
      </View>
      <View style={styles.formulaBox}>
        <Text style={styles.formulaLatex}>{formula.latex}</Text>
      </View>
      {formula.description && (
        <Text style={[Typography.bodyMedium, { color: '#FFFFFF', marginTop: Spacing[2] }]}>
          {formula.description}
        </Text>
      )}
    </GlassCard>
  );
};

const ConceptCard = ({ icon, color, title, items }: { icon: string; color: string; title: string; items: string[] }) => (
  <Animated.View entering={FadeIn.duration(300)}>
    <View style={styles.cardHeader}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={[Typography.headlineSmall, { color, marginLeft: Spacing[2] }]}>
        {title}
      </Text>
    </View>
    <View style={{ gap: Spacing[2], marginTop: Spacing[3] }}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: `${color}40` }]}>
            <Text style={[Typography.labelSmall, { color }]}>{i + 1}</Text>
          </View>
          <Text style={[Typography.bodyMedium, { color: '#FFFFFF', flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  </Animated.View>
);

const ChecklistTab = ({ items }: { items: ChecklistItem[] }) => {
  const { t } = useT();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setCompleted((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const progress = items.length > 0 ? completed.size / items.length : 0;

  return (
    <View>
      <GlassProgressBar progress={progress} showLabel label={t('lesson.checklistProgress')} />
      <View style={{ marginTop: Spacing[4], gap: Spacing[2] }}>
        {items.map((item) => {
          const isDone = completed.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [styles.checklistRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="checkbox"
              accessibilityLabel={item.text}
              accessibilityState={{ checked: isDone }}
            >
              {isDone ? (
                <CheckCircle2 size={22} color={Colors.gold.metallic} />
              ) : (
                <Circle size={22} color={Colors.text.tertiary} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[
                  Typography.bodyMedium,
                  { color: isDone ? Colors.text.tertiary : '#FFFFFF', textDecorationLine: isDone ? 'line-through' : 'none' },
                ]}>
                  {item.text}
                </Text>
                <View style={styles.checklistMeta}>
                  <View style={[styles.typeBadge, { backgroundColor: typeColor(item.type) }]}>
                    <Text style={[Typography.labelSmall, { color: '#FFFFFF', fontSize: 10 }]}>
                      {item.type}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const ExercisesTab = ({ exercises }: { exercises: any[] }) => {
  const { t } = useT();
  if (!exercises || exercises.length === 0) {
    return (
      <GlassCard variant="default" style={{ alignItems: 'center', padding: Spacing[8] }}>
        <Text style={styles.emptyEmoji}>🎯</Text>
        <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, marginTop: Spacing[2] }]}>
          {t('practice.noExercisesForSection')}
        </Text>
      </GlassCard>
    );
  }
  return (
    <View style={{ gap: Spacing[3] }}>
      {exercises.map((ex) => (
        <GlassCard key={ex.id} variant="default">
          <View style={styles.exerciseHeader}>
            <View style={[styles.diffBadge, { backgroundColor: `${diffColor(ex.difficulty)}20`, borderColor: diffColor(ex.difficulty) }]}>
              <Text style={[Typography.labelSmall, { color: diffColor(ex.difficulty) }]}>
                {ex.difficulty.toUpperCase()}
              </Text>
            </View>
            {ex.sourceName && (
              <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginLeft: Spacing[2] }]}>
                {ex.sourceName}
              </Text>
            )}
          </View>
          <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginTop: Spacing[2] }]}>
            {ex.title}
          </Text>
          <Text style={[Typography.bodyMedium, { color: Colors.text.secondary, marginTop: Spacing[2] }]}>
            {ex.content}
          </Text>
        </GlassCard>
      ))}
    </View>
  );
};

const SourcesTab = ({ sources }: { sources: any[] }) => {
  const { t } = useT();
  // SECURITY: only allow http(s) URLs through to Linking.openURL to block
  // dangerous schemes (javascript:, file:, custom-scheme phish attempts).
  const isSafeUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ['https:', 'http:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  if (!sources || sources.length === 0) {
    return (
      <GlassCard variant="default" style={{ alignItems: 'center', padding: Spacing[8] }}>
        <Text style={styles.emptyEmoji}>📚</Text>
        <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, marginTop: Spacing[2] }]}>
          {t('lesson.noSources')}
        </Text>
      </GlassCard>
    );
  }
  return (
    <View style={{ gap: Spacing[3] }}>
      {sources.map((src, i) => (
        <GlassCard key={i} variant="default" pressable onPress={() => src.url && isSafeUrl(src.url) && Linking.openURL(src.url)}>
          <View style={styles.sourceRow}>
            <View style={[styles.sourceIcon, { backgroundColor: 'rgba(96, 165, 250, 0.15)' }]}>
              <FileText size={18} color="#60A5FA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]} numberOfLines={1}>{src.name}</Text>
              {src.title && <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginTop: 2 }]} numberOfLines={1}>{src.title}</Text>}
            </View>
          </View>
        </GlassCard>
      ))}
    </View>
  );
};

const typeColor = (type: string) => {
  switch (type) {
    case 'understand': return 'rgba(96, 165, 250, 0.3)';
    case 'memorize': return 'rgba(255, 215, 0, 0.3)';
    case 'practice': return 'rgba(34, 197, 94, 0.3)';
    case 'review': return 'rgba(168, 85, 247, 0.3)';
    default: return 'rgba(255, 255, 255, 0.1)';
  }
};

const diffColor = (d: string) => {
  if (d === 'easy') return Colors.success;
  if (d === 'medium') return Colors.warning;
  return Colors.error;
};

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
  pager: {
    paddingVertical: Spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  pagerScroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  pagerDot: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  pagerDotActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: Colors.gold.metallic,
  },
  pagerIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing[2],
  },
  pagerIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scroll: {
    padding: Spacing[4],
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing[2],
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  tabActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
  },
  card: {
    marginBottom: Spacing[4],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formulaBox: {
    padding: Spacing[4],
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: Radius.md,
    marginTop: Spacing[3],
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    alignItems: 'center',
  },
  formulaLatex: {
    fontSize: 24,
    color: Colors.gold.metallic,
    fontFamily: Platform.OS === 'ios' ? 'SFMono-Regular' : 'RobotoMono-Regular',
    textAlign: 'center',
  },
  memoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepsContainer: {
    marginTop: Spacing[3],
    gap: Spacing[2],
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  bullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing[3],
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    gap: Spacing[3],
  },
  checklistMeta: {
    flexDirection: 'row',
    marginTop: Spacing[2],
  },
  typeBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  diffBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[8],
  },
});
