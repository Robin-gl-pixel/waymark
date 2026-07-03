import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../auth/firebase';
import { Lieu, LieuInput, LieuExtracted } from '../types/Lieu';
import { LieuxService, LieuDuplicateError, DUPLICATE_DISTANCE_M } from './lieuxService';
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
    patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes' | 'status'>>,
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
      sourceInstagram: data.sourceInstagram as Lieu['sourceInstagram'],
      userNotes: (data.userNotes as string) ?? null,
      savedFromUserId: (data.savedFromUserId as string | null | undefined) ?? null,
      savedFromUsername: (data.savedFromUsername as string | null | undefined) ?? null,
      // Wave-2 addition — undefined on pre-migration docs, coerce to null so
      // the toggle renders as unclassified rather than crashing on a strict
      // narrow.
      status: (data.status as Lieu['status'] | undefined) ?? null,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
    };
  }
}

