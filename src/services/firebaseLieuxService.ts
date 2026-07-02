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
import { LieuxService } from './lieuxService';

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
    const storagePath = `users/${userId}/screenshots/${lieuId}.${ext}`;
    // Firebase JS SDK v9+ on RN Hermes throws "Creating blobs from ArrayBuffer…"
    // for both uploadBytes(Uint8Array) and uploadString(base64) — both wrap in Blob internally.
    // fetch(uri).blob() returns a native RN Blob (BlobModule) that XHR can upload correctly.
    const blob = await fetch(input.screenshotUri).then((r) => r.blob());
    await uploadBytes(ref(storage, storagePath), blob, {
      contentType: input.screenshotMediaType,
    });

    // 2. Write Firestore doc.
    const now = serverTimestamp();
    const data = {
      userId,
      name: input.name,
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
    await updateDoc(doc(this.lieuxCol(userId), lieuId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
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
  ): Promise<LieuExtracted> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const res = await fetch(EXTRACT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { imageBase64, mediaType } }),
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

  private hydrate(id: string, data: Record<string, unknown>): Lieu {
    return {
      id,
      userId: data.userId as string,
      name: data.name as string,
      city: data.city as string,
      country: data.country as string,
      address: data.address as string,
      lat: data.lat as number,
      lng: data.lng as number,
      category: data.category as Lieu['category'],
      description: (data.description as string) ?? null,
      sourceInstagram: data.sourceInstagram as Lieu['sourceInstagram'],
      userNotes: (data.userNotes as string) ?? null,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
    };
  }
}

