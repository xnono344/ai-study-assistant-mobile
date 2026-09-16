/**
 * GlassCard — Liquid glass surface with blur, animated press, glow on press.
 * Variants: default, elevated, gold, purple, error
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable, AccessibilityRole } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, ColorVariant } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/spacing';

export interface GlassCardProps {
  children: React.ReactNode;
  variant?: ColorVariant;
  pressable?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: import('react-native').StyleProp<ViewStyle>;
  contentStyle?: import('react-native').StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  testID?: string;
  glowOnPress?: boolean;
}

const variantConfig: Record<ColorVariant, {
  bg: string; border: string; blur: number; glow: string;
}> = {
  default: {
    bg: 'rgba(255, 255, 255, 0.03)',
    border: Colors.glass.border,
    blur: 24,
    glow: 'rgba(168, 85, 247, 0.3)',
  },
  elevated: {
    bg: 'rgba(168, 85, 247, 0.08)',
    border: 'rgba(168, 85, 247, 0.25)',
    blur: 32,
    glow: 'rgba(168, 85, 247, 0.5)',
  },
  gold: {
    bg: 'rgba(255, 215, 0, 0.06)',
    border: Colors.glass.borderGold,
    blur: 28,
    glow: 'rgba(255, 215, 0, 0.4)',
  },
  purple: {
    bg: 'rgba(168, 85, 247, 0.1)',
    border: 'rgba(168, 85, 247, 0.3)',
    blur: 28,
    glow: 'rgba(168, 85, 247, 0.6)',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.3)',
    blur: 28,
    glow: 'rgba(239, 68, 68, 0.4)',
  },
};

// Per-variant gradient table. The previous implementation tried to derive
// gradient stops via `cfg.border.replace('0.3', '0')`, which silently failed
// because the default/elevated/purple borders use '0.18' or '0.25' — they
// never contained '0.3'. That left those variants with the fallback purple
// gradient regardless of variant. Use an explicit table instead.
const variantGradient: Record<ColorVariant, readonly [string, string, string]> = {
  default: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0)'],
  elevated: ['rgba(168, 85, 247, 0)', 'rgba(168, 85, 247, 0.18)', 'rgba(168, 85, 247, 0)'],
  gold: ['rgba(255, 215, 0, 0)', 'rgba(255, 215, 0, 0.18)', 'rgba(255, 215, 0, 0)'],
  purple: ['rgba(168, 85, 247, 0)', 'rgba(168, 85, 247, 0.25)', 'rgba(168, 85, 247, 0)'],
  error: ['rgba(239, 68, 68, 0)', 'rgba(239, 68, 68, 0.18)', 'rgba(239, 68, 68, 0)'],
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  variant = 'default',
  pressable = false,
  onPress,
  onLongPress,
  style,
  contentStyle,
  accessibilityLabel,
  accessibilityRole = 'none',
  accessibilityHint,
  testID,
  glowOnPress = true,
}) => {
  const cfg = variantConfig[variant];
  const pressScale = useSharedValue(1);
  const pressGlow = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    shadowColor: cfg.glow,
    shadowOpacity: pressGlow.value * 0.6,
    shadowRadius: pressGlow.value * 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4 + pressGlow.value * 8,
  }));

  /* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable animation handles. */
  const handlePressIn = () => {
    pressScale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
    if (glowOnPress) pressGlow.value = withTiming(1, { duration: 150 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 20, stiffness: 300 });
    if (glowOnPress) pressGlow.value = withTiming(0, { duration: 300 });
  };
  /* eslint-enable react-hooks/immutability */

  const gradientColors: readonly [string, string, string] = variantGradient[variant];

  const Container = pressable ? Pressable : View;

  return (
    <Animated.View style={[styles.outer, { borderColor: cfg.border, backgroundColor: cfg.bg }, animatedStyle, style]}>
      <Container
        onPress={pressable ? onPress : undefined}
        onLongPress={pressable ? onLongPress : undefined}
        onPressIn={pressable ? handlePressIn : undefined}
        onPressOut={pressable ? handlePressOut : undefined}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={styles.touchable}
      >
        <BlurView intensity={cfg.blur} style={StyleSheet.absoluteFill} tint="dark" />
        <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </Container>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  outer: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  touchable: {
    width: '100%',
  },
  content: {
    padding: Spacing[4],
  },
});
