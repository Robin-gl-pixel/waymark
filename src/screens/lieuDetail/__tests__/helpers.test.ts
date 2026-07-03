import { detailQuoteText, formatAddress, friendBadgeLabel, quoteWrap } from '../helpers';
import type { Lieu } from '../../../types/Lieu';

function makeLieu(overrides: Partial<Lieu> = {}): Lieu {
  const now = {
    seconds: 0,
    nanoseconds: 0,
    toDate: () => new Date(0),
    toMillis: () => 0,
  };
  return {
    id: 'lieu-1',
    userId: 'user-1',
    name: 'Le Gainsbarre',
    nameNormalized: 'le gainsbarre',
    city: 'Paris',
    country: 'France',
    address: '5 rue de Verneuil',
    lat: 48.85,
    lng: 2.32,
    category: 'bar',
    description: 'la carte est courte, on peut parler',
    sourceInstagram: { author: 'le.rouge.gorge', screenshotStoragePath: 'p' },
    userNotes: null,
    status: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('formatAddress', () => {
  it('splits street and city on separate lines when the address does not already contain the city', () => {
    expect(formatAddress({ address: '5 rue de Verneuil', city: 'Paris' })).toBe(
      '5 rue de Verneuil\nParis',
    );
  });

  it('does not duplicate the city when the address already contains it', () => {
    expect(formatAddress({ address: '5 rue de Verneuil, Paris', city: 'Paris' })).toBe(
      '5 rue de Verneuil, Paris',
    );
  });

  it('is case-insensitive when checking for city inclusion', () => {
    expect(formatAddress({ address: '5 rue de Verneuil, PARIS', city: 'paris' })).toBe(
      '5 rue de Verneuil, PARIS',
    );
  });

  it('returns the raw address when city is empty', () => {
    expect(formatAddress({ address: '5 rue de Verneuil', city: '' })).toBe('5 rue de Verneuil');
  });

  it('trims surrounding whitespace on both fields', () => {
    expect(formatAddress({ address: '  5 rue  ', city: '  Paris  ' })).toBe('5 rue\nParis');
  });
});

describe('quoteWrap', () => {
  it('wraps a non-empty string in French guillemets', () => {
    expect(quoteWrap('la carte est courte')).toBe('« la carte est courte »');
  });

  it('trims before wrapping', () => {
    expect(quoteWrap('   la carte est courte   ')).toBe('« la carte est courte »');
  });

  it('returns null for empty / whitespace-only / null / undefined', () => {
    expect(quoteWrap('')).toBeNull();
    expect(quoteWrap('   ')).toBeNull();
    expect(quoteWrap(null)).toBeNull();
    expect(quoteWrap(undefined)).toBeNull();
  });
});

describe('detailQuoteText', () => {
  it('owner mode: prefers userNotes over description', () => {
    const lieu = makeLieu({ userNotes: 'go on tuesdays', description: 'la carte est courte' });
    expect(detailQuoteText(lieu, true)).toBe('« go on tuesdays »');
  });

  it('owner mode: falls back to description when userNotes is empty', () => {
    const lieu = makeLieu({ userNotes: null, description: 'la carte est courte' });
    expect(detailQuoteText(lieu, true)).toBe('« la carte est courte »');
  });

  it('owner mode: returns null when both are empty', () => {
    const lieu = makeLieu({ userNotes: null, description: null });
    expect(detailQuoteText(lieu, true)).toBeNull();
  });

  it('friend mode: uses the venue description, never the friend userNotes', () => {
    const lieu = makeLieu({ userNotes: 'my private note', description: 'la carte est courte' });
    expect(detailQuoteText(lieu, false)).toBe('« la carte est courte »');
  });

  it('friend mode: returns null when the venue has no description', () => {
    const lieu = makeLieu({ userNotes: 'my private note', description: null });
    expect(detailQuoteText(lieu, false)).toBeNull();
  });
});

describe('friendBadgeLabel', () => {
  it('renders the friend-facing phrase per status', () => {
    expect(friendBadgeLabel('visited')).toBe('· Y est allé');
    expect(friendBadgeLabel('wishlist')).toBe('· En envie');
  });

  it('returns null when the friend has not classified the pin', () => {
    expect(friendBadgeLabel(null)).toBeNull();
  });
});
