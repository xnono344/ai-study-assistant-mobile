/**
 * Lessons list — search, filter, swipe actions, progress ring.
 * Fully translated (EN/FR/AR).
 */

import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, BookOpen, Plus, Trash2 } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlassCard } from '../../components/ui/GlassCard';
import { GlassButton } from '../../components/ui/GlassButton';
import { GlassInput } from '../../components/ui/GlassInput';
import { api, LessonSummary } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Spacing } from '../../constants/spacing';
import { useT } from '../../hooks/useT';

export default function LessonsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useT();
  const [search, setSearch] = useState('');

  const { data: lessons, isLoading, refetch } = useQuery<LessonSummary[]>({
    queryKey: ['lessons'],
    queryFn: () => api.lessons.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.lessons.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lessons'] }),
  });

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return (lessons ?? []).filter((l) => {
      const title = l.title?.toLowerCase() ?? '';
      const subject = l.subject?.toLowerCase() ?? '';
      return title.includes(needle) || subject.includes(needle);
    });
  }, [lessons, search]);

  // Memoized renderItem so FlatList can skip work when the parent re-renders
  // for unrelated state changes (search keystrokes, query refetch flicker).
  const renderLessonItem = useCallback(({ item, index }: { item: LessonSummary; index: number }) => (
    <Animated.View entering={FadeIn.delay(index * 30).duration(300)}>
      <GlassCard
        pressable
        onPress={() => router.push(`/lesson/${item.id}`)}
        accessibilityLabel={`${t('lessons.title')}: ${item.title}`}
      >
        <View style={styles.lessonRow}>
          <View style={[styles.lessonIcon, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
            <BookOpen size={20} color={Colors.purple[300]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[Typography.headlineSmall, { color: '#FFFFFF' }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.metaRow}>
              <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
                {item.subject}
              </Text>
              <View style={styles.dot} />
              <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
                {item.level}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              deleteMutation.mutate(item.id);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={t('lessons.deleteLesson', { title: item.title })}
          >
            <Trash2 size={18} color={Colors.error} />
          </Pressable>
        </View>
      </GlassCard>
    </Animated.View>
  ), [router, t, deleteMutation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.displaySmall, { color: Colors.gold.metallic, fontSize: 28 }]}>
            {t('lessons.title')}
          </Text>
          <Text style={[Typography.bodySmall, { color: Colors.text.tertiary }]}>
            {t('lessons.lessonsCount', { count: filtered.length })}
          </Text>
        </View>
        <GlassButton
          variant="primary"
          onPress={() => router.push('/lesson/new')}
          icon={<Plus size={18} color="#FFFFFF" />}
          accessibilityLabel={t('dashboard.createLesson')}
        >
          {t('lessons.new')}
        </GlassButton>
      </View>

      <View style={styles.searchRow}>
        <GlassInput
          placeholder={t('lessons.search')}
          value={search}
          onChangeText={setSearch}
          leftIcon={<Search size={16} color={Colors.text.tertiary} />}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={Colors.gold.metallic}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing[3] }} />}
        ListEmptyComponent={
          !isLoading ? (
            <Animated.View entering={FadeIn} style={styles.empty}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={[Typography.headlineSmall, { marginTop: Spacing[3] }]}>
                {search ? t('lessons.emptySearch') : t('lessons.empty')}
              </Text>
              <Text style={[Typography.bodyMedium, { color: Colors.text.tertiary, textAlign: 'center', marginTop: Spacing[2] }]}>
                {search
                  ? t('lessons.emptySearchSubtitle')
                  : t('lessons.emptySubtitle')}
              </Text>
              {!search && (
                <GlassButton
                  variant="primary"
                  onPress={() => router.push('/lesson/new')}
                  style={{ marginTop: Spacing[4] }}
                  icon={<Plus size={18} color="#FFFFFF" />}
                >
                  {t('lessons.createFirst')}
                </GlassButton>
              )}
            </Animated.View>
          ) : null
        }
        renderItem={renderLessonItem}
      />
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[4],
  },
  searchRow: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
  },
  list: {
    paddingHorizontal: Spacing[4],
    paddingBottom: 120,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  lessonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.text.tertiary,
  },
  deleteBtn: {
    padding: Spacing[2],
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing[16],
    paddingHorizontal: Spacing[8],
  },
  emptyEmoji: {
    fontSize: 64,
  },
});
