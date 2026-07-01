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

export const type = {
  display: { fontSize: 48, lineHeight: 52, letterSpacing: -0.96 },
  h1: { fontSize: 32, lineHeight: 38 },
  h2: { fontSize: 24, lineHeight: 30 },
  h3: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  micro: { fontSize: 11, lineHeight: 14 },
} as const;
