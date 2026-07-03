import {
  MAP_POI_CATEGORY_LABEL,
  MAP_POI_CATEGORY_ORDER,
  mapPoiToLieuInput,
} from '../mapPoiHelpers';
import type { LieuCategory } from '../../types/Lieu';

describe('mapPoiToLieuInput', () => {
  const POI = {
    name: 'Le Baratin',
    coordinate: { latitude: 48.8724, longitude: 2.3894 },
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
