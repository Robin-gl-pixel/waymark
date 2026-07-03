/**
 * Geocoding orchestration used by `extract`. Tries strategies in order of
 * expected precision; first hit wins.
 *
 *   0. DB lookup — same normalized name + city already saved by another user?
 *      Zero external API calls, collective-intelligence dedup.
 *   1. Mapbox by address (if Claude read the address from the screenshot)
 *   2. Claude world-knowledge → Mapbox by that address (fixes famous POIs
 *      Mapbox-by-name gets wrong; works even without a Google Places key)
 *   3. Google Places Text Search (rich POI DB for restos/bars/cafés)
 *   4. Mapbox by name+city+country (last-resort fallback)
 */
import { mapboxByAddress, mapboxByName, GeocodedPlace } from './mapbox';
import { geocodeGooglePlace } from './google';
import { resolveKnownPlace } from './claudeKnowledge';
import { findExistingLieu } from './existingLieu';
import { ExtractedFromVision } from './claude';
import { normalizeName } from './normalize';

function normalize(s: string | null | undefined): string {
  return normalizeName(s ?? '');
}

/**
 * Sanity check: a Mapbox/Google result whose city doesn't match the requested
 * city is very likely a fuzzy false positive. E.g. "Paris 7ème" mapped to
 * "7 Rue De Paris, Créteil". Reject those so the caller falls through to the
 * next strategy.
 */
function cityMatchesRequested(hit: GeocodedPlace, requestedCity: string | null): boolean {
  if (!requestedCity) return true; // no requirement
  // Normalize "Paris 7" / "Paris 7ème" / "Paris 7e" → "paris" for comparison.
  const req = normalize(requestedCity).replace(/\s*\d+(?:e|ème|eme)?$/, '').trim();
  const got = normalize(hit.city);
  // If Mapbox context gave us a structured city, TRUST IT (don't fall back to
  // substring match on address — "7 Rue De Paris" contains "paris" but city is
  // Créteil, so that would falsely pass).
  if (got) {
    return got === req || got.includes(req) || req.includes(got);
  }
  // Only when we have no structured city (e.g. Google results), do substring
  // check on the tail of the address (city portion, not street portion).
  const parts = hit.address.split(',').map((p) => normalize(p));
  // Skip the first part (typically street name) — check the rest.
  return parts.slice(1).some((p) => p.includes(req));
}

async function tryMapboxAddress(
  address: string,
  vision: ExtractedFromVision,
): Promise<GeocodedPlace | null> {
  const hit = await mapboxByAddress(address, vision.city, vision.country);
  if (!hit) return null;
  if (!cityMatchesRequested(hit, vision.city)) {
    console.warn('[geocode] rejected Mapbox hit — city mismatch', {
      requested: vision.city,
      got: hit.city,
      addressTried: address,
      returned: hit.address,
    });
    return null;
  }
  return hit;
}

export async function orchestrateGeocode(
  vision: ExtractedFromVision,
): Promise<GeocodedPlace | null> {
  if (!vision.name) return null;

  // Step 0: DB lookup. If someone already added this place with valid coords,
  // reuse. Cheapest strategy (~single-index Firestore read, no external API).
  try {
    const existing = await findExistingLieu(vision.name, vision.city);
    if (existing) return existing;
  } catch (err) {
    // Missing index or transient Firestore hiccup — log and fall through, we
    // still have the full geocoding pipeline as backup.
    console.error('[geocode] existingLieu lookup failed, falling through', err);
  }

  if (vision.address) {
    const hit = await tryMapboxAddress(vision.address, vision);
    if (hit) return hit;
  }

  // Claude knowledge → Mapbox by that address. Claude answers with the address
  // string; Mapbox verifies + gives precise coords. We only trust "high" here,
  // "medium" is used further down as a soft fallback.
  const known = await resolveKnownPlace(vision.name, vision.city, vision.country);
  if (known && known.confidence === 'high') {
    const hit = await tryMapboxAddress(known.address, vision);
    if (hit) return hit;
  }

  const google = await geocodeGooglePlace(vision.name, vision.city, vision.country);
  if (google) {
    // Adapt Google's shape to the shared GeocodedPlace. mapboxId is empty on
    // purpose — the source is distinguishable if we ever want to log it.
    const adapted: GeocodedPlace = {
      address: google.address,
      lat: google.lat,
      lng: google.lng,
      mapboxId: '',
    };
    if (cityMatchesRequested(adapted, vision.city)) return adapted;
    console.warn('[geocode] rejected Google hit — city mismatch', {
      requested: vision.city,
      returned: google.address,
    });
  }

  // Soft fallback: retry the medium-confidence Claude address before dropping
  // to naked Mapbox-by-name (which is known-bad for POIs).
  if (known && known.confidence === 'medium') {
    const hit = await tryMapboxAddress(known.address, vision);
    if (hit) return hit;
  }

  const nameHit = await mapboxByName(vision.name, vision.city, vision.country);
  if (nameHit && cityMatchesRequested(nameHit, vision.city)) return nameHit;
  if (nameHit) {
    console.warn('[geocode] rejected Mapbox-by-name — city mismatch', {
      requested: vision.city,
      returned: nameHit.address,
    });
  }
  return null;
}
