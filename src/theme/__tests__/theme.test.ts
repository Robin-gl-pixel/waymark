import { categoryColor, colors, fonts, radius, spacing, type } from '../index';
import type { LieuCategory } from '../../types/Lieu';

describe('theme token contract', () => {
  it('exports the v8 "paper" base palette', () => {
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

  it('repoints the semantic aliases at the new palette', () => {
    expect(colors.bg).toBe(colors.paper);
    expect(colors.text).toBe(colors.ink);
    expect(colors.textSecondary).toBe(colors.graphite);
    expect(colors.accent).toBe(colors.catResto);
    expect(colors.border).toBe(colors.hair);
  });

  it('no longer exposes the pre-refonte dark tokens', () => {
    // Old #0A0A0A ground + #FF6B47 coral accent are gone.
    expect(colors.bg).not.toBe('#0A0A0A');
    expect(colors.accent).not.toBe('#FF6B47');
  });

  it('exposes the three-role font system', () => {
    expect(typeof fonts.display).toBe('string');
    expect(typeof fonts.bodySerifItalic).toBe('string');
    expect(typeof fonts.mono).toBe('string');
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

  it('exposes type.mono with wide letter-spacing (archival log feel)', () => {
    expect(type.mono.fontFamily).toBe(fonts.mono);
    expect(type.mono.letterSpacing).toBeGreaterThan(1);
    expect(type.mono.textTransform).toBe('uppercase');
  });

  it('exposes type.serifItalic with italic style (tastemaker voice)', () => {
    expect(type.serifItalic.fontFamily).toBe(fonts.bodySerifItalic);
    expect(type.serifItalic.fontStyle).toBe('italic');
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
