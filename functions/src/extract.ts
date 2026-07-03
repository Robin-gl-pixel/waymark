import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { extractPlaceFromScreenshot, ExtractedFromVision } from './lib/claude';
import { GeocodedPlace } from './lib/mapbox';
import { orchestrateGeocode } from './lib/geocode';
import { fetchImageAsBase64, fetchInstagramMetadata, isInstagramUrl } from './lib/instagram';

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
    secrets: ['ANTHROPIC_API_KEY', 'MAPBOX_SECRET_TOKEN', 'GOOGLE_PLACES_API_KEY'],
  },
  async (request): Promise<LieuExtractedResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to extract.');
    }

    const { imageBase64: rawImageBase64, mediaType: rawMediaType = 'image/png', captionText, instagramUrl } = request.data as {
      imageBase64?: string;
      mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
      captionText?: string;
      instagramUrl?: string;
    };

    // Two call modes:
    // 1. imageBase64 (screenshot or video keyframe already in client hands) — existing flow
    // 2. instagramUrl (client shared a reel URL from iOS Share Sheet) — new flow:
    //    fetch og:image + og:description from the public Insta URL, then run
    //    the normal vision pipeline on the resolved thumbnail.
    let imageBase64: string | undefined = rawImageBase64;
    let mediaType: 'image/png' | 'image/jpeg' | 'image/webp' = rawMediaType;
    let resolvedCaption: string | null =
      typeof captionText === 'string' && captionText.trim() ? captionText.trim() : null;

    if (!imageBase64 && instagramUrl && typeof instagramUrl === 'string') {
      if (!isInstagramUrl(instagramUrl)) {
        throw new HttpsError('invalid-argument', 'Not an Instagram URL.');
      }
      try {
        const meta = await fetchInstagramMetadata(instagramUrl);
        if (!meta.imageUrl) {
          throw new HttpsError('failed-precondition', 'Instagram post has no thumbnail (private or removed?).');
        }
        const fetched = await fetchImageAsBase64(meta.imageUrl);
        imageBase64 = fetched.base64;
        mediaType = fetched.mediaType;
        // Prefer og:description over any caption the client also sent — the
        // og tag comes straight from Instagram's server-rendered HTML.
        if (meta.description) resolvedCaption = meta.description;
        console.log('[extract] resolved Instagram URL', {
          url: instagramUrl,
          imageUrl: meta.imageUrl,
          hasDescription: !!meta.description,
          descriptionLength: meta.description?.length ?? 0,
        });
      } catch (err) {
        console.error('[extract] Instagram fetch failed', err);
        const msg = (err as Error).message || 'Instagram fetch failed';
        throw new HttpsError('failed-precondition', msg);
      }
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'imageBase64 or instagramUrl is required.');
    }

    // Basic size guard: images >~8 MB base64 usually mean uncompressed or malicious.
    if (imageBase64.length > 12_000_000) {
      throw new HttpsError('invalid-argument', 'Image too large (>8MB).');
    }

    // Sanity guard on the optional caption: only accept strings, and trim
    // upstream so we don't waste tokens on whitespace. Length cap is handled
    // downstream in buildUserPrompt.
    const cleanCaption = resolvedCaption;

    let vision: ExtractedFromVision;
    try {
      vision = await extractPlaceFromScreenshot(imageBase64, mediaType, cleanCaption);
      console.log('[extract] vision result', {
        name: vision.name,
        city: vision.city,
        country: vision.country,
        address: vision.address,
        category: vision.category,
      });
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
      geo = await orchestrateGeocode(vision);
    } catch (err) {
      console.error('[extract] geocoding failed', err);
      // Fall through: better a lieu without coords than no lieu at all.
    }

    return {
      ...vision,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      mapboxId: geo?.mapboxId ?? null,
      // Prefer the geocoded canonical when we have one — it's verified against
      // a live DB (Mapbox / Google / DB dedup) and typically has street+postcode.
      // vision.address is often a fragment ("Paris 7", "près Bastille") that's
      // fine to feed into the geocoder but ugly as the displayed address.
      addressCanonical: geo?.address ?? vision.address ?? null,
    };
  },
);
