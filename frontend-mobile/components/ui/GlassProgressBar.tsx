/**
 * GlassProgressBar — animated progress with gradient fill.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';

export interface GlassProgressBarProps {
  progress: number; // 0..1
  height?: number;
  showLabel?: boolean;
  label?: string;
  gradient?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  animated?: boolean;
}

export const GlassProgressBar: React.FC<GlassProgressBarProps> = ({
  progress,
  height = 8,
  showLabel = false,
  label,
  gradient = [Colors.purple[400], Colors.purple[300], '#A78BFA'] as const,
  style,
  animated = true,
}) => {
  const progressValue = useSharedValue(0);

  useEffect(() => {
    progressValue.value = animated
      ? withTiming(Math.max(0, Math.min(1, progress)), {
          duration: 600,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })
      : progress;
  }, [progress, animated, progressValue]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`,
  }));

  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={style}>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={[Typography.labelSmall, { color: Colors.text.secondary }]}>
            {label || 'Progress'}
          </Text>
          <Text style={[Typography.labelSmall, { color: Colors.text.gold }]}>
            {Math.round(clamped * 100)}%
          </Text>
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <Animated.View style={[fillStyle, { borderRadius: height / 2, overflow: 'hidden' }]}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { height, borderRadius: height / 2 }]}
          />
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  track: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
  },
});
