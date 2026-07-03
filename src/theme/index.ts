/**
 * Waymark v8 design tokens — "L'atlas numéroté" direction.
 *
 * Paper-white ground (`#FBFAF6`) + confident ink outlines + 7 punchy category
 * colors. Typography is a three-role system: heavy grotesque black uppercase
 * for display, italic serif for tastemaker moments, monospace for numbers /
 * addresses / meta.
 *
 * The visual spec of record is `docs/design/waymark-v8.html`. Any token
 * decision that isn't obvious from this file should be traced back there.
 *
 * NOTE — this file is the sibling artefact of design refonte slice #45
 * (Foundation). Slice #50 (final sweep) also lands the same shape to keep
 * every screen buildable during the wave-2 rollout; the two PRs will merge-
 * conflict on this file and the resolution takes #45's version (which owns
 * additional shared components under `src/components/` — StatusToggle,
 * BadgeText, CategoryPin, ProfileLocked).
 */

/** LieuCategory keys mirrored here so `categoryColor()` stays exhaustive. */
export type LieuCategoryKey =
  | 'resto'
  | 'bar'
  | 'cafe'
  | 'activite'
  | 'musee'
  | 'hotel'
  | 'autre';

export const colors = {
  // Ground + type
  paper: '#FBFAF6', // warm off-white — every screen background
  ink: '#14100A', // near-black — primary type, outlines, tab bar
  graphite: '#4A4132', // warm dark taupe — secondary text, meta labels
  hair: 'rgba(20, 16, 10, 0.13)', // hairline dividers

  // 7-category punchy palette (matches CSS custom properties in v8 mockup)
  catResto: '#E5253C', // vermillon
  catBar: '#98C43B', // chartreuse
  catCafe: '#FF8A63', // corail
  catActivite: '#002FA7', // Klein blue
  catMusee: '#F5A623', // safran
  catHotel: '#B93E9C', // magenta
  catAutre: '#4E5763', // ardoise

  // Semantic aliases — keep the rest of the app compiling while wave 2 slices
  // migrate individual screens. `accent` = the primary CTA (cerise/vermillon).
  bg: '#FBFAF6', // paper
  bgElevated: '#F3F0EA', // paper-2 (very slight tint)
  text: '#14100A', // ink
  textSecondary: '#4A4132', // graphite
  textTertiary: 'rgba(20, 16, 10, 0.55)', // dimmer graphite for hint / disabled
  border: 'rgba(20, 16, 10, 0.13)', // hair
  accent: '#E5253C', // catResto — primary CTA color
  accentDim: '#B31D30', // catResto pressed
  error: '#B31D30', // vermillon foncé — reserved for destructive actions
} as const;

/**
 * Map a LieuCategory value to its color token. Consumers must go through here
 * rather than picking a hex — a palette tweak then propagates in one PR.
 */
export function categoryColor(category: LieuCategoryKey | string | null | undefined): string {
  switch (category) {
    case 'resto':
      return colors.catResto;
    case 'bar':
      return colors.catBar;
    case 'cafe':
      return colors.catCafe;
    case 'activite':
      return colors.catActivite;
    case 'musee':
      return colors.catMusee;
    case 'hotel':
      return colors.catHotel;
    case 'autre':
    default:
      return colors.catAutre;
  }
}

/**
 * Deterministic avatar palette — reshuffled around the v8 direction. Consumed
 * by `src/utils/avatar.ts`; each username hashes to exactly one index. Order
 * matters — do not reshuffle without regenerating any cached palette choices.
 * Adding new colors at the END is safe (nobody's index shifts down).
 */
export const avatarPalette = [
  '#E5253C', // catResto (vermillon)
  '#F5A623', // catMusee (safran)
  '#98C43B', // catBar (chartreuse)
  '#4FB8B6', // teal
  '#002FA7', // catActivite (Klein)
  '#B93E9C', // catHotel (magenta)
  '#FF8A63', // catCafe (corail)
  '#4E5763', // catAutre (ardoise)
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
  sm: 4,
  md: 8,
  lg: 12,
  pill: 9999,
} as const;

/**
 * Three-role type system.
 *
 * - `display` — heavy grotesque black uppercase (Balenciaga/MSCHF). System
 *   fallback while we defer the custom-font decision to a follow-up.
 * - `bodySerifItalic` — italic serif for tastemaker moments (venue quotes,
 *   friend notes, profile bios). Georgia italic is a solid iOS fallback.
 * - `mono` — monospaced for numbers, addresses, dates, meta. `ui-monospace`
 *   maps to SF Mono on iOS at no cost.
 */
export const fonts = {
  display: 'System', // paired with fontWeight: '900' + textTransform: 'uppercase'
  bodySerifItalic: 'Georgia', // paired with fontStyle: 'italic'
  mono: 'Menlo', // ui-monospace equivalent that RN reliably resolves on iOS
} as const;

export const type = {
  display: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1.6,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  displayLg: {
    fontFamily: fonts.display,
    fontSize: 56,
    lineHeight: 54,
    letterSpacing: -2.2,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  h1: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -1.05,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.66,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
  },
  h3: {
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.32,
    fontWeight: '800' as const,
  },
  sectionEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2.2,
    textTransform: 'uppercase' as const,
    fontWeight: '600' as const,
  },
  body: { fontFamily: fonts.display, fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyBold: { fontFamily: fonts.display, fontSize: 15, lineHeight: 22, fontWeight: '700' as const },
  serif: {
    fontFamily: fonts.bodySerifItalic,
    fontStyle: 'italic' as const,
    fontSize: 17,
    lineHeight: 24,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  monoSm: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  caption: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  micro: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
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
