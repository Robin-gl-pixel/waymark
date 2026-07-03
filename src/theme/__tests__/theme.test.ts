/**
 * Contract tests for the v8 token system.
 *
 * These tests are the last line of defence during the wave-2 refonte rollout:
 * they lock the shape of `colors`, `fonts`, and `type` so a rename or accidental
 * removal breaks CI rather than silently painting a broken app.
 *
 * NOTE — a sibling contract test lives in slice #45's `theme.test.ts`. When #45
 * merges first, we resolve any conflict here by adopting its (broader) version.
 */

import { colors, fonts, type, categoryColor, formatDateFR } from '../index';

describe('theme tokens (v8)', () => {
  it('exposes the paper / ink / graphite ground palette', () => {
    expect(colors.paper).toBe('#FBFAF6');
    expect(colors.ink).toBe('#14100A');
    expect(colors.graphite).toBe('#4A4132');
    expect(colors.hair).toBe('rgba(20, 16, 10, 0.13)');
  });

  it('exposes seven distinct category colors', () => {
    const cats = [
      colors.catResto,
      colors.catBar,
      colors.catCafe,
      colors.catActivite,
      colors.catMusee,
      colors.catHotel,
      colors.catAutre,
    ];
    // All present and non-empty
    cats.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/i));
    // All distinct so map markers can't collide
    expect(new Set(cats).size).toBe(7);
  });

  it('aliases the deprecated tokens to the v8 palette so legacy screens compile', () => {
    // `bg` was near-black, is now paper. `accent` was coral, is now vermillon.
    expect(colors.bg).toBe(colors.paper);
    expect(colors.text).toBe(colors.ink);
    expect(colors.textSecondary).toBe(colors.graphite);
    expect(colors.accent).toBe(colors.catResto);
  });

  it('does not leak the pre-refonte hex literals', () => {
    // If any legacy dark/coral hex sneaks back into the token file the acceptance
    // criterion "grep returns 0 hits for #0A0A0A / #FF6B47" is violated.
    const stringified = JSON.stringify(colors);
    expect(stringified).not.toMatch(/#0A0A0A/i);
    expect(stringified).not.toMatch(/#FF6B47/i);
  });

  it('exposes the three-role font system with system fallbacks', () => {
    expect(Object.keys(fonts).sort()).toEqual(['bodySerifItalic', 'display', 'mono']);
    // Fallbacks must be strings that RN can resolve without expo-font loading.
    Object.values(fonts).forEach((f) => {
      expect(typeof f).toBe('string');
      expect(f.length).toBeGreaterThan(0);
    });
    // No Manrope references anywhere.
    Object.values(fonts).forEach((f) => expect(f.toLowerCase()).not.toContain('manrope'));
  });

  it('type.display / h1 / h2 use the display face with heavy weight + uppercase', () => {
    [type.display, type.h1, type.h2, type.displayLg].forEach((role) => {
      expect(role.fontFamily).toBe(fonts.display);
      expect(role.fontWeight).toBe('900');
      expect(role.textTransform).toBe('uppercase');
    });
  });

  it('type.serif uses the italic serif face', () => {
    expect(type.serif.fontFamily).toBe(fonts.bodySerifItalic);
    expect(type.serif.fontStyle).toBe('italic');
  });

  it('type.mono / caption / micro use the monospaced face', () => {
    [type.mono, type.caption, type.micro, type.monoSm].forEach((role) => {
      expect(role.fontFamily).toBe(fonts.mono);
    });
  });
});

describe('categoryColor', () => {
  it('maps each LieuCategory value to its token', () => {
    const cases: Array<[Parameters<typeof categoryColor>[0], string]> = [
      ['resto', colors.catResto],
      ['bar', colors.catBar],
      ['cafe', colors.catCafe],
      ['activite', colors.catActivite],
      ['musee', colors.catMusee],
      ['hotel', colors.catHotel],
      ['autre', colors.catAutre],
    ];
    cases.forEach(([cat, expected]) => {
      expect(categoryColor(cat)).toBe(expected);
    });
  });

  it('defaults to the ardoise (catAutre) for unknown / null / undefined', () => {
    expect(categoryColor(null)).toBe(colors.catAutre);
    expect(categoryColor(undefined)).toBe(colors.catAutre);
    expect(categoryColor('nonsense')).toBe(colors.catAutre);
  });
});

describe('formatDateFR', () => {
  it('produces the compact DD·MM·YY mid-dot form used by the v8 mono lines', () => {
    // 2026-07-03 → 03·07·26
    const d = new Date(2026, 6, 3);
    expect(formatDateFR(d)).toBe('03·07·26');
  });

  it('zero-pads days and months', () => {
    // 2026-01-05 → 05·01·26
    const d = new Date(2026, 0, 5);
    expect(formatDateFR(d)).toBe('05·01·26');
  });

  it('accepts a timestamp', () => {
    const d = new Date(2026, 11, 31);
    expect(formatDateFR(d.getTime())).toBe('31·12·26');
  });
});
