export const colors = {
  bg: '#0A0A0A',
  bgElevated: '#1A1A1A',
  accent: '#FF6B47',
  accentDim: '#E85C3D',
  text: '#F5F5F5',
  textSecondary: 'rgba(245, 245, 245, 0.7)',
  textTertiary: 'rgba(245, 245, 245, 0.5)',
  border: 'rgba(255, 255, 255, 0.1)',
  error: '#FF5555',
} as const;

/**
 * Deterministic avatar palette — 8 muted-vivid hues that read well on a dark
 * background and stay distinct at a glance in a scrolling list. Consumed by
 * `src/utils/avatar.ts`; each username hashes to exactly one index.
 *
 * Order matters — do not reshuffle without regenerating any cached palette
 * choices. Adding new colors at the END is safe (nobody's index shifts down).
 */
export const avatarPalette = [
  '#FF6B47', // coral (Waymark accent)
  '#F5A462', // amber
  '#E8C547', // gold
  '#7FB77E', // sage
  '#4FB8B6', // teal
  '#5B8DEF', // sky
  '#9C6EEE', // lavender
  '#E86AA8', // rose
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999,
} as const;

/**
 * Manrope font family names as registered by `@expo-google-fonts/manrope`.
 * Each weight is a distinct family — React Native's `fontWeight` won't pick
 * between them on its own, so screens must pass the family they want.
 */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const type = {
  display: { fontSize: 48, lineHeight: 52, letterSpacing: -0.96, fontFamily: fonts.extrabold },
  h1: { fontSize: 32, lineHeight: 38, fontFamily: fonts.bold },
  h2: { fontSize: 24, lineHeight: 30, fontFamily: fonts.bold },
  h3: { fontSize: 18, lineHeight: 24, fontFamily: fonts.semibold },
  body: { fontSize: 16, lineHeight: 22, fontFamily: fonts.regular },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  micro: { fontSize: 11, lineHeight: 14, fontFamily: fonts.medium },
} as const;
