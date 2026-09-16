/**
 * Progress — REAL-TIME progress with auto-refresh, live activity ring, dynamic charts.
 * Fully translated (EN/FR/AR). French default.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withRepeat, Easing } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { CircleProps } from 'react-native-svg';
import { Clock, Flame, TrendingUp, RefreshCw, Target, Zap, BookOpen } from 'lucide-react-native';
import { GlassCard } from '../../components/ui/GlassCard';
import { api, Progress as ProgressData } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing, Radius } from '../../constants/spacing';
import { useT } from '../../hooks/useT';
import { useAuth } from '../../hooks/useAuth';

// Local-tz YYYY-MM-DD formatter. toISOString() returns UTC, so dates near
// midnight would land on the wrong calendar day for the user — defeating
// streak/calendar logic for anyone not on UTC.
const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Pulse dot indicator for live activity
const PulseDot = ({ color = Colors.success }: { color?: string }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          marginRight: Spacing[2],
        },
        animatedStyle,
      ]}
    />
  );
};

// Animated ring card with icon center and animated progress stroke
const RingCard = ({
  icon: Icon, color, value, unit, label, progress, sublabel,
}: { icon: any; color: string; value: number | string; unit: string; label: string; progress: number; sublabel?: string }) => {
  const size = 90;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProgress = useSharedValue(0);
  // Only animate when the target actually changes — otherwise a refetch on
  // focus (which yields identical numbers) re-triggers the timing animation
  // and the ring pulses every time the user switches tabs.
  const prevProgress = useRef(progress);
  useEffect(() => {
    if (Math.abs(progress - prevProgress.current) > 0.001) {
      animatedProgress.value = withTiming(progress, {
        duration: 1200,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      prevProgress.current = progress;
    }
  }, [progress, animatedProgress]);

  const animatedCircleProps = useAnimatedProps<CircleProps>(() => ({
    strokeDasharray: `${circumference} ${circumference}`,
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <GlassCard
      variant="default"
      style={styles.ringCard}
      accessibilityLabel={`${label}: ${value} ${unit}`}
      accessibilityRole="summary"
    >
      <View style={styles.ringContainer}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255, 255, 255, 0.08)" strokeWidth={stroke} fill="transparent" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="transparent"
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            animatedProps={animatedCircleProps}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Icon size={20} color={color} />
        </View>
      </View>
      <View style={{ alignItems: 'center', marginTop: Spacing[2] }}>
        <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]}>
          {value}<Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}> {unit}</Text>
        </Text>
        <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, marginTop: 2 }]}>
          {label}
        </Text>
        {sublabel && (
          <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, fontSize: 10, marginTop: 2 }]} numberOfLines={1}>
            {sublabel}
          </Text>
        )}
      </View>
    </GlassCard>
  );
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Streak calendar (real, last 30 days from weekly data)
const StreakCalendar = ({ weekly, streak }: { weekly: NonNullable<ProgressData['weekly']>; streak: number }) => {
  const today = new Date();
  const cells: { date: Date; active: boolean; minutes: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayStr = formatLocalDate(d);
    const weekDay = weekly.find((w) => w.date === dayStr);
    cells.push({ date: d, active: (weekDay?.minutes ?? 0) > 0, minutes: weekDay?.minutes ?? 0 });
  }
  return (
    <View style={styles.calendar}>
      {Array.from({ length: 5 }).map((_, week) => (
        <View key={week} style={styles.calendarRow}>
          {cells.slice(week * 7, week * 7 + 7).map((cell, i) => {
            const intensity = cell.active ? Math.min(cell.minutes / 60, 1) : 0;
            return (
              <View
                key={i}
                style={[
                  styles.calendarCell,
                  cell.active && {
                    backgroundColor: streak > 7
                      ? `rgba(245, 158, 11, ${0.3 + intensity * 0.5})`
                      : `rgba(168, 85, 247, ${0.3 + intensity * 0.5})`,
                    borderWidth: cell.minutes > 30 ? 1.5 : 0,
                    borderColor: Colors.gold.metallic,
                  },
                ]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
};

export default function ProgressScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Real-time progress query with auto-refresh every 30s
  const { data: progress, isLoading, refetch, isFetching } = useQuery<ProgressData>({
    queryKey: ['progress', user?.id],
    queryFn: () => api.progress.get(),
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Refetch when screen comes into focus (e.g. user completes a section)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Derived real-time metrics
  const metrics = useMemo(() => {
    const totalMinutes = progress?.total_study_time_minutes ?? 0;
    const totalHours = totalMinutes / 60;
    const streak = progress?.streak_days ?? 0;
    const todayMinutes = progress?.study_time_today_minutes ?? 0;
    const weekMinutes = progress?.study_time_this_week_minutes ?? 0;
    const exercisesAttempted = progress?.exercises_attempted ?? 0;
    const exercisesCompleted = progress?.exercises_completed ?? 0;
    const accuracy = exercisesAttempted > 0
      ? Math.round((exercisesCompleted / exercisesAttempted) * 100)
      : 0;
    const totalLessons = progress?.total_lessons ?? 0;

    // Progress ring values (target-based for realistic visualization)
    const totalStudyProgress = Math.min(totalHours / 10, 1); // 10h = full ring
    const streakProgress = Math.min(streak / 30, 1); // 30 days = full ring
    const accuracyProgress = accuracy / 100;

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      streak,
      todayMinutes: Math.round(todayMinutes),
      weekMinutes,
      accuracy,
      totalLessons,
      exercisesAttempted,
      exercisesCompleted,
      totalStudyProgress,
      streakProgress,
      accuracyProgress,
    };
  }, [progress]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Find max minutes in week for chart scaling
  const weekData = useMemo(() => progress?.weekly ?? [], [progress?.weekly]);
  const maxWeekMinutes = useMemo(() => {
    return Math.max(60, ...weekData.map((d) => d.minutes || 0));
  }, [weekData]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gold.metallic}
            colors={[Colors.gold.metallic]}
          />
        }
      >
        {/* Header with live update indicator */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, fontSize: 28 }]}>
              {t('progress.yourProgress')}
            </Text>
            <View style={styles.liveRow}>
              <PulseDot color={Colors.success} />
              <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
                {isFetching ? t('progress.syncing') : t('progress.liveData')}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onRefresh}
            hitSlop={10}
            style={styles.refreshBtn}
            accessibilityLabel={t('common.refresh')}
            accessibilityRole="button"
            accessibilityState={{ busy: isFetching }}
          >
            <RefreshCw size={18} color={Colors.gold.metallic} />
          </Pressable>
        </Animated.View>

        {/* Top stats with animated rings */}
        <View style={styles.ringsRow}>
          <RingCard
            icon={Clock}
            color={Colors.purple[400]}
            value={metrics.totalHours}
            unit={t('progress.hours')}
            label={t('progress.totalStudy')}
            progress={metrics.totalStudyProgress}
            sublabel={`${metrics.weekMinutes} ${t('progress.thisWeek')}`}
          />
          <RingCard
            icon={Flame}
            color={Colors.warning}
            value={metrics.streak}
            unit={t('progress.days')}
            label={t('progress.streak')}
            progress={metrics.streakProgress}
            sublabel={metrics.streak > 0 ? `🔥 ${t('progress.active')}` : t('progress.startStreak')}
          />
          <RingCard
            icon={Target}
            color={Colors.gold.metallic}
            value={metrics.accuracy}
            unit="%"
            label={t('progress.accuracy')}
            progress={metrics.accuracyProgress}
            sublabel={`${metrics.exercisesCompleted}/${metrics.exercisesAttempted}`}
          />
        </View>

        {/* Today's activity card with live indicator */}
        <GlassCard variant="elevated" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Zap size={18} color={Colors.gold.metallic} />
              <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginLeft: Spacing[2] }]}>
                {t('progress.todayActivity')}
              </Text>
            </View>
            <View style={styles.liveBadge}>
              <PulseDot color={Colors.success} />
              <Text style={[Typography.labelSmall, { color: Colors.success }]}>LIVE</Text>
            </View>
          </View>
          <View style={styles.todayStats}>
            <View style={styles.todayStat}>
              <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, fontSize: 32 }]}>
                {metrics.todayMinutes}
              </Text>
              <Text style={[Typography.labelSmall, { color: Colors.text.tertiary }]}>
                {t('progress.minutesToday')}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.todayStat}>
              <Text style={[Typography.displaySmall, { color: Colors.purple[400], fontSize: 32 }]}>
                {metrics.totalLessons}
              </Text>
              <Text style={[Typography.labelSmall, { color: Colors.text.tertiary }]}>
                {t('progress.totalLessonsLabel')}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Weekly bar chart with real data */}
        <GlassCard variant="default" style={styles.card}>
          <View style={styles.cardHeader}>
            <TrendingUp size={18} color={Colors.gold.metallic} />
            <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginLeft: Spacing[2] }]}>
              {t('progress.thisWeek')}
            </Text>
            <Text style={[Typography.bodySmall, { color: Colors.text.tertiary, marginLeft: 'auto' }]}>
              {metrics.weekMinutes} {t('progress.min')}
            </Text>
          </View>
          <View style={styles.chartContainer}>
            <View style={styles.chartBars}>
              {weekData.map((day, i) => {
                const heightPct = Math.max((day.minutes / maxWeekMinutes) * 100, day.minutes > 0 ? 4 : 0);
                const isToday = i === weekData.length - 1;
                const dayDate = new Date(day.date);
                return (
                  <View key={day.date || i} style={styles.barCol}>
                    <View style={styles.barValueWrap}>
                      {day.minutes > 0 && (
                        <Text style={[Typography.labelSmall, { color: isToday ? Colors.gold.metallic : Colors.text.tertiary, fontSize: 10 }]}>
                          {day.minutes}
                        </Text>
                      )}
                    </View>
                    <View style={styles.barWrapper}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${heightPct}%`,
                            backgroundColor: day.minutes > 0
                              ? isToday ? Colors.gold.metallic : Colors.purple[400]
                              : 'rgba(255, 255, 255, 0.06)',
                            borderWidth: isToday ? 1.5 : 0,
                            borderColor: Colors.gold.metallic,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[Typography.labelSmall, { color: isToday ? Colors.gold.metallic : Colors.text.tertiary, marginTop: 6, fontSize: 11 }]}>
                      {day.day}
                    </Text>
                    <Text style={[Typography.labelSmall, { color: Colors.text.tertiary, fontSize: 9, opacity: 0.6 }]}>
                      {dayDate.getDate()}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </GlassCard>

        {/* Streak calendar (real, last 30 days) */}
        <GlassCard variant="default" style={styles.card}>
          <View style={styles.cardHeader}>
            <Flame size={18} color={Colors.warning} />
            <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginLeft: Spacing[2] }]}>
              {t('progress.streakCalendar')}
            </Text>
            <View style={styles.streakBadge}>
              <Text style={[Typography.labelSmall, { color: Colors.warning, fontWeight: '700' }]}>
                {metrics.streak} 🔥
              </Text>
            </View>
          </View>
          <StreakCalendar weekly={weekData} streak={metrics.streak} />
        </GlassCard>

        {/* Per-lesson progress with real data */}
        {progress?.per_lesson && progress.per_lesson.length > 0 && (
          <GlassCard variant="default" style={styles.card}>
            <View style={styles.cardHeader}>
              <BookOpen size={18} color={Colors.gold.metallic} />
              <Text style={[Typography.headlineSmall, { color: '#FFFFFF', marginLeft: Spacing[2] }]}>
                {t('progress.perLesson')}
              </Text>
            </View>
            <View style={styles.lessonList}>
              {progress.per_lesson.map((lesson) => (
                <Animated.View
                  key={lesson.lesson_id}
                  entering={FadeIn.delay(50).duration(300)}
                  style={styles.lessonItem}
                >
                  <View style={styles.lessonInfo}>
                    <Text style={[Typography.bodyMedium, { color: '#FFFFFF' }]} numberOfLines={1}>
                      {lesson.title}
                    </Text>
                    <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]} numberOfLines={1}>
                      {lesson.subject} • {t('progress.sections', { done: lesson.sections_completed, total: lesson.sections_total })}
                    </Text>
                  </View>
                  <View style={styles.lessonProgressCol}>
                    <View style={styles.lessonProgressBar}>
                      <View style={[styles.lessonProgressFill, { width: `${lesson.progress_pct}%` }]} />
                    </View>
                    <Text style={[Typography.labelSmall, { color: Colors.gold.metallic, marginLeft: Spacing[2], minWidth: 36, textAlign: 'right' }]}>
                      {lesson.progress_pct}%
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Empty state */}
        {(!progress || progress.total_lessons === 0) && !isLoading && (
          <Animated.View entering={FadeIn} style={styles.empty}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={[Typography.headlineSmall, { marginTop: Spacing[3], textAlign: 'center' }]}>
              {t('progress.noProgressYet')}
            </Text>
            <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, textAlign: 'center', marginTop: Spacing[2] }]}>
              {t('progress.noProgressSubtitle')}
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: 140 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing[5],
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing[1],
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  ringCard: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing[3],
  },
  ringContainer: { position: 'relative' },
  ringCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  card: { marginTop: Spacing[3] },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: Radius.sm,
  },
  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayStat: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 40, backgroundColor: Colors.glass.border },
  chartContainer: { marginTop: Spacing[3] },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
  },
  barCol: { alignItems: 'center', width: 36 },
  barValueWrap: { height: 14, justifyContent: 'flex-end' },
  barWrapper: { width: 28, height: 100, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6 },
  streakBadge: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: Radius.sm,
  },
  lessonList: { marginTop: Spacing[3], gap: Spacing[3] },
  lessonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[3],
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  lessonInfo: { flex: 1, marginRight: Spacing[3] },
  lessonProgressCol: { flexDirection: 'row', alignItems: 'center' },
  lessonProgressBar: {
    width: 80,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  lessonProgressFill: {
    height: '100%',
    backgroundColor: Colors.gold.metallic,
    borderRadius: 3,
  },
  calendar: { marginTop: Spacing[3], gap: 4 },
  calendarRow: { flexDirection: 'row', gap: 4 },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 4,
  },
  empty: { alignItems: 'center', paddingVertical: Spacing[8] },
  emptyEmoji: { fontSize: 64 },
});
