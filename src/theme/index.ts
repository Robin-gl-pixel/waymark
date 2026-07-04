import type { LieuCategory } from '../types/Lieu';

/**
 * Pinti visual tokens — v8 "atlas numéroté" refonte (issue #45).
 *
 * Ground is warm off-white paper, ink is near-black, and the seven category
 * tokens are the punchy per-Lieu accents that carry the map's identity.
 *
 * The legacy semantic aliases (`bg` / `text` / `accent` / `border` etc.) are
 * repointed at the new palette so every screen still compiles unchanged —
 * wave 2 will migrate screens one at a time. Do NOT reintroduce the old
 * near-black / coral tokens here.
 */
export const colors = {
  // Base — the entire "paper" ground system
  paper: '#FBFAF6',
  ink: '#14100A',
  graphite: '#4A4132',
  hair: 'rgba(20, 16, 10, 0.13)',

  // Category system — one saturated hue per LieuCategory value.
  // Resolve through `categoryColor()` — never hardcode a hex outside this file.
  catResto: '#E5253C', // vermillon
  catBar: '#98C43B', // chartreuse électrique
  catCafe: '#FF8A63', // corail
  catActivite: '#002FA7', // Klein
  catMusee: '#F5A623', // safran vif
  catHotel: '#B93E9C', // magenta
  catAutre: '#4E5763', // ardoise

  // Semantic aliases
  bg: '#FBFAF6', // = paper
  text: '#14100A', // = ink
  textSecondary: '#4A4132', // = graphite
  accent: '#E5253C', // = catResto — cerise/vermillon = primary CTA

  // Legacy compat aliases — screens still consume these until wave 2 migrates
  // them off. Remove in a follow-up slice once every consumer is gone.
  bgElevated: '#F3EFE4',
  accentDim: '#B91E30',
  textTertiary: 'rgba(20, 16, 10, 0.5)',
  border: 'rgba(20, 16, 10, 0.13)', // = hair
  error: '#E5253C',
} as const;

/**
 * Category → color lookup. Consumers MUST resolve through this helper so a
 * palette shuffle stays a one-file change. Never inline the hex.
 */
const CATEGORY_COLOR: Record<LieuCategory, string> = {
  resto: colors.catResto,
  bar: colors.catBar,
  café: colors.catCafe,
  activité: colors.catActivite,
  musée: colors.catMusee,
  hôtel: colors.catHotel,
  autre: colors.catAutre,
};

export function categoryColor(category: LieuCategory): string {
  return CATEGORY_COLOR[category];
}

/**
 * Deterministic avatar palette — 8 muted-vivid hues that stay distinct at a
 * glance in a scrolling list. Consumed by `src/utils/avatar.ts`; each username
 * hashes to exactly one index.
 *
 * Order matters — do not reshuffle without regenerating any cached palette
 * choices. Adding new colors at the END is safe (nobody's index shifts down).
 */
export const avatarPalette = [
  '#E5253C', // vermillon (Pinti accent)
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
 * Three-role type system — grotesque display, italic serif tastemaker,
 * monospaced meta. System fallbacks for now (Archivo Black / EB Garamond
 * Italic / JetBrains Mono are the intended real faces once loaded via
 * expo-font in a later slice). Manrope is gone.
 */
export const fonts = {
  display: 'System',
  bodySerifItalic: 'Georgia',
  mono: 'Courier',

  // Legacy aliases — every screen still imports these until wave 2 replaces
  // the type roles. All repointed to System so no Manrope reference remains.
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
  extrabold: 'System',
} as const;

export const type = {
  // Legacy roles — retained so existing screens compile and render on paper
  // ground. Wave 2 replaces these consumers with the three-role system below.
  display: {
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -0.96,
    fontFamily: fonts.display,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  // Larger display role used by wave-2 auth/upload/extract screens (slice #50).
  displayLg: {
    fontFamily: fonts.display,
    fontSize: 56,
    lineHeight: 54,
    letterSpacing: -2.2,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  h1: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, fontWeight: '900' as const },
  h2: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, fontWeight: '900' as const },
  h3: { fontSize: 18, lineHeight: 24, fontFamily: fonts.display, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22, fontFamily: fonts.display, fontWeight: '400' as const },
  bodyBold: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700' as const,
  },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.display, fontWeight: '500' as const },
  micro: { fontSize: 11, lineHeight: 14, fontFamily: fonts.display, fontWeight: '500' as const },

  // v8 three-role system — every new component (BadgeText, CategoryPin,
  // StatusToggle, ProfileLocked) consumes these.
  serifItalic: {
    fontFamily: fonts.bodySerifItalic,
    fontStyle: 'italic' as const,
    fontSize: 18,
    lineHeight: 24,
  },
  // Slightly smaller serif italic used by wave-2 screens for tastemaker copy
  // (slice #50). Kept alongside `serifItalic` for typographic contrast.
  serif: {
    fontFamily: fonts.bodySerifItalic,
    fontStyle: 'italic' as const,
    fontSize: 17,
    lineHeight: 24,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.4, // ~0.2em at 12px — archival log feel
    textTransform: 'uppercase' as const,
  },
  // Compact mono for eyebrows / meta labels ("Nº 01", timestamps).
  monoSm: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  // Mono uppercase eyebrow used by the section headers in the wave-2 screens.
  sectionEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2.2,
    textTransform: 'uppercase' as const,
    fontWeight: '600' as const,
  },
} as const;

/**
 * Format a Date as the compact French mid-dot form `DD·MM·YY`. Consumed by the
 * detail / list / activity surfaces where dates read as numeric texture rather
 * than natural language.
 */
export function formatDateFR(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}·${mm}·${yy}`;
}
