/**
 * Mapbox Geocoding fallback.
 *
 * Called when Claude vision didn't extract a full address, or to always
 * enrich with lat/lng + canonical address regardless.
 *
 * Uses forward geocoding on the Mapbox Places endpoint (v5).
 * Free tier: 100k requests/month.
 */

export interface GeocodedPlace {
  address: string;
  lat: number;
  lng: number;
  mapboxId: string;
}

const MAPBOX_ENDPOINT = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

export async function geocodePlace(
  name: string,
  city: string | null,
  country: string | null,
): Promise<GeocodedPlace | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    console.warn('[mapbox] MAPBOX_SECRET_TOKEN missing — skipping geocoding');
    return null;
  }

  // Query: "<name> <city> <country>" — Mapbox handles the fuzzy matching.
  const parts = [name, city, country].filter(Boolean);
  const query = encodeURIComponent(parts.join(' '));

  // types=poi biases toward businesses (restaurants, bars, etc.) over addresses.
  const url = `${MAPBOX_ENDPOINT}/${query}.json?access_token=${token}&types=poi,address&limit=1`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error('[mapbox] geocoding failed', res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as {
    features?: Array<{
      id: string;
      place_name: string;
      center: [number, number]; // [lng, lat]
    }>;
  };

  const first = data.features?.[0];
  if (!first) return null;

  const [lng, lat] = first.center;
  return {
    address: first.place_name,
    lat,
    lng,
    mapboxId: first.id,
  };
}
