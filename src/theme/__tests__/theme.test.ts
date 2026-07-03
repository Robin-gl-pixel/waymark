/**
 * Contract tests for the v8 token system.
 *
 * These tests are the last line of defence during the wave-2 refonte rollout:
 * they lock the shape of `colors`, `fonts`, and `type` so a rename or
 * accidental removal breaks CI rather than silently painting a broken app.
 *
 * Merged from slice #45 (foundation) and slice #50 (final sweep) — both PRs
 * shipped a token contract test; this file is the union of the two.
 */

import { categoryColor, colors, fonts, formatDateFR, radius, spacing, type } from '../index';
import type { LieuCategory } from '../../types/Lieu';

describe('theme token contract', () => {
  it('exposes the paper / ink / graphite ground palette', () => {
    expect(colors.paper).toBe('#FBFAF6');
    expect(colors.ink).toBe('#14100A');
    expect(colors.graphite).toBe('#4A4132');
    expect(colors.hair).toBe('rgba(20, 16, 10, 0.13)');
  });

  it('exposes all 7 category tokens', () => {
    expect(colors.catResto).toBe('#E5253C');
    expect(colors.catBar).toBe('#98C43B');
    expect(colors.catCafe).toBe('#FF8A63');
    expect(colors.catActivite).toBe('#002FA7');
    expect(colors.catMusee).toBe('#F5A623');
    expect(colors.catHotel).toBe('#B93E9C');
    expect(colors.catAutre).toBe('#4E5763');
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
    cats.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/i));
    expect(new Set(cats).size).toBe(7);
  });

  it('repoints the semantic aliases at the new palette', () => {
    expect(colors.bg).toBe(colors.paper);
    expect(colors.text).toBe(colors.ink);
    expect(colors.textSecondary).toBe(colors.graphite);
    expect(colors.accent).toBe(colors.catResto);
    expect(colors.border).toBe(colors.hair);
  });

  it('no longer exposes the pre-refonte dark / coral tokens', () => {
    // Old #0A0A0A ground + #FF6B47 coral accent are gone.
    expect(colors.bg).not.toBe('#0A0A0A');
    expect(colors.accent).not.toBe('#FF6B47');
    const stringified = JSON.stringify(colors);
    expect(stringified).not.toMatch(/#0A0A0A/i);
    expect(stringified).not.toMatch(/#FF6B47/i);
  });

  it('exposes the three-role font system', () => {
    expect(typeof fonts.display).toBe('string');
    expect(typeof fonts.bodySerifItalic).toBe('string');
    expect(typeof fonts.mono).toBe('string');
    // Fallbacks must be non-empty strings so RN can resolve them without
    // expo-font loading.
    Object.values(fonts).forEach((f) => {
      expect(typeof f).toBe('string');
      expect(f.length).toBeGreaterThan(0);
    });
  });

  it('removes every Manrope reference from the font map', () => {
    for (const family of Object.values(fonts)) {
      expect(family).not.toMatch(/Manrope/i);
    }
  });

  it('carries spacing + radius scales unchanged', () => {
    expect(spacing).toEqual(
      expect.objectContaining({
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
      }),
    );
    expect(radius.pill).toBe(9999);
  });

  it('type.display / displayLg / h1 / h2 use the display face with heavy weight + uppercase', () => {
    [type.display, type.displayLg, type.h1, type.h2].forEach((role) => {
      expect(role.fontFamily).toBe(fonts.display);
      expect(role.fontWeight).toBe('900');
    });
    // display + displayLg carry the uppercase transform; h1/h2 currently don't.
    expect(type.display.textTransform).toBe('uppercase');
    expect(type.displayLg.textTransform).toBe('uppercase');
  });

  it('exposes type.mono with wide letter-spacing (archival log feel)', () => {
    expect(type.mono.fontFamily).toBe(fonts.mono);
    expect(type.mono.letterSpacing).toBeGreaterThan(1);
    expect(type.mono.textTransform).toBe('uppercase');
  });

  it('exposes type.monoSm as a compact mono variant', () => {
    expect(type.monoSm.fontFamily).toBe(fonts.mono);
    expect(type.monoSm.textTransform).toBe('uppercase');
  });

  it('exposes type.serifItalic with italic style (tastemaker voice)', () => {
    expect(type.serifItalic.fontFamily).toBe(fonts.bodySerifItalic);
    expect(type.serifItalic.fontStyle).toBe('italic');
  });

  it('exposes type.serif with italic style (wave-2 tastemaker copy)', () => {
    expect(type.serif.fontFamily).toBe(fonts.bodySerifItalic);
    expect(type.serif.fontStyle).toBe('italic');
  });

  it('exposes type.sectionEyebrow with the mono face', () => {
    expect(type.sectionEyebrow.fontFamily).toBe(fonts.mono);
    expect(type.sectionEyebrow.textTransform).toBe('uppercase');
  });
});

describe('categoryColor helper', () => {
  const cases: Array<{ category: LieuCategory; expected: string }> = [
    { category: 'resto', expected: '#E5253C' },
    { category: 'bar', expected: '#98C43B' },
    { category: 'café', expected: '#FF8A63' },
    { category: 'activité', expected: '#002FA7' },
    { category: 'musée', expected: '#F5A623' },
    { category: 'hôtel', expected: '#B93E9C' },
    { category: 'autre', expected: '#4E5763' },
  ];

  it.each(cases)('resolves $category → $expected', ({ category, expected }) => {
    expect(categoryColor(category)).toBe(expected);
  });

  it('never returns undefined for a valid LieuCategory', () => {
    const categories: LieuCategory[] = ['resto', 'bar', 'café', 'activité', 'musée', 'hôtel', 'autre'];
    for (const c of categories) {
      expect(categoryColor(c)).toEqual(expect.any(String));
      expect(categoryColor(c)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('formatDateFR', () => {
  it('produces the compact DD·MM·YY mid-dot form used by the v8 mono lines', () => {
    const d = new Date(2026, 6, 3);
    expect(formatDateFR(d)).toBe('03·07·26');
  });

  it('zero-pads days and months', () => {
    const d = new Date(2026, 0, 5);
    expect(formatDateFR(d)).toBe('05·01·26');
  });

  it('accepts a timestamp', () => {
    const d = new Date(2026, 11, 31);
    expect(formatDateFR(d.getTime())).toBe('31·12·26');
  });
});
