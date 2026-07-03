import { formatCompactDate, formatEntryNumber } from '../lieuNumber';
import type { Timestamp } from '../../types/Lieu';

function ts(millis: number): Timestamp {
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: (millis % 1000) * 1_000_000,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

describe('formatEntryNumber', () => {
  it('returns "Nº " followed by three digits (padded)', () => {
    for (const id of ['a', 'lieu-1', 'AbCdEf', 'mem-1a-abcdef']) {
      const out = formatEntryNumber({ id });
      expect(out).toMatch(/^Nº \d{3}$/);
    }
  });

  it('is stable — same id always yields the same slug', () => {
    const id = 'stable-id-42';
    expect(formatEntryNumber({ id })).toBe(formatEntryNumber({ id }));
  });

  it('never returns "Nº 000" (zero is skipped to avoid a dead-looking badge)', () => {
    // Try a few hundred inputs — the mapping is 1..999, so `000` should never
    // appear across a reasonable sample.
    for (let i = 0; i < 500; i += 1) {
      expect(formatEntryNumber({ id: `id-${i}` })).not.toBe('Nº 000');
    }
  });

  it('produces different slugs for different ids (not a constant)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      seen.add(formatEntryNumber({ id: `id-${i}` }));
    }
    // If djb2 collapsed everything we'd get 1 or 2 entries — expect variety.
    expect(seen.size).toBeGreaterThan(20);
  });
});

describe('formatCompactDate', () => {
  it('renders DD·MM with the U+00B7 mid-dot separator', () => {
    // 2026-07-03 → 03·07 (matches the mockup credit line)
    const t = ts(new Date(2026, 6, 3, 12).getTime());
    expect(formatCompactDate(t)).toBe('03·07');
  });

  it('pads single-digit days and months', () => {
    const t = ts(new Date(2026, 0, 5, 12).getTime()); // 2026-01-05
    expect(formatCompactDate(t)).toBe('05·01');
  });

  it('renders two-digit month and day untouched', () => {
    const t = ts(new Date(2026, 10, 28, 12).getTime()); // 2026-11-28
    expect(formatCompactDate(t)).toBe('28·11');
  });
});
