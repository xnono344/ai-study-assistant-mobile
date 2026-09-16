/**
 * Animation tokens — spring configs and durations.
 * All animations run on UI thread via Reanimated 3 for 60fps.
 */

import { withSpring, withTiming, Easing } from 'react-native-reanimated';

export const SpringConfig = {
  // Gentle — tab indicator, page transitions
  gentle: { damping: 25, stiffness: 200, mass: 1 },

  // Snappy — buttons, toggles
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },

  // Bouncy — logo, celebrations
  bouncy: { damping: 12, stiffness: 250, mass: 0.6 },

  // Stiff — quick acknowledgments
  stiff: { damping: 30, stiffness: 400, mass: 0.5 },
} as const;

export const Duration = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  page: 350,
} as const;

export const EasingFn = {
  standard: Easing.bezier(0.2, 0.0, 0, 1),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1),
  accelerate: Easing.bezier(0.3, 0.0, 1, 1),
  spring: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

export const wSpring = (to: number, config: keyof typeof SpringConfig = 'gentle') =>
  withSpring(to, SpringConfig[config]);

export const wTiming = (to: number, duration: number = Duration.normal) =>
  withTiming(to, { duration, easing: EasingFn.standard });
