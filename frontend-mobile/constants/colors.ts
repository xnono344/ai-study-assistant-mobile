/**
 * Aurora Glass Design System — Color Tokens
 *
 * Philosophy: True AMOLED black for OLED power savings, magical purple
 * as the brand spine, deep blue accents, and bright metallic gold for
 * headlines. Liquid glass surfaces use subtle white-on-dark overlays.
 */

export const Colors = {
  // ── BASE LAYER (AMOLED True Black) ──
  background: '#000000',
  backgroundElevated: '#0A0A0F',
  backgroundGlass: 'rgba(10, 10, 20, 0.72)',

  // ── MAGICAL PURPLE GRADIENT SYSTEM ──
  purple: {
    50:  '#F5F0FF',
    100: '#E9D5FF',
    200: '#D8B4FE',
    300: '#C084FC',
    400: '#A855F7',   // PRIMARY BRAND PURPLE
    500: '#9333EA',
    600: '#7E22CE',
    700: '#6B21A8',
    800: '#581C87',
    900: '#4C1D95',
    950: '#2E1065',
  },

  // ── DEEP BLUE ACCENTS ──
  blue: {
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    900: '#1E3A8A',
    950: '#172554',
  },

  // ── METALLIC GOLD (Headlines & Highlights) ──
  gold: {
    100: '#FEF9C3',
    200: '#FEF08A',
    300: '#FDE047',
    400: '#FACC15',
    500: '#EAB308',
    600: '#CA8A04',
    700: '#A16207',
    800: '#854D0E',
    900: '#713F12',
    metallic: '#FFD700',
    metallicBright: '#FFF8DC',
  },

  // ── SEMANTIC TEXT ──
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255, 255, 255, 0.72)',
    tertiary: 'rgba(255, 255, 255, 0.6)',
    inverse: '#000000',
    gold: '#FFD700',
    goldBright: '#FFF8DC',
  },

  // ── LIQUID GLASS SURFACES ──
  glass: {
    surface: 'rgba(255, 255, 255, 0.04)',
    surfaceHover: 'rgba(255, 255, 255, 0.08)',
    surfacePressed: 'rgba(255, 255, 255, 0.12)',
    border: 'rgba(168, 85, 247, 0.18)',
    borderHover: 'rgba(168, 85, 247, 0.36)',
    borderGold: 'rgba(255, 215, 0, 0.24)',
    shadow: 'rgba(0, 0, 0, 0.6)',
    shadowPurple: 'rgba(168, 85, 247, 0.15)',
    shadowGold: 'rgba(255, 215, 0, 0.12)',
  },

  // ── STATUS ──
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export type ColorVariant = 'default' | 'elevated' | 'gold' | 'purple' | 'error';
