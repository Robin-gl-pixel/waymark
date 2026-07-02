/**
 * Google Places API — Text Search fallback.
 *
 * Called between Mapbox address (strategy 1) and Mapbox name (strategy 3).
 * Google's POI database massively outperforms Mapbox on restaurants/bars/cafés,
 * especially for European venues where Mapbox has thin coverage.
 *
 * Uses the Places API "New" (v1) `places:searchText` endpoint.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Pricing: $32/1000 requests Text Search (Basic SKU), $200/mo Google credit
 * covers ~6250 free lookups.
 */

export interface GooglePlace {
  address: string;
  lat: number;
  lng: number;
  googlePlaceId: string;
}

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

// Bias the search to the given country when we know it. Uses ISO 3166-1 alpha-2
// codes, same convention as Mapbox (see mapbox.ts).
const COUNTRY_ISO: Record<string, string> = {
  france: 'FR',
  portugal: 'PT',
  spain: 'ES',
  espagne: 'ES',
  italy: 'IT',
  italie: 'IT',
  'united kingdom': 'GB',
  uk: 'GB',
  'royaume-uni': 'GB',
  usa: 'US',
  'united states': 'US',
  'états-unis': 'US',
  germany: 'DE',
  allemagne: 'DE',
  netherlands: 'NL',
  'pays-bas': 'NL',
  belgium: 'BE',
  belgique: 'BE',
  japan: 'JP',
  japon: 'JP',
};

function isoForCountry(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_ISO[country.trim().toLowerCase()] ?? null;
}

export async function geocodeGooglePlace(
  name: string,
  city: string | null,
  country: string | null,
): Promise<GooglePlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    // Not fatal — mapbox fallback still runs. Log so ops can see when this
    // fallback isn't reachable.
    console.warn('[google] GOOGLE_PLACES_API_KEY missing — skipping Google Places strategy');
    return null;
  }

  const textQuery = [name, city, country].filter(Boolean).join(' ');
  const iso = isoForCountry(country);

  console.log('[google] input', { name, city, country, iso });

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 1,
    languageCode: 'fr',
  };
  if (iso) {
    // regionCode narrows to a country; not enforced, just biases the search.
    body.regionCode = iso;
  }

  const res = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Only request the fields we actually use — Places API bills per requested field mask.
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[google] query failed', res.status, text.slice(0, 300));
    return null;
  }

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }>;
  };

  const first = data.places?.[0];
  if (!first?.location) {
    console.warn('[google] no result for', textQuery);
    return null;
  }

  console.log('[google] result', {
    name: first.displayName?.text,
    address: first.formattedAddress,
    lat: first.location.latitude,
    lng: first.location.longitude,
  });

  return {
    address: first.formattedAddress ?? first.displayName?.text ?? textQuery,
    lat: first.location.latitude,
    lng: first.location.longitude,
    googlePlaceId: first.id,
  };
}
