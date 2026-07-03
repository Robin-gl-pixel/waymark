/**
 * Look up whether a lieu with this normalized name + city already exists in
 * any user's collection. If yes, we reuse its address/coords — dedup + zero
 * external-API cost.
 *
 * Uses admin.firestore().collectionGroup('lieux') which requires a composite
 * index (see firestore.indexes.json: nameNormalized ASC + city ASC).
 */
import * as admin from 'firebase-admin';
import { GeocodedPlace } from './mapbox';
import { normalizeName } from './normalize';

export async function findExistingLieu(
  name: string,
  city: string | null,
): Promise<GeocodedPlace | null> {
  if (!name || !city) return null;

  const nameKey = normalizeName(name);
  if (!nameKey) return null;

  const db = admin.firestore();
  const snap = await db
    .collectionGroup('lieux')
    .where('nameNormalized', '==', nameKey)
    .where('city', '==', city)
    .limit(5)
    .get();

  console.log('[existingLieu] query', { nameKey, city, hits: snap.size });

  for (const doc of snap.docs) {
    const d = doc.data();
    const lat = typeof d.lat === 'number' ? d.lat : null;
    const lng = typeof d.lng === 'number' ? d.lng : null;
    const address = typeof d.address === 'string' && d.address ? d.address : null;
    // Skip pins with broken coords (e.g. old pins from before the sanity check).
    if (lat === null || lng === null || !address) continue;
    console.log('[existingLieu] hit', {
      docPath: doc.ref.path,
      address,
      lat,
      lng,
    });
    return {
      address,
      lat,
      lng,
      mapboxId: typeof d.mapboxId === 'string' ? d.mapboxId : '',
      city,
    };
  }

  return null;
}
