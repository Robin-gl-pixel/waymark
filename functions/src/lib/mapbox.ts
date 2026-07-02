/**
 * Mapbox Geocoding — two low-level strategies (address vs name) exposed
 * separately so the extract pipeline can interleave them with other providers
 * (e.g. Google Places fallback).
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

// Best-effort ISO 3166-1 alpha-2 mapping for country strings Claude commonly returns.
// Mapbox `country=` filter takes comma-separated ISO codes and dramatically reduces
// wrong-region matches (e.g. "La Gare" matching the Foix SNCF station because no
// city/country context was passed in the free-text query).
const COUNTRY_ISO: Record<string, string> = {
  france: 'fr',
  portugal: 'pt',
  spain: 'es',
  espagne: 'es',
  italy: 'it',
  italie: 'it',
  'united kingdom': 'gb',
  uk: 'gb',
  'royaume-uni': 'gb',
  usa: 'us',
  'united states': 'us',
  'états-unis': 'us',
  germany: 'de',
  allemagne: 'de',
  netherlands: 'nl',
  'pays-bas': 'nl',
  belgium: 'be',
  belgique: 'be',
  japan: 'jp',
  japon: 'jp',
};

function isoForCountry(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_ISO[country.trim().toLowerCase()] ?? null;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}

async function mapboxQuery(
  query: string,
  types: string,
  countryIso: string | null,
): Promise<MapboxFeature | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    console.warn('[mapbox] MAPBOX_SECRET_TOKEN missing — skipping');
    return null;
  }
  const countryParam = countryIso ? `&country=${countryIso}` : '';
  const url = `${MAPBOX_ENDPOINT}/${encodeURIComponent(query)}.json?access_token=${token}&types=${types}&limit=1${countryParam}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error('[mapbox] query failed', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { features?: MapboxFeature[] };
  return data.features?.[0] ?? null;
}

function toGeocoded(feature: MapboxFeature): GeocodedPlace {
  const [lng, lat] = feature.center;
  return { address: feature.place_name, lat, lng, mapboxId: feature.id };
}

/**
 * Strategy A: geocode by full street address. Best precision when Claude read
 * the address off the screenshot — Mapbox is very good at address matching.
 */
export async function mapboxByAddress(
  address: string,
  city: string | null,
  country: string | null,
): Promise<GeocodedPlace | null> {
  const iso = isoForCountry(country);
  const query = [address, city, country].filter(Boolean).join(', ');
  console.log('[mapbox] byAddress', { query, iso });
  const feature = await mapboxQuery(query, 'address,poi', iso);
  if (feature) console.log('[mapbox] byAddress hit', feature.place_name);
  return feature ? toGeocoded(feature) : null;
}

/**
 * Strategy B: geocode by POI name + city + country. Last-resort fallback when
 * we have no address and Google Places didn't find the venue either.
 */
export async function mapboxByName(
  name: string,
  city: string | null,
  country: string | null,
): Promise<GeocodedPlace | null> {
  const iso = isoForCountry(country);
  const query = [name, city, country].filter(Boolean).join(' ');
  console.log('[mapbox] byName', { query, iso });
  const feature = await mapboxQuery(query, 'poi,address', iso);
  if (feature) console.log('[mapbox] byName hit', feature.place_name);
  return feature ? toGeocoded(feature) : null;
}
