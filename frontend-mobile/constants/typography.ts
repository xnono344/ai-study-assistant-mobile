/**
 * Typography system — bright, readable, metallic gold for headlines.
 * Bundled locally: Inter (Latin) + Noto Naskh Arabic.
 */

import { Platform, TextStyle } from 'react-native';

export const FontFamily = {
  // Latin: Inter Variable
  interRegular: 'Inter-Regular',
  interMedium: 'Inter-Medium',
  interSemiBold: 'Inter-SemiBold',
  interBold: 'Inter-Bold',
  interExtraBold: 'Inter-ExtraBold',

  // Arabic: Noto Naskh Arabic
  amiriRegular: 'NotoNaskhArabic-Regular',
  amiriBold: 'NotoNaskhArabic-Bold',

  // Display fallback uses the bundled Inter face.
  nexusDisplay: 'Inter-Bold',
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
} as const;

export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
  loose: 2,
} as const;

const GOLD = '#FFD700';
const WHITE = '#FFFFFF';
const WHITE_72 = 'rgba(255, 255, 255, 0.72)';
const WHITE_92 = 'rgba(255, 255, 255, 0.92)';
const WHITE_60 = 'rgba(255, 255, 255, 0.6)';
const WHITE_80 = 'rgba(255, 255, 255, 0.8)';

export const Typography: Record<string, TextStyle> = {
  // ── DISPLAY / HEADLINES — METALLIC GOLD ──
  displayLarge: {
    fontFamily: FontFamily.nexusDisplay,
    fontSize: FontSize['5xl'],
    lineHeight: FontSize['5xl'] * LineHeight.tight,
    letterSpacing: 0.06,
    fontWeight: '700',
    color: GOLD,
    textShadowColor: 'rgba(255, 215, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  displayMedium: {
    fontFamily: FontFamily.nexusDisplay,
    fontSize: FontSize['4xl'],
    lineHeight: FontSize['4xl'] * LineHeight.tight,
    letterSpacing: 0.04,
    fontWeight: '600',
    color: GOLD,
    textShadowColor: 'rgba(255, 215, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  displaySmall: {
    fontFamily: FontFamily.nexusDisplay,
    fontSize: FontSize['3xl'],
    lineHeight: FontSize['3xl'] * LineHeight.tight,
    letterSpacing: 0.02,
    fontWeight: '600',
    color: GOLD,
  },

  // ── HEADLINES (white) ──
  headlineLarge: {
    fontFamily: FontFamily.interBold,
    fontSize: FontSize['2xl'],
    lineHeight: FontSize['2xl'] * LineHeight.tight,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: -0.01,
  },
  headlineMedium: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: FontSize.xl,
    lineHeight: FontSize.xl * LineHeight.tight,
    fontWeight: '600',
    color: WHITE,
  },
  headlineSmall: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: FontSize.lg,
    lineHeight: FontSize.lg * LineHeight.tight,
    fontWeight: '600',
    color: WHITE,
  },

  // ── BODY (bright & readable) ──
  bodyLarge: {
    fontFamily: FontFamily.interRegular,
    fontSize: FontSize.lg,
    lineHeight: FontSize.lg * LineHeight.normal,
    fontWeight: '400',
    color: WHITE,
  },
  bodyMedium: {
    fontFamily: FontFamily.interRegular,
    fontSize: FontSize.base,
    lineHeight: FontSize.base * LineHeight.normal,
    fontWeight: '400',
    color: WHITE_92,
  },
  bodySmall: {
    fontFamily: FontFamily.interRegular,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * LineHeight.normal,
    fontWeight: '400',
    color: WHITE_72,
  },

  // ── ARABIC VARIANTS ──
  arabicLarge: {
    fontFamily: FontFamily.amiriRegular,
    fontSize: FontSize.xl,
    lineHeight: FontSize.xl * LineHeight.loose,
    fontWeight: '400',
    color: WHITE,
  },
  arabicMedium: {
    fontFamily: FontFamily.amiriRegular,
    fontSize: FontSize.lg,
    lineHeight: FontSize.lg * LineHeight.relaxed,
    fontWeight: '400',
    color: WHITE_92,
  },
  arabicSmall: {
    fontFamily: FontFamily.amiriRegular,
    fontSize: FontSize.base,
    lineHeight: FontSize.base * LineHeight.relaxed,
    fontWeight: '400',
    color: WHITE_72,
  },
  arabicHeadline: {
    fontFamily: FontFamily.amiriBold,
    fontSize: FontSize['2xl'],
    lineHeight: FontSize['2xl'] * LineHeight.relaxed,
    fontWeight: '700',
    color: GOLD,
  },

  // ── LABELS ──
  labelLarge: {
    fontFamily: FontFamily.interMedium,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * LineHeight.normal,
    fontWeight: '500',
    color: WHITE_80,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
  },
  labelSmall: {
    fontFamily: FontFamily.interMedium,
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs * LineHeight.normal,
    fontWeight: '500',
    color: WHITE_60,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
  },

  // ── MONOSPACE (formulas, code) ──
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'SFMono-Regular' : 'RobotoMono-Regular',
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * LineHeight.normal,
    color: '#FDE047',
  },
};
