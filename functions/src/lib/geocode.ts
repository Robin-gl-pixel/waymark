/**
 * Geocoding orchestration — shared by `extract` (in-app upload) and
 * `extractFromShortcut` (iOS Shortcut). Tries strategies in order of expected
 * precision; first hit wins.
 *
 *   1. Mapbox by address (if Claude read the address from the screenshot)
 *   2. Google Places Text Search (rich POI DB for restos/bars/cafés)
 *   3. Mapbox by name+city+country (last-resort fallback)
 */
import { mapboxByAddress, mapboxByName, GeocodedPlace } from './mapbox';
import { geocodeGooglePlace } from './google';
import { ExtractedFromVision } from './claude';

export async function orchestrateGeocode(
  vision: ExtractedFromVision,
): Promise<GeocodedPlace | null> {
  if (!vision.name) return null;

  if (vision.address) {
    const hit = await mapboxByAddress(vision.address, vision.city, vision.country);
    if (hit) return hit;
  }

  const google = await geocodeGooglePlace(vision.name, vision.city, vision.country);
  if (google) {
    // Adapt Google's shape to the shared GeocodedPlace. mapboxId is empty on
    // purpose — the source is distinguishable if we ever want to log it.
    return {
      address: google.address,
      lat: google.lat,
      lng: google.lng,
      mapboxId: '',
    };
  }

  return mapboxByName(vision.name, vision.city, vision.country);
}
