/**
 * GlassButton — Liquid glass button with variants and press animation.
 * Variants: primary, secondary, ghost, error, gold
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
  AccessibilityRole,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/spacing';
import { FontFamily } from '../../constants/typography';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'error' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface GlassButtonProps {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: import('react-native').StyleProp<ViewStyle>;
  textStyle?: import('react-native').StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  testID?: string;
}

const variantStyles: Record<ButtonVariant, {
  bg: string; border: string; textColor: string; gradient?: [string, string, string];
}> = {
  primary: {
    bg: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.4)',
    textColor: '#FFFFFF',
    gradient: ['rgba(168, 85, 247, 0.2)', 'rgba(139, 92, 246, 0.3)', 'rgba(168, 85, 247, 0.2)'],
  },
  secondary: {
    bg: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.1)',
    textColor: '#FFFFFF',
  },
  ghost: {
    bg: 'transparent',
    border: 'transparent',
    textColor: Colors.text.gold,
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    textColor: '#FFFFFF',
  },
  gold: {
    bg: 'rgba(255, 215, 0, 0.1)',
    border: 'rgba(255, 215, 0, 0.4)',
    textColor: Colors.gold.metallic,
    gradient: ['rgba(255, 215, 0, 0.15)', 'rgba(255, 200, 0, 0.25)', 'rgba(255, 215, 0, 0.15)'],
  },
};

const sizeStyles: Record<ButtonSize, {
  paddingV: number; paddingH: number; fontSize: number; height: number; iconSize: number;
}> = {
  sm: { paddingV: Spacing[2], paddingH: Spacing[3], fontSize: 13, height: 36, iconSize: 16 },
  md: { paddingV: Spacing[3], paddingH: Spacing[4], fontSize: 15, height: 44, iconSize: 18 },
  lg: { paddingV: Spacing[4], paddingH: Spacing[5], fontSize: 17, height: 52, iconSize: 22 },
};

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onPress,
  onLongPress,
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  testID,
}) => {
  const variantCfg = variantStyles[variant];
  const sizeCfg = sizeStyles[size];
  const pressScale = useSharedValue(1);
  const pressOpacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    opacity: pressOpacity.value,
  }));

  const handlePressIn = () => {
    if (disabled || loading) return;
    pressScale.value = withSpring(0.96, { damping: 18, stiffness: 400 });
    pressOpacity.value = withTiming(0.85, { duration: 100 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 18, stiffness: 400 });
    pressOpacity.value = withTiming(1, { duration: 200 });
  };

  return (
    <Animated.View
      style={[
        styles.outer,
        {
          backgroundColor: variantCfg.bg,
          borderColor: variantCfg.border,
          minHeight: sizeCfg.height,
          paddingVertical: sizeCfg.paddingV,
          paddingHorizontal: sizeCfg.paddingH,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.5 : 1,
        },
        animatedStyle,
        style,
      ]}
    >
      <Pressable
        onPress={disabled || loading ? undefined : onPress}
        onLongPress={disabled || loading ? undefined : onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, busy: loading }}
        testID={testID}
        style={styles.pressable}
      >
        {variantCfg.gradient && (
          <LinearGradient
            colors={variantCfg.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {variant !== 'ghost' && <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />}
        <View style={styles.contentRow}>
          {loading ? (
            <ActivityIndicator size="small" color={variantCfg.textColor} />
          ) : (
            <>
              {icon && iconPosition === 'left' && (
                <View style={[styles.icon, { marginRight: Spacing[2] }]}>{icon}</View>
              )}
              {typeof children === 'string' ? (
                <Text
                  style={[
                    {
                      color: variantCfg.textColor,
                      fontSize: sizeCfg.fontSize,
                      fontFamily: FontFamily.interSemiBold,
                      fontWeight: '600',
                    },
                    textStyle,
                  ]}
                  numberOfLines={1}
                >
                  {children}
                </Text>
              ) : (
                children
              )}
              {icon && iconPosition === 'right' && (
                <View style={[styles.icon, { marginLeft: Spacing[2] }]}>{icon}</View>
              )}
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  outer: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
