import {
  buildMetaPrefix,
  categoryLabel,
  extractParisArrondissement,
  formatCityShort,
  formatDateCompact,
  formatEntryNumber,
  resolvePinStatus,
} from '../listScreenHelpers';
import type { Lieu, LieuCategory } from '../../types/Lieu';

const ts = (millis: number) => ({
  seconds: Math.floor(millis / 1000),
  nanoseconds: (millis % 1000) * 1_000_000,
  toDate: () => new Date(millis),
  toMillis: () => millis,
});

function makeLieu(overrides: Partial<Lieu> = {}): Lieu {
  return {
    id: 'l1',
    userId: 'u1',
    name: 'Le Gainsbarre',
    nameNormalized: 'le gainsbarre',
    city: 'Paris',
    country: 'France',
    address: '5 rue de Verneuil, 75007 Paris',
    lat: 48.85,
    lng: 2.32,
    category: 'bar',
    description: null,
    sourceInstagram: { author: null, screenshotStoragePath: 'x' },
    photos: [
      {
        storagePath: 'x',
        source: 'insta',
        addedAt: ts(new Date('2026-07-03T12:00:00Z').getTime()),
      },
    ],
    userNotes: null,
    createdAt: ts(new Date('2026-07-03T12:00:00Z').getTime()),
    updatedAt: ts(new Date('2026-07-03T12:00:00Z').getTime()),
    ...overrides,
  };
}

describe('formatEntryNumber', () => {
  it('renders the newest row (index 0) as the largest number, zero-padded to 3 digits', () => {
    expect(formatEntryNumber(0, 48)).toBe('Nº 048');
  });

  it('walks down as the row index grows — row 47 of 48 is Nº 001', () => {
    expect(formatEntryNumber(47, 48)).toBe('Nº 001');
  });

  it('keeps padding at 3 digits for small collections', () => {
    expect(formatEntryNumber(0, 3)).toBe('Nº 003');
    expect(formatEntryNumber(2, 3)).toBe('Nº 001');
  });

  it('lets the number grow past 3 digits without truncating', () => {
    expect(formatEntryNumber(0, 1024)).toBe('Nº 1024');
  });

  it('never renders below Nº 001 even if inputs are inconsistent', () => {
    // Defensive: an off-by-one shouldn't produce Nº 000 or a negative number.
    expect(formatEntryNumber(5, 3)).toBe('Nº 001');
  });
});

describe('extractParisArrondissement', () => {
  it.each([
    ['5 rue de Verneuil, 75007 Paris', 7],
    ['12 rue de Rivoli 75001 Paris', 1],
    ['1 avenue Foch, 75116 Paris', 16],
    ['boulevard Barbès 75018', 18],
    ['20e arr. 75020 Paris', 20],
  ])('reads the arrondissement out of %j', (address, expected) => {
    expect(extractParisArrondissement(address)).toBe(expected);
  });

  it('returns null when the address has no Paris postal code', () => {
    expect(extractParisArrondissement('13001 Marseille')).toBeNull();
    expect(extractParisArrondissement('Vieille ville, Lyon')).toBeNull();
    expect(extractParisArrondissement('')).toBeNull();
  });

  it('rejects out-of-range 75xxx codes (e.g. 75999)', () => {
    expect(extractParisArrondissement('75999 Nowhere')).toBeNull();
    expect(extractParisArrondissement('75000 Whatever')).toBeNull();
  });
});

describe('formatCityShort', () => {
  it('compacts Paris + address into "Paris <arr>"', () => {
    expect(formatCityShort('Paris', '5 rue de Verneuil, 75007 Paris')).toBe('Paris 7');
  });

  it('is case-insensitive on the Paris check', () => {
    expect(formatCityShort('paris', '2 rue X 75002')).toBe('Paris 2');
  });

  it('falls back to the raw city when no arrondissement can be parsed', () => {
    expect(formatCityShort('Paris', 'rue sans code postal')).toBe('Paris');
  });

  it('leaves non-Paris cities untouched', () => {
    expect(formatCityShort('Marseille', '13001 Marseille')).toBe('Marseille');
    expect(formatCityShort('Lyon', '69001 Lyon')).toBe('Lyon');
  });
});

describe('formatDateCompact', () => {
  it('renders DD·MM with a mid-dot U+00B7', () => {
    const t = ts(new Date('2026-07-03T10:00:00').getTime());
    expect(formatDateCompact(t)).toBe('03·07');
    // The separator must be U+00B7 (middle dot), not U+002E (period).
    expect(formatDateCompact(t).charCodeAt(2)).toBe(0x00b7);
  });

  it('zero-pads single-digit day and month', () => {
    const t = ts(new Date('2026-01-05T10:00:00').getTime());
    expect(formatDateCompact(t)).toBe('05·01');
  });
});

describe('categoryLabel', () => {
  const cases: Array<[LieuCategory, string]> = [
    ['resto', 'Resto'],
    ['bar', 'Bar'],
    ['café', 'Café'],
    ['activité', 'Activité'],
    ['musée', 'Musée'],
    ['hôtel', 'Hôtel'],
    ['autre', 'Lieu'],
  ];
  it.each(cases)('maps %s → %s', (cat, label) => {
    expect(categoryLabel(cat)).toBe(label);
  });
});

describe('resolvePinStatus', () => {
  it('returns null when the pin carries no status field (current data model)', () => {
    expect(resolvePinStatus(makeLieu())).toBeNull();
  });

  it('returns null for an explicit null status', () => {
    expect(resolvePinStatus({ ...makeLieu(), status: null } as unknown as Lieu)).toBeNull();
  });

  it('surfaces wishlist / visited unchanged', () => {
    expect(
      resolvePinStatus({ ...makeLieu(), status: 'wishlist' } as unknown as Lieu),
    ).toBe('wishlist');
    expect(
      resolvePinStatus({ ...makeLieu(), status: 'visited' } as unknown as Lieu),
    ).toBe('visited');
  });

  it('rejects unknown status values rather than passing them through', () => {
    expect(
      resolvePinStatus({ ...makeLieu(), status: 'delivered' } as unknown as Lieu),
    ).toBeNull();
  });
});

describe('buildMetaPrefix', () => {
  it('joins category · city · date with " · " when no status follows', () => {
    const lieu = makeLieu();
    expect(buildMetaPrefix(lieu, false)).toBe('Bar · Paris 7 · 03·07');
  });

  it('appends a trailing " · " when a status badge will be rendered inline', () => {
    const lieu = makeLieu();
    expect(buildMetaPrefix(lieu, true)).toBe('Bar · Paris 7 · 03·07 · ');
  });

  it('falls back to the raw city when arrondissement extraction fails', () => {
    const lieu = makeLieu({ city: 'Lyon', address: '69001 Lyon', category: 'resto' });
    expect(buildMetaPrefix(lieu, false)).toBe('Resto · Lyon · 03·07');
  });
});
