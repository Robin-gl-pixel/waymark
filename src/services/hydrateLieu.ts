import { Lieu, LieuPhoto, Timestamp } from '../types/Lieu';
import { normalizeName } from '../lib/normalize';

/**
 * Shared read-side hydration for a Firestore `lieux/{id}` doc. Turns a raw
 * `Record<string, unknown>` (as returned by `getDoc().data()` or the equivalent
 * seed shape used by `InMemoryLieuxService`) into a fully-typed `Lieu`.
 *
 * This is THE place where the pre-migration → `photos[]` read-compat lives:
 * a legacy doc that only carries `sourceInstagram.screenshotStoragePath` gets
 * a synthesised single-element `photos[]` in memory. No Firestore write is
 * emitted — the backfill script (parent PRD #34) does that separately.
 *
 * Used by both `FirebaseLieuxService.hydrate` and the feed hydrator inside
 * `FirebaseSocialService`, plus the raw-doc read path in
 * `InMemoryLieuxService`. Keeping a single implementation is the only way the
 * seam's contract stays coherent as we migrate old data.
 */
export function hydrateLieuFromRaw(id: string, data: Record<string, unknown>): Lieu {
  const sourceInstagramRaw = data.sourceInstagram as
    | { author?: string | null; screenshotStoragePath?: string }
    | undefined;
  const legacyScreenshotPath = sourceInstagramRaw?.screenshotStoragePath ?? '';

  // Read-compat: if the doc doesn't declare `photos` but has the legacy
  // screenshot pointer, synthesise a single-element array. If neither is
  // present (e.g. curated pins with no image), return an empty array — the
  // UI already falls back to the category emoji placeholder.
  const rawPhotos = data.photos;
  let photos: LieuPhoto[];
  if (Array.isArray(rawPhotos)) {
    photos = rawPhotos as LieuPhoto[];
  } else if (legacyScreenshotPath.length > 0) {
    const createdAt = data.createdAt as Timestamp | undefined;
    photos = [
      {
        storagePath: legacyScreenshotPath,
        source: 'insta',
        // Best-effort: back-date the synthesised photo to the pin's own
        // createdAt. `Timestamp` here is structural — screens don't rely on
        // it being a real firebase Timestamp, and the backfill script will
        // write the authoritative value when it runs.
        addedAt: createdAt ?? ({} as Timestamp),
      },
    ];
  } else {
    photos = [];
  }

  return {
    id,
    userId: data.userId as string,
    name: data.name as string,
    // Fallback for pre-migration docs that don't have the field yet — the
    // backfill script will fill them in, but a client read shouldn't crash
    // in the meantime.
    nameNormalized:
      (data.nameNormalized as string | undefined) ?? normalizeName(data.name as string),
    city: data.city as string,
    country: data.country as string,
    address: data.address as string,
    lat: data.lat as number,
    lng: data.lng as number,
    category: data.category as Lieu['category'],
    description: (data.description as string) ?? null,
    sourceInstagram: {
      author: sourceInstagramRaw?.author ?? null,
      // Preserve the legacy pointer on the in-memory Lieu so the backfill
      // script + any diagnostic UI can still see it. New pins write
      // `undefined` here (the field is entirely omitted on disk).
      screenshotStoragePath: legacyScreenshotPath.length > 0 ? legacyScreenshotPath : undefined,
    },
    photos,
    userNotes: (data.userNotes as string) ?? null,
    savedFromUserId: (data.savedFromUserId as string | null | undefined) ?? null,
    savedFromUsername: (data.savedFromUsername as string | null | undefined) ?? null,
    // #41 — pre-existing pins have no `status` field on their Firestore doc;
    // surface them as `null` (unclassified) at the seam. No backfill needed.
    status: (data.status as Lieu['status'] | undefined) ?? null,
    // Firestore stores the cleared invariant as null (see
    // FirebaseLieuxService.updateLieu). Both null and missing collapse to
    // `undefined` on the hydrated Lieu.
    visitedAt: (data.visitedAt as Timestamp | null | undefined) ?? undefined,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}
