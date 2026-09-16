/**
 * MagicalTabBar — Bottom tab bar with spring indicator + ambient particles.
 * Tab switch is silky-smooth via Reanimated 3 worklets.
 */

import React, { useEffect, useMemo } from 'react';
import { View, Pressable, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Home, BookOpen, Zap, TrendingUp, Settings } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { Spacing, Shadow } from '../../constants/spacing';
import { FontFamily } from '../../constants/typography';
import { SpringConfig } from '../../constants/animation';
import { useT } from '../../hooks/useT';

export interface TabItem {
  name: string;
  label: string;
  icon: 'home' | 'book' | 'zap' | 'trending' | 'settings';
  badge?: number;
}

// Icon-only spec — labels are resolved at render time via i18n so the tab
// bar respects the active locale (EN/FR/AR) instead of being hardcoded.
const TAB_SPEC: { name: string; icon: TabItem['icon']; labelKey: string }[] = [
  { name: 'dashboard', icon: 'home', labelKey: 'dashboard.title' },
  { name: 'lessons', icon: 'book', labelKey: 'lessons.title' },
  { name: 'practice', icon: 'zap', labelKey: 'practice.title' },
  { name: 'progress', icon: 'trending', labelKey: 'progress.yourProgress' },
  { name: 'settings', icon: 'settings', labelKey: 'settings.title' },
];

type IconName = TabItem['icon'];

const Icon = ({ name, color, size }: { name: IconName; color: string; size: number }): React.JSX.Element => {
  const props = { size, color, strokeWidth: 2.2 } as const;
  switch (name) {
    case 'home': return <Home {...props} />;
    case 'book': return <BookOpen {...props} />;
    case 'zap': return <Zap {...props} />;
    case 'trending': return <TrendingUp {...props} />;
    case 'settings': return <Settings {...props} />;
  }
};

export interface MagicalTabBarProps {
  activeTab: string;
  onTabPress: (name: string) => void;
  tabWidth: number;
  badges?: Record<string, number>;
}

export const MagicalTabBar: React.FC<MagicalTabBarProps> = ({
  activeTab,
  onTabPress,
  tabWidth,
  badges = {},
}) => {
  const { t } = useT();
  // Resolve labels from i18n so a locale switch updates tab text without
  // remounting the bar. Stable identity for the rest of the component.
  const TABS: TabItem[] = useMemo(
    () => TAB_SPEC.map((s) => ({ name: s.name, icon: s.icon, label: t(s.labelKey) })),
    [t]
  );
  const activeIndex = Math.max(0, TABS.findIndex((tb) => tb.name === activeTab));
  const indicatorX = useSharedValue(activeIndex * tabWidth);
  const particlePhase = useSharedValue(0);

  useEffect(() => {
    indicatorX.value = withSpring(activeIndex * tabWidth, SpringConfig.gentle);
  }, [activeIndex, tabWidth, indicatorX]);

  useEffect(() => {
    particlePhase.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
  }, [particlePhase]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View style={styles.container}>
      <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
      <View style={styles.borderTop} />

      {/* Ambient particles */}
      {Array.from({ length: 6 }).map((_, i) => (
        <AmbientParticle key={i} index={i} phase={particlePhase} />
      ))}

      <View style={styles.tabsRow}>
        {/* Animated indicator */}
        <Animated.View
          style={[
            styles.indicator,
            { width: tabWidth * 0.6 },
            indicatorStyle,
          ]}
        />

        {TABS.map((tab, index) => {
          const isActive = index === activeIndex;
          return (
            <Pressable
              key={tab.name}
              onPress={() => onTabPress(tab.name)}
              style={[styles.tab, { width: tabWidth }]}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityHint={`Navigate to ${tab.label} tab`}
              accessibilityState={{ selected: isActive }}
              testID={`tab-${tab.name}`}
            >
              <TabIcon
                icon={tab.icon}
                isActive={isActive}
              />
              <Text
                style={[
                  styles.label,
                  { color: isActive ? Colors.text.gold : Colors.text.tertiary },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {badges[tab.name] ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badges[tab.name]}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const TabIcon: React.FC<{
  icon: TabItem['icon'];
  isActive: boolean;
}> = ({ icon, isActive }) => {
  const scale = useSharedValue(isActive ? 1.1 : 1);

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.15 : 1, { damping: 18, stiffness: 280 });
  }, [isActive, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Icon name={icon} color={isActive ? Colors.text.gold : Colors.text.tertiary} size={22} />
    </Animated.View>
  );
};

const AmbientParticle: React.FC<{ index: number; phase: SharedValue<number> }> = ({
  index,
  phase,
}) => {
  const baseX = (index + 0.5) * 80;
  const animatedStyle = useAnimatedStyle(() => {
    const y = interpolate(
      Math.sin(phase.value + index) * 2 + 1,
      [-1, 1],
      [4, 12],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      Math.sin(phase.value + index) + 1,
      [0, 2],
      [0.2, 0.5],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateX: baseX }, { translateY: y }],
      opacity,
    };
  });

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no"
      style={[
        styles.particle,
        {
          backgroundColor: index % 2 === 0 ? Colors.purple[400] : Colors.gold.metallic,
          shadowColor: index % 2 === 0 ? Colors.purple[400] : Colors.gold.metallic,
        },
        animatedStyle,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 84,
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    overflow: 'hidden',
    ...Shadow.lg,
  },
  borderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.glass.border,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[2],
  },
  indicator: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.gold.metallic,
    shadowColor: Colors.gold.metallic,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    fontSize: 10,
    fontFamily: FontFamily.interMedium,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: '30%',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.purple[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  particle: {
    position: 'absolute',
    top: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
