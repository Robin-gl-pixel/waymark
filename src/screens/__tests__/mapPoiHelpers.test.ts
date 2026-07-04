import {
  MAP_POI_CATEGORY_LABEL,
  MAP_POI_CATEGORY_ORDER,
  mapPoiToLieuInput,
  type MapPoiTap,
} from '../mapPoiHelpers';
import type { LieuCategory } from '../../types/Lieu';

describe('mapPoiToLieuInput', () => {
  const POI: MapPoiTap = {
    name: 'Le Baratin',
    coordinate: { latitude: 48.8724, longitude: 2.3894 },
    source: 'poi',
  };

  it('preserves the POI name verbatim', () => {
    const { input } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
    expect(input.name).toBe('Le Baratin');
  });

  it('copies the coordinate into lat/lng', () => {
    const { input } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
    expect(input.lat).toBe(48.8724);
    expect(input.lng).toBe(2.3894);
  });

  it.each<LieuCategory>([
    'resto',
    'bar',
    'café',
    'activité',
    'musée',
    'hôtel',
    'autre',
  ])('maps category %s straight through to the input', (category) => {
    const { input } = mapPoiToLieuInput({ poi: POI, category });
    expect(input.category).toBe(category);
  });

  it('defaults status to wishlist when omitted', () => {
    const { status } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
    expect(status).toBe('wishlist');
  });

  it('honors an explicit visited status', () => {
    const { status } = mapPoiToLieuInput({
      poi: POI,
      category: 'resto',
      status: 'visited',
    });
    expect(status).toBe('visited');
  });

  it('allows an explicit null status (unclassified)', () => {
    const { status } = mapPoiToLieuInput({
      poi: POI,
      category: 'resto',
      status: null,
    });
    expect(status).toBeNull();
  });

  it('emits an empty screenshotUri so the seam skips Storage upload', () => {
    // Both service impls treat an empty URI as "no photo" — writing
    // photos: [] and skipping the upload. This is the same branch used by
    // the Insta-URL share path today.
    const { input } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
    expect(input.screenshotUri).toBe('');
  });

  it('emits null-safe empty strings for city/country/address', () => {
    // The seam requires string (not null) here — user can edit later.
    const { input } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
    expect(input.city).toBe('');
    expect(input.country).toBe('');
    expect(input.address).toBe('');
  });

  it('emits null for the optional fields (description, sourceAuthor, userNotes)', () => {
    const { input } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
    expect(input.description).toBeNull();
    expect(input.sourceAuthor).toBeNull();
    expect(input.userNotes).toBeNull();
  });

  describe('long-press flow (Apple Maps fallback)', () => {
    // On Apple Maps the POI tap is inert, so the sheet is reached via a
    // long-press on a bare coordinate. The POI arrives with an empty name
    // and the user types it in the sheet — the caller passes that typed
    // string as `name`, overriding `poi.name`.
    const LONG_PRESS: MapPoiTap = {
      name: '',
      coordinate: { latitude: 48.8566, longitude: 2.3522 },
      source: 'longpress',
    };

    it('uses the user-typed name when the POI has none', () => {
      const { input } = mapPoiToLieuInput({
        poi: LONG_PRESS,
        category: 'bar',
        name: 'Chez Prune',
      });
      expect(input.name).toBe('Chez Prune');
    });

    it('overrides a Google-Maps POI name when the user edits it', () => {
      // Corrective flow: Apple/Google labelled the POI wrong, user retypes.
      const { input } = mapPoiToLieuInput({
        poi: POI, // POI.name = 'Le Baratin'
        category: 'resto',
        name: 'Le Baratin (le vrai)',
      });
      expect(input.name).toBe('Le Baratin (le vrai)');
    });

    it('trims whitespace off the user-typed name', () => {
      // A stray leading/trailing space from the sheet TextInput must not land
      // in Firestore — the seam has no server-side trim.
      const { input } = mapPoiToLieuInput({
        poi: LONG_PRESS,
        category: 'café',
        name: '  Fragments  ',
      });
      expect(input.name).toBe('Fragments');
    });

    it('still copies the long-press coordinate into lat/lng', () => {
      const { input } = mapPoiToLieuInput({
        poi: LONG_PRESS,
        category: 'bar',
        name: 'Chez Prune',
      });
      expect(input.lat).toBe(48.8566);
      expect(input.lng).toBe(2.3522);
    });

    it('falls back to poi.name when no override is passed', () => {
      // Belt-and-braces: even without the sheet-supplied name, we don't
      // crash — the raw POI name (or empty string, for long-press) rides
      // through. The sheet blocks empty-name saves at the UI level.
      const { input } = mapPoiToLieuInput({ poi: POI, category: 'resto' });
      expect(input.name).toBe('Le Baratin');
    });
  });
});

describe('MAP_POI_CATEGORY_ORDER', () => {
  it('has all seven categories, resto first', () => {
    expect(MAP_POI_CATEGORY_ORDER).toEqual([
      'resto',
      'bar',
      'café',
      'activité',
      'musée',
      'hôtel',
      'autre',
    ]);
  });

  it('has a label for every category', () => {
    for (const cat of MAP_POI_CATEGORY_ORDER) {
      expect(MAP_POI_CATEGORY_LABEL[cat]).toBeDefined();
      expect(MAP_POI_CATEGORY_LABEL[cat].length).toBeGreaterThan(0);
    }
  });
});
