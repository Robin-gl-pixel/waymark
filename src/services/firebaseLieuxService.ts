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
  updateDoc,
  deleteDoc,
  Timestamp,
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
    // upload and leave storagePath empty ; LieuDetail / feed rows must handle
    // the absence gracefully (no <Image> when path is falsy).
    let storagePath = '';
    if (input.screenshotUri && input.screenshotUri.length > 0) {
      storagePath = `users/${userId}/screenshots/${lieuId}.${ext}`;
      // Firebase JS SDK v9+ on RN Hermes throws "Creating blobs from ArrayBuffer…"
      // for both uploadBytes(Uint8Array) and uploadString(base64) — both wrap in Blob internally.
      // fetch(uri).blob() returns a native RN Blob (BlobModule) that XHR can upload correctly.
      const blob = await fetch(input.screenshotUri).then((r) => r.blob());
      await uploadBytes(ref(storage, storagePath), blob, {
        contentType: input.screenshotMediaType,
      });
    }

    // 2. Write Firestore doc.
    const now = serverTimestamp();
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
        screenshotStoragePath: storagePath,
      },
      userNotes: input.userNotes,
      createdAt: now,
      updatedAt: now,
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
    patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes'>>,
  ): Promise<void> {
    const write: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
    if (patch.name !== undefined) {
      write.nameNormalized = normalizeName(patch.name);
    }
    await updateDoc(doc(this.lieuxCol(userId), lieuId), write);
  }

  async deleteLieu(userId: string, lieuId: string): Promise<void> {
    const lieu = await this.getLieuById(userId, lieuId);
    if (!lieu) return;
    // Best-effort Storage cleanup; Firestore delete is authoritative.
    try {
      await deleteObject(ref(storage, lieu.sourceInstagram.screenshotStoragePath));
    } catch (err) {
      console.warn('[deleteLieu] storage cleanup failed', err);
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
    // NOTE: `screenshotStoragePath` is copied by REFERENCE — the same file in
    // Storage is now referenced by two Firestore docs. This is intentional:
    // saves are free, storage isn't, and account-delete only nukes screenshots
    // under the deleting user's own path (best-effort). The account cascade
    // nullifies attribution on downstream pins but does not touch the storage
    // ref — orphaned pins would still resolve via the URL until Storage GC.
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
        author: sourceLieu.sourceInstagram.author,
        screenshotStoragePath: sourceLieu.sourceInstagram.screenshotStoragePath,
      },
      userNotes: null,
      savedFromUserId: credit.uid,
      savedFromUsername: credit.username,
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
   * Normalize the `photos` field off a raw Firestore doc — handles both the
   * new shape (array of {@link LieuPhoto}) and the pre-#35 shape (missing
   * field, single `sourceInstagram.screenshotStoragePath`). Never writes back.
   */
  private readPhotos(data: Record<string, unknown>): LieuPhoto[] {
    const raw = data.photos;
    if (Array.isArray(raw)) {
      // Cast is safe because the shape is enforced by our own writes; if a
      // migration bug corrupts a doc, downstream code will surface it.
      return raw as LieuPhoto[];
    }
    // Read-compat: synthesize a single-element gallery from the deprecated
    // field if present. This is a read-only synthesis — no Firestore write.
    const src = data.sourceInstagram as Lieu['sourceInstagram'] | undefined;
    if (src?.screenshotStoragePath) {
      const addedAt =
        (data.createdAt as Timestamp | undefined) ?? Timestamp.now();
      return [
        {
          storagePath: src.screenshotStoragePath,
          source: 'insta',
          addedAt,
        },
      ];
    }
    return [];
  }

  private hydrate(id: string, data: Record<string, unknown>): Lieu {
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
      photos: this.readPhotos(data),
      sourceInstagram: data.sourceInstagram as Lieu['sourceInstagram'],
      userNotes: (data.userNotes as string) ?? null,
      savedFromUserId: (data.savedFromUserId as string | null | undefined) ?? null,
      savedFromUsername: (data.savedFromUsername as string | null | undefined) ?? null,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
    };
  }
}

