/**
 * GlassInput — Liquid glass text input with focus glow.
 */

import React from 'react';
import { TextInput, View, StyleSheet, TextInputProps, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/spacing';
import { Typography, FontFamily } from '../../constants/typography';

export interface GlassInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: object;
  inputStyle?: TextInputProps['style'];
}

export const GlassInput: React.FC<GlassInputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...textInputProps
}) => {
  const focusGlow = useSharedValue(0);

  const containerStyleAnim = useAnimatedStyle(() => ({
    borderColor: focusGlow.value > 0
      ? error ? Colors.error : 'rgba(168, 85, 247, 0.6)'
      : error ? Colors.error : Colors.glass.border,
    shadowColor: focusGlow.value > 0
      ? error ? Colors.error : Colors.purple[400]
      : 'transparent',
    shadowOpacity: focusGlow.value * 0.4,
    shadowRadius: focusGlow.value * 8,
  }));

  const handleFocus = (e: any) => {
    focusGlow.value = withTiming(1, { duration: 200 });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    focusGlow.value = withTiming(0, { duration: 200 });
    onBlur?.(e);
  };

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[Typography.labelSmall, styles.label]}>{label}</Text>
      )}
      <Animated.View style={[styles.container, containerStyleAnim]}>
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          style={[styles.input, leftIcon ? styles.inputWithLeftIcon : null, rightIcon ? styles.inputWithRightIcon : null, inputStyle]}
          placeholderTextColor={Colors.text.tertiary}
          selectionColor={Colors.purple[400]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...textInputProps}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </Animated.View>
      {error ? (
        <Text style={[Typography.bodySmall, styles.error]}>{error}</Text>
      ) : hint ? (
        <Text style={[Typography.bodySmall, styles.hint]}>{hint}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    marginBottom: Spacing[2],
    color: Colors.text.secondary,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    color: '#FFFFFF',
    fontFamily: FontFamily.interRegular,
    fontSize: 15,
  },
  inputWithLeftIcon: { paddingLeft: Spacing[2] },
  inputWithRightIcon: { paddingRight: Spacing[2] },
  leftIcon: { paddingLeft: Spacing[3] },
  rightIcon: { paddingRight: Spacing[3] },
  error: { marginTop: Spacing[1], color: Colors.error },
  hint: { marginTop: Spacing[1], color: Colors.text.tertiary },
});
