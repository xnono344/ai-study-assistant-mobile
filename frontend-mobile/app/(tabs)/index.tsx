/**
 * Dashboard — stats, recent lessons, quick actions, upgrade banner.
 * Fully translated (EN/FR/AR). French default.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Clock, Dumbbell, Flame, Plus, Sparkles, ChevronRight, TrendingUp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlassCard } from '../../components/ui/GlassCard';
import { GlassButton } from '../../components/ui/GlassButton';
import { NexusLogo } from '../../components/ui/NexusLogo';
import { api, LessonSummary, Progress } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useT';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useT();
  const { user, isLoading: authLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: progress, refetch: refetchProgress } = useQuery<Progress>({
    queryKey: ['progress'],
    queryFn: () => api.progress.get(),
    enabled: !authLoading && !!user,
  });

  const { data: lessons, refetch: refetchLessons } = useQuery<LessonSummary[]>({
    queryKey: ['lessons'],
    queryFn: () => api.lessons.list(),
    enabled: !authLoading && !!user,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProgress(), refetchLessons()]);
    setRefreshing(false);
  };

  if (authLoading) {
    return <View style={styles.container} />;
  }

  const freeLessonCount = lessons?.length ?? 0;
  // Explicit parens: ! (A) || (B && C) — JS precedence already does this,
  // but reading it without parens is a foot-gun. Keep the intent obvious.
  const isFreeLimitReached = !user?.subscriptionTier
    || (user.subscriptionTier === 'free' && freeLessonCount >= 3);

  // Greeting based on time of day
  const greetingKey = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'dashboard.greetingMorning';
    if (h < 18) return 'dashboard.greetingAfternoon';
    return 'dashboard.greetingEvening';
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gold.metallic}
          />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <NexusLogo size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
              {t(greetingKey)}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </Text>
            <Text style={[Typography.headlineMedium, { color: Colors.gold.metallic }]}>
              {t('dashboard.title')}
            </Text>
          </View>
        </Animated.View>

        {/* Upgrade banner */}
        {isFreeLimitReached && user?.isAnonymous && (
          <Animated.View entering={FadeInDown.delay(50).duration(500)}>
            <GlassCard variant="gold" style={styles.banner}>
              <Sparkles size={20} color={Colors.gold.metallic} />
              <View style={{ flex: 1 }}>
                <Text style={[Typography.labelLarge, { color: Colors.gold.metallic }]}>
                  {t('dashboard.upgrade')}
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.secondary, marginTop: 2 }]}>
                  {t('dashboard.upgradeMessage')}
                </Text>
              </View>
            </GlassCard>
          </Animated.View>
        )}

        {/* Connect Google banner */}
        {user?.isAnonymous && (
          <Animated.View entering={FadeInDown.delay(100).duration(500)}>
            <GlassCard
              variant="purple"
              style={styles.banner}
              pressable
              onPress={() => router.push('/(auth)/connect-google')}
            >
              <Text style={styles.bannerEmoji}>🧠</Text>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.labelLarge, { color: Colors.purple[300] }]}>
                  {t('auth.unlockAIFeatures')}
                </Text>
                <Text style={[Typography.bodySmall, { color: Colors.text.secondary, marginTop: 2 }]}>
                  {t('auth.unlockAISubtitle')}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.purple[300]} />
            </GlassCard>
          </Animated.View>
        )}

        {/* Stats grid */}
        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.statsGrid}>
          <StatCard
            icon={BookOpen}
            color={Colors.purple[400]}
            value={progress?.total_lessons ?? 0}
            label={t('dashboard.totalLessons')}
            subtitle={lessons && lessons.length > 0
              ? `${lessons.length} ${t('dashboard.total')}`
              : t('dashboard.startFirst')}
          />
          <StatCard
            icon={Clock}
            color={Colors.info}
            value={`${Math.round((progress?.study_time_today_minutes ?? 0) / 60 * 10) / 10}h`}
            label={t('dashboard.studyTime')}
            subtitle={t('dashboard.minTotal', { count: progress?.total_study_time_minutes ?? 0 })}
          />
          <StatCard
            icon={Dumbbell}
            color={Colors.success}
            value={progress?.exercises_completed ?? 0}
            label={t('dashboard.exercises')}
            subtitle={`${progress?.exercises_attempted ?? 0} ${t('dashboard.attempted')}`}
          />
          <StatCard
            icon={Flame}
            color={Colors.warning}
            value={progress?.streak_days ?? 0}
            label={t('dashboard.streak')}
            subtitle={t('dashboard.daysInARow')}
          />
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <View style={styles.sectionHeader}>
            <Text style={Typography.headlineSmall}>{t('dashboard.quickActions')}</Text>
          </View>
          <View style={styles.actionsRow}>
            <GlassCard
              variant="elevated"
              pressable
              onPress={() => router.push('/lesson/new')}
              style={styles.actionCard}
            >
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                <Plus size={24} color={Colors.purple[300]} />
              </View>
              <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>
                {t('dashboard.createLesson')}
              </Text>
            </GlassCard>
            <GlassCard
              variant="default"
              pressable
              onPress={() => router.push('/(tabs)/practice')}
              style={styles.actionCard}
            >
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
                <Dumbbell size={24} color={Colors.gold.metallic} />
              </View>
              <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>
                {t('dashboard.exercises')}
              </Text>
            </GlassCard>
            <GlassCard
              variant="default"
              pressable
              onPress={() => router.push('/(tabs)/progress')}
              style={styles.actionCard}
            >
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(96, 165, 250, 0.15)' }]}>
                <TrendingUp size={24} color="#60A5FA" />
              </View>
              <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]}>
                {t('dashboard.studyTime')}
              </Text>
            </GlassCard>
          </View>
        </Animated.View>

        {/* Recent lessons */}
        <Animated.View entering={FadeInDown.delay(250).duration(500)}>
          <View style={styles.sectionHeader}>
            <Text style={Typography.headlineSmall}>{t('dashboard.recentLessons')}</Text>
            {lessons && lessons.length > 0 && (
              <Pressable
                onPress={() => router.push('/(tabs)/lessons')}
                accessibilityRole="link"
                accessibilityLabel={t('dashboard.seeAll')}
              >
                <Text style={[Typography.labelLarge, { color: Colors.gold.metallic }]}>
                  {t('dashboard.seeAll')}
                </Text>
              </Pressable>
            )}
          </View>

          {lessons && lessons.length > 0 ? (
            <View style={{ gap: Spacing[3] }}>
              {lessons.slice(0, 3).map((lesson) => (
                <GlassCard
                  key={lesson.id}
                  pressable
                  onPress={() => router.push(`/lesson/${lesson.id}`)}
                >
                  <View style={styles.lessonRow}>
                    <View style={[styles.lessonIcon, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                      <BookOpen size={20} color={Colors.purple[300]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]} numberOfLines={1}>
                        {lesson.title}
                      </Text>
                      <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]} numberOfLines={1}>
                        {lesson.subject} • {lesson.level}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={Colors.text.tertiary} />
                  </View>
                </GlassCard>
              ))}
            </View>
          ) : (
            <GlassCard variant="default" style={{ alignItems: 'center', padding: Spacing[8] }}>
              <Text style={styles.emptyEmoji}>📚</Text>
              <Text style={[Typography.headlineSmall, { marginTop: Spacing[3] }]}>
                {t('dashboard.noLessonsYet')}
              </Text>
              <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, textAlign: 'center', marginTop: Spacing[2] }]}>
                {t('dashboard.noLessonsSubtitle')}
              </Text>
              <GlassButton
                variant="primary"
                onPress={() => router.push('/lesson/new')}
                style={{ marginTop: Spacing[4] }}
                icon={<Plus size={18} color="#FFFFFF" />}
              >
                {t('dashboard.createLesson')}
              </GlassButton>
            </GlassCard>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const StatCard = ({ icon: Icon, color, value, label, subtitle }: { icon: any; color: string; value: string | number; label: string; subtitle?: string }) => (
  <GlassCard variant="default" style={styles.statCard}>
    <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
      <Icon size={20} color={color} />
    </View>
    <Text style={[Typography.displaySmall, { color: '#FFFFFF', fontSize: 28, marginTop: Spacing[2] }]}>
      {value}
    </Text>
    <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, marginTop: 2 }]} numberOfLines={1}>
      {label}
    </Text>
    {subtitle && (
      <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
        {subtitle}
      </Text>
    )}
  </GlassCard>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  bannerEmoji: {
    fontSize: 28,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
    marginBottom: Spacing[6],
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    padding: Spacing[4],
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[6],
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing[3],
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  lessonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
  },
});
