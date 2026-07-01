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
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../auth/firebase';
import { Lieu, LieuInput, LieuExtracted } from '../types/Lieu';
import { LieuxService } from './lieuxService';

const FUNCTIONS_REGION = 'europe-west1';

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
    const bytes = base64ToUint8Array(input.screenshotBase64);
    await uploadBytes(ref(storage, storagePath), bytes, {
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
    const functions = getFunctions(undefined, FUNCTIONS_REGION);
    const callable = httpsCallable<
      { imageBase64: string; mediaType: string },
      LieuExtracted
    >(functions, 'extract');
    const result = await callable({ imageBase64, mediaType });
    return result.data;
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

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
