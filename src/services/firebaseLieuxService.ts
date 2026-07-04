import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../auth/firebase';
import { Lieu, LieuInput, LieuExtracted, LieuPhoto } from '../types/Lieu';
import {
  LieuxService,
  LieuDuplicateError,
  DUPLICATE_DISTANCE_M,
  MAX_PHOTOS_PER_LIEU,
  PhotoCapReachedError,
} from './lieuxService';
import { normalizeName } from '../lib/normalize';
import { hydrateLieuFromRaw } from './hydrateLieu';

/**
 * Great-circle distance in meters. Duplicated from `UploadScreen` /
 * `SharedImageScreen` — kept as a small local helper (rather than a shared
 * util) to preserve the seam's zero-dependency posture.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Direct URL of the deployed Cloud Function — we call it via fetch to bypass
// Firebase JS SDK's httpsCallable, which builds a Blob from the payload and
// fails in React Native for anything > ~5MB (RN's Blob doesn't accept ArrayBuffer).
const EXTRACT_URL = 'https://extract-7ypjacicka-ew.a.run.app';

/**
 * Firebase-backed implementation of LieuxService.
 * Consumers should NEVER instantiate this directly — go through `getLieuxService()`.
 */
export class FirebaseLieuxService implements LieuxService {
  private lieuxCol(userId: string) {
    return collection(db, 'users', userId, 'lieux');
  }

  async getAllLieux(userId: string): Promise<Lieu[]> {
    const q = query(this.lieuxCol(userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => this.hydrate(d.id, d.data()));
  }

  async getLieuById(userId: string, lieuId: string): Promise<Lieu | null> {
    const snap = await getDoc(doc(this.lieuxCol(userId), lieuId));
    if (!snap.exists()) return null;
    return this.hydrate(snap.id, snap.data());
  }

  async createLieu(userId: string, input: LieuInput): Promise<Lieu> {
    const lieuRef = doc(this.lieuxCol(userId));
    const lieuId = lieuRef.id;

    // 1. Upload screenshot to Storage first — if this fails, we don't write a
    // dangling Firestore doc pointing at a missing image.
    const extFromMime: Record<LieuInput['screenshotMediaType'], string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    };
    const ext = extFromMime[input.screenshotMediaType];
    // URL-only shares from Insta (extractFromInstagramUrl) don't come with a
    // local file — screenshotUri is empty. In that case we skip the Storage
    // upload and write an empty `photos: []` ; LieuDetail / feed rows must
    // handle the absence gracefully (no <Image> when photos is empty).
    let storagePath = '';
    if (input.screenshotUri && input.screenshotUri.length > 0) {
      // New layout (parent PRD #34): `users/{uid}/photos/{lieuId}/{photoId}.{ext}`.
      // `photoId` is a random string so a future gallery-add slice can co-locate
      // additional photos under the same folder without collisions.
      const photoId = randomPhotoId();
      storagePath = `users/${userId}/photos/${lieuId}/${photoId}.${ext}`;
      // Firebase JS SDK v9+ on RN Hermes throws "Creating blobs from ArrayBuffer…"
      // for both uploadBytes(Uint8Array) and uploadString(base64) — both wrap in Blob internally.
      // fetch(uri).blob() returns a native RN Blob (BlobModule) that XHR can upload correctly.
      const blob = await fetch(input.screenshotUri).then((r) => r.blob());
      await uploadBytes(ref(storage, storagePath), blob, {
        contentType: input.screenshotMediaType,
      });
    }

    // 2. Write Firestore doc.
    // NEW SCHEMA (parent PRD #34, slice #35): `photos: [{ storagePath, source, addedAt }]`.
    // We DO NOT write `sourceInstagram.screenshotStoragePath` on new pins —
    // the read layer synthesises `photos[]` from it only for legacy docs.
    //
    // NOTE: Firestore forbids `serverTimestamp()` INSIDE array elements. The
    // photo-add time is inherently client-driven anyway (it's whenever the
    // picker returned), so `Timestamp.now()` is semantically correct here.
    // Document-level `createdAt`/`updatedAt` still use `serverTimestamp()`.
    const photos =
      storagePath.length > 0
        ? [
            {
              storagePath,
              source: 'insta' as const,
              addedAt: Timestamp.now(),
            },
          ]
        : [];
    const data = {
      userId,
      name: input.name,
      nameNormalized: normalizeName(input.name),
      city: input.city,
      country: input.country,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      category: input.category,
      description: input.description,
      sourceInstagram: {
        author: input.sourceAuthor,
      },
      photos,
      userNotes: input.userNotes,
      // #41 — defaults for new pins. status: 'wishlist' matches the seam
      // contract enforced by both service impls. `visitedAt` is intentionally
      // not written — it only gets set when the user flips status to 'visited'.
      status: 'wishlist',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(lieuRef, data);

    // Re-read to get resolved server timestamps.
    const created = await this.getLieuById(userId, lieuId);
    if (!created) throw new Error('Failed to read back created lieu');
    return created;
  }

  async updateLieu(
    userId: string,
    lieuId: string,
    patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes' | 'status'>>,
  ): Promise<void> {
    // Whitelist the fields we forward to Firestore — `visitedAt` is
    // service-managed via the invariant below and must never be passed
    // through even if a rogue caller sneaks it in.
    const write: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const allowed: Array<keyof typeof patch> = [
      'name',
      'city',
      'address',
      'category',
      'userNotes',
      'status',
    ];
    for (const key of allowed) {
      if (key in patch && patch[key] !== undefined) {
        write[key] = patch[key];
      }
    }
    if (patch.name !== undefined) {
      write.nameNormalized = normalizeName(patch.name);
    }
    // #41 — visitedAt invariant. Mirrors InMemoryLieuxService exactly so the
    // seam contract tests catch regressions in either impl.
    if ('status' in patch && patch.status !== undefined) {
      if (patch.status === 'visited') {
        write.visitedAt = serverTimestamp();
      } else {
        // deleteField() would be ideal, but keeping a zero-dependency footprint
        // — writing null is equally correct at the seam because `hydrate` maps
        // both null and undefined to `undefined` on the Lieu.
        write.visitedAt = null;
      }
    }
    await updateDoc(doc(this.lieuxCol(userId), lieuId), write);
  }

  async deleteLieu(userId: string, lieuId: string): Promise<void> {
    const lieu = await this.getLieuById(userId, lieuId);
    if (!lieu) return;
    // Best-effort Storage cleanup; Firestore delete is authoritative.
    // Iterate `photos[]` (post-migration) AND the legacy
    // `sourceInstagram.screenshotStoragePath` (still present on pre-migration
    // docs) so a delete during the transition leaves no orphans behind.
    const pathsToDelete = new Set<string>();
    for (const p of lieu.photos) {
      if (p.storagePath && p.storagePath.startsWith(`users/${userId}/`)) {
        pathsToDelete.add(p.storagePath);
      }
    }
    const legacy = lieu.sourceInstagram.screenshotStoragePath;
    if (legacy && legacy.startsWith(`users/${userId}/`)) {
      pathsToDelete.add(legacy);
    }
    for (const p of pathsToDelete) {
      try {
        await deleteObject(ref(storage, p));
      } catch (err) {
        console.warn('[deleteLieu] storage cleanup failed', p, err);
      }
    }
    await deleteDoc(doc(this.lieuxCol(userId), lieuId));
  }

  async extractFromScreenshot(
    imageBase64: string,
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
    captionText?: string,
  ): Promise<LieuExtracted> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    // Only include captionText when it's a non-empty string — the Cloud Function
    // ignores undefined but a stray empty string would still show up in the
    // prompt builder's null check as truthy noise.
    const trimmedCaption = captionText?.trim();
    const payload =
      trimmedCaption && trimmedCaption.length > 0
        ? { imageBase64, mediaType, captionText: trimmedCaption }
        : { imageBase64, mediaType };
    const res = await fetch(EXTRACT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: payload }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`extract HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { result: LieuExtracted };
    return json.result;
  }

  async extractFromInstagramUrl(instagramUrl: string): Promise<LieuExtracted> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const res = await fetch(EXTRACT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { instagramUrl } }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`extract HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { result: LieuExtracted };
    return json.result;
  }

  async getScreenshotUrl(storagePath: string): Promise<string> {
    return getDownloadURL(ref(storage, storagePath));
  }

  async resaveFromNetwork(
    sourceLieu: Lieu,
    credit: { uid: string; username: string },
  ): Promise<Lieu> {
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    const myUid = me.uid;

    // Dedup — mirror the UploadScreen pattern. A pin within 100m is treated
    // as the same venue and the resave is rejected. The UI catches
    // LieuDuplicateError to surface a friendlier "déjà dans ta collection".
    const existing = await this.getAllLieux(myUid);
    const dup = existing.find(
      (l) => haversineMeters(l.lat, l.lng, sourceLieu.lat, sourceLieu.lng) < DUPLICATE_DISTANCE_M,
    );
    if (dup) throw new LieuDuplicateError(dup);

    const lieuRef = doc(this.lieuxCol(myUid));
    const now = serverTimestamp();
    // NOTE: `photos[]` is copied by REFERENCE — the same Storage objects are
    // now referenced by two Firestore docs. This is intentional: saves are
    // free, storage isn't, and account-delete only nukes photos under the
    // deleting user's own path (best-effort — see `deleteLieu`). The account
    // cascade nullifies attribution on downstream pins but does not touch the
    // storage refs — orphaned pins would still resolve via the URL until
    // Storage GC.
    const data: Record<string, unknown> = {
      userId: myUid,
      name: sourceLieu.name,
      nameNormalized: sourceLieu.nameNormalized ?? normalizeName(sourceLieu.name),
      city: sourceLieu.city,
      country: sourceLieu.country,
      address: sourceLieu.address,
      lat: sourceLieu.lat,
      lng: sourceLieu.lng,
      category: sourceLieu.category,
      description: sourceLieu.description,
      sourceInstagram: {
        // Provenance metadata survives even if the origin photo is later
        // deleted from the gallery (parent PRD #34 user story #13). We
        // preserve the deprecated legacy screenshot path only when it's
        // present on the source (pre-migration source docs), so the new pin
        // still renders even before the backfill has re-shaped the source.
        author: sourceLieu.sourceInstagram.author,
        ...(sourceLieu.sourceInstagram.screenshotStoragePath
          ? { screenshotStoragePath: sourceLieu.sourceInstagram.screenshotStoragePath }
          : {}),
      },
      photos: sourceLieu.photos.map((p) => ({
        storagePath: p.storagePath,
        source: p.source,
        addedAt: p.addedAt,
      })),
      userNotes: null,
      savedFromUserId: credit.uid,
      savedFromUsername: credit.username,
      // #41 — resaves land in MY wishlist regardless of the source's status.
      // Status is about my relation to the place, not the source's.
      status: 'wishlist',
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(lieuRef, data);

    const created = await this.getLieuById(myUid, lieuRef.id);
    if (!created) throw new Error('Failed to read back resaved lieu');
    return created;
  }

  async addPhoto(
    userId: string,
    lieuId: string,
    imageUri: string,
    source: 'user',
  ): Promise<LieuPhoto> {
    // Cap check BEFORE the Storage upload — we don't want to burn an upload
    // just to reject the write. Read the current doc via getDoc (not a
    // transaction) since the cap is a soft invariant enforced client-side; a
    // race between two concurrent adds is exceedingly unlikely on a personal
    // gallery and would at worst produce an 11th photo, not corrupt state.
    const lieuRef = doc(this.lieuxCol(userId), lieuId);
    const snap = await getDoc(lieuRef);
    if (!snap.exists()) {
      throw new Error(`Lieu ${lieuId} not found for user ${userId}`);
    }
    const current = this.readPhotos(snap.data());
    if (current.length >= MAX_PHOTOS_PER_LIEU) {
      throw new PhotoCapReachedError(lieuId);
    }

    // Random storage segment. Firestore auto-ids are 20 chars a-zA-Z0-9 — use
    // the same shape via a fresh doc ref under the same lieux collection just
    // to get an id, without actually writing that doc.
    const photoId = doc(this.lieuxCol(userId)).id;
    const storagePath = `users/${userId}/photos/${lieuId}/${photoId}.jpg`;

    const blob = await fetch(imageUri).then((r) => r.blob());
    await uploadBytes(ref(storage, storagePath), blob, {
      contentType: 'image/jpeg',
    });

    // Read a fresh copy inside the transaction to avoid stomping a concurrent
    // reorder/delete. Both read + write happen atomically.
    let created: LieuPhoto | null = null;
    await runTransaction(db, async (tx) => {
      const fresh = await tx.get(lieuRef);
      if (!fresh.exists()) {
        throw new Error(`Lieu ${lieuId} vanished between read and write`);
      }
      const freshPhotos = this.readPhotos(fresh.data());
      if (freshPhotos.length >= MAX_PHOTOS_PER_LIEU) {
        throw new PhotoCapReachedError(lieuId);
      }
      const photo: LieuPhoto = {
        storagePath,
        source,
        addedAt: Timestamp.now(),
      };
      tx.update(lieuRef, {
        photos: [...freshPhotos, photo],
        updatedAt: serverTimestamp(),
      });
      created = photo;
    }).catch(async (err) => {
      // Roll back the Storage upload if the Firestore transaction fails —
      // otherwise we'd leave an orphaned blob.
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (cleanupErr) {
        console.warn('[addPhoto] rollback delete failed', cleanupErr);
      }
      throw err;
    });
    if (!created) throw new Error('addPhoto: transaction did not commit');
    return created;
  }

  async removePhoto(
    userId: string,
    lieuId: string,
    storagePath: string,
  ): Promise<void> {
    const lieuRef = doc(this.lieuxCol(userId), lieuId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lieuRef);
      if (!snap.exists()) return;
      const current = this.readPhotos(snap.data());
      const next = current.filter((p) => p.storagePath !== storagePath);
      if (next.length === current.length) return; // path not in gallery
      tx.update(lieuRef, {
        photos: next,
        updatedAt: serverTimestamp(),
      });
    });
    // Best-effort Storage cleanup after the Firestore write commits. If the
    // blob was already gone (e.g. deleted by a prior partial failure), this
    // silently no-ops.
    try {
      await deleteObject(ref(storage, storagePath));
    } catch (err) {
      console.warn('[removePhoto] storage cleanup failed', err);
    }
  }

  async reorderPhotos(
    userId: string,
    lieuId: string,
    orderedStoragePaths: string[],
  ): Promise<void> {
    const lieuRef = doc(this.lieuxCol(userId), lieuId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lieuRef);
      if (!snap.exists()) {
        throw new Error(`Lieu ${lieuId} not found for user ${userId}`);
      }
      const current = this.readPhotos(snap.data());
      if (orderedStoragePaths.length !== current.length) {
        throw new Error(
          `reorderPhotos: expected ${current.length} paths, got ${orderedStoragePaths.length}`,
        );
      }
      const nextSet = new Set(orderedStoragePaths);
      if (nextSet.size !== orderedStoragePaths.length) {
        throw new Error('reorderPhotos: duplicate storagePath in input');
      }
      const byPath = new Map(current.map((p) => [p.storagePath, p]));
      const reordered: LieuPhoto[] = [];
      for (const path of orderedStoragePaths) {
        const found = byPath.get(path);
        if (!found) {
          throw new Error(`reorderPhotos: unknown storagePath ${path}`);
        }
        reordered.push(found);
      }
      tx.update(lieuRef, {
        photos: reordered,
        updatedAt: serverTimestamp(),
      });
    });
  }

  /**
   * Normalize the `photos` field off a raw Firestore doc. Handles both the
   * new shape (array of {@link LieuPhoto}) and the pre-#35 shape (missing
   * field, single `sourceInstagram.screenshotStoragePath`). Never writes back.
   *
   * Kept as a small helper on the class because the add/remove/reorder
   * transactions read fresh Firestore data mid-transaction and only need the
   * photos array — running the full `hydrateLieuFromRaw` there would be
   * wasteful.
   */
  private readPhotos(data: Record<string, unknown>): LieuPhoto[] {
    return hydrateLieuFromRaw('', data).photos;
  }

  private hydrate(id: string, data: Record<string, unknown>): Lieu {
    return hydrateLieuFromRaw(id, data);
  }
}

/**
 * 10-char base36 random string used as the storage `photoId`. Matches the
 * `users/{uid}/photos/{lieuId}/{photoId}.jpg` layout from parent PRD #34.
 * Collision-free within a pin's folder is enough — pins are already scoped
 * by lieuId, so ~60 bits of entropy is overkill in practice.
 */
function randomPhotoId(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0');
}

