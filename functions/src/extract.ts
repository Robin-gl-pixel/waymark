import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { extractPlaceFromScreenshot, ExtractedFromVision } from './lib/claude';
import { geocodePlace, GeocodedPlace } from './lib/mapbox';

export interface LieuExtractedResponse extends ExtractedFromVision {
  lat: number | null;
  lng: number | null;
  mapboxId: string | null;
  addressCanonical: string | null;
}

/**
 * Callable Firebase Function: extract structured place info from an Instagram screenshot.
 *
 * Input: { imageBase64: string, mediaType?: 'image/png' | 'image/jpeg' | 'image/webp' }
 * Output: LieuExtractedResponse
 *
 * Auth: caller MUST be signed in with Firebase Auth. Callable functions enforce this
 * via `request.auth`; we double-check + throw a proper HttpsError on unauthenticated.
 *
 * Pipeline:
 *   1. Claude Sonnet 4.5 vision → structured extraction
 *   2. If we got a name → Mapbox forward geocoding → lat/lng + canonical address
 *   3. Return merged shape (vision preferred for description/category, Mapbox for coords)
 */
export const extract = onCall(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: ['ANTHROPIC_API_KEY', 'MAPBOX_SECRET_TOKEN'],
  },
  async (request): Promise<LieuExtractedResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to extract.');
    }

    const { imageBase64, mediaType = 'image/png' } = request.data as {
      imageBase64?: string;
      mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'imageBase64 is required.');
    }

    // Basic size guard: images >~8 MB base64 usually mean uncompressed or malicious.
    if (imageBase64.length > 12_000_000) {
      throw new HttpsError('invalid-argument', 'Image too large (>8MB).');
    }

    let vision: ExtractedFromVision;
    try {
      vision = await extractPlaceFromScreenshot(imageBase64, mediaType);
    } catch (err) {
      console.error('[extract] vision failed', err);
      throw new HttpsError('internal', 'Extraction visuelle échouée.');
    }

    if (!vision.name) {
      // Not a place-recommendation screenshot — return honestly.
      return {
        ...vision,
        lat: null,
        lng: null,
        mapboxId: null,
        addressCanonical: null,
      };
    }

    let geo: GeocodedPlace | null = null;
    try {
      geo = await geocodePlace(vision.name, vision.city, vision.country);
    } catch (err) {
      console.error('[extract] geocoding failed', err);
      // Fall through: better a lieu without coords than no lieu at all.
    }

    return {
      ...vision,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      mapboxId: geo?.mapboxId ?? null,
      // Prefer Mapbox canonical address when Claude didn't get a full one.
      addressCanonical: vision.address ?? geo?.address ?? null,
    };
  },
);
