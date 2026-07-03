import { Lieu, LieuInput, LieuExtracted, LieuPhoto, Timestamp } from '../types/Lieu';
import {
  LieuxService,
  LieuDuplicateError,
  DUPLICATE_DISTANCE_M,
  MAX_PHOTOS_PER_LIEU,
  PhotoCapReachedError,
} from './lieuxService';
import { normalizeName } from '../lib/normalize';

/** Great-circle distance in meters — mirror of the FirebaseLieuxService helper. */
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

/**
 * In-memory implementation of {@link LieuxService} used for unit tests.
 *
 * Backed by a per-user `Map<lieuId, Lieu>`, so tests can lock down the seam
 * contract without touching Firebase. Not for production use.
 */
export class InMemoryLieuxService implements LieuxService {
  /** userId -> lieuId -> Lieu */
  private readonly store = new Map<string, Map<string, Lieu>>();

  /**
   * The "signed-in user" for methods that don't take a userId parameter
   * (e.g. `resaveFromNetwork`). Tests set this via {@link setCurrentUid}.
   * Mirrors what `auth.currentUser?.uid` gives the Firebase impl.
   */
  private currentUid: string | null = null;

  /** Monotonic counter driving both id generation and timestamps to keep sort order deterministic. */
  private seq = 0;

  /** Test helper — impersonate a signed-in user for methods that read `auth`. */
  setCurrentUid(uid: string | null): void {
    this.currentUid = uid;
  }

  private bucket(userId: string): Map<string, Lieu> {
    let m = this.store.get(userId);
    if (!m) {
      m = new Map<string, Lieu>();
      this.store.set(userId, m);
    }
    return m;
  }

  private nextId(): string {
    this.seq += 1;
    return `mem-${this.seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private now(): Timestamp {
    // Tick the sequence so successive createLieu calls produce strictly-increasing timestamps
    // (matters for the `getAllLieux` sort test).
    this.seq += 1;
    const millis = Date.now() + this.seq;
    const seconds = Math.floor(millis / 1000);
    const nanoseconds = (millis % 1000) * 1_000_000;
    return {
      seconds,
      nanoseconds,
      toDate: () => new Date(millis),
      toMillis: () => millis,
    };
  }

  async getAllLieux(userId: string): Promise<Lieu[]> {
    const items = Array.from(this.bucket(userId).values());
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    return items;
  }

  async getLieuById(userId: string, lieuId: string): Promise<Lieu | null> {
    return this.bucket(userId).get(lieuId) ?? null;
  }

  async createLieu(userId: string, input: LieuInput): Promise<Lieu> {
    const id = this.nextId();
    const extFromMime: Record<LieuInput['screenshotMediaType'], string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    };
    const ext = extFromMime[input.screenshotMediaType];
    // Keep the (deprecated) `sourceInstagram.screenshotStoragePath` populated
    // with the same value the pre-#35 code path used to write, so any test
    // still asserting on that field continues to pass. The read path
    // synthesizes `photos[]` from this value when a doc is missing `photos`.
    const storagePath = `users/${userId}/screenshots/${id}.${ext}`;
    const ts = this.now();
    const photos: LieuPhoto[] = [
      { storagePath, source: 'insta', addedAt: ts },
    ];
    const lieu: Lieu = {
      id,
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
      photos,
      sourceInstagram: {
        author: input.sourceAuthor,
        screenshotStoragePath: storagePath,
      },
      userNotes: input.userNotes,
      createdAt: ts,
      updatedAt: ts,
    };
    this.bucket(userId).set(id, lieu);
    return lieu;
  }

  async updateLieu(
    userId: string,
    lieuId: string,
    patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes'>>,
  ): Promise<void> {
    const bucket = this.bucket(userId);
    const existing = bucket.get(lieuId);
    if (!existing) return;
    // Only allow the whitelisted fields — mirror the seam contract even though callers are typed.
    const allowed: Array<keyof typeof patch> = ['name', 'city', 'address', 'category', 'userNotes'];
    const filtered: Partial<Lieu> = {};
    for (const key of allowed) {
      if (key in patch && patch[key] !== undefined) {
        (filtered as Record<string, unknown>)[key] = patch[key];
      }
    }
    const updated: Lieu = {
      ...existing,
      ...filtered,
      nameNormalized:
        filtered.name !== undefined ? normalizeName(filtered.name as string) : existing.nameNormalized,
      updatedAt: this.now(),
    };
    bucket.set(lieuId, updated);
  }

  async deleteLieu(userId: string, lieuId: string): Promise<void> {
    this.bucket(userId).delete(lieuId);
  }

  async extractFromScreenshot(
    _imageBase64: string,
    _mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
    _captionText?: string,
  ): Promise<LieuExtracted> {
    // Fixed stub — unit tests don't exercise the extraction pipeline here.
    return {
      name: 'Stub Place',
      city: 'Stub City',
      country: 'Stub Country',
      address: '1 Stub Street',
      category: 'resto',
      description: null,
      sourceAuthor: null,
      lat: 0,
      lng: 0,
      mapboxId: null,
      addressCanonical: null,
    };
  }

  async extractFromInstagramUrl(_instagramUrl: string): Promise<LieuExtracted> {
    // Same stub — tests don't exercise the extraction pipeline.
    return {
      name: 'Stub Place (Insta URL)',
      city: 'Stub City',
      country: 'Stub Country',
      address: '1 Stub Street',
      category: 'resto',
      description: null,
      sourceAuthor: null,
      lat: 0,
      lng: 0,
      mapboxId: null,
      addressCanonical: null,
    };
  }

  async getScreenshotUrl(storagePath: string): Promise<string> {
    return `mem://${storagePath}`;
  }

  async resaveFromNetwork(
    sourceLieu: Lieu,
    credit: { uid: string; username: string },
  ): Promise<Lieu> {
    const myUid = this.currentUid;
    if (!myUid) throw new Error('Not signed in — call setCurrentUid() first');

    // Dedup — same 100m haversine as UploadScreen.
    const existing = await this.getAllLieux(myUid);
    const dup = existing.find(
      (l) => haversineMeters(l.lat, l.lng, sourceLieu.lat, sourceLieu.lng) < DUPLICATE_DISTANCE_M,
    );
    if (dup) throw new LieuDuplicateError(dup);

    const id = this.nextId();
    const ts = this.now();
    // Storage path is REFERENCED, not copied — this is the whole point of
    // the "save from network" flow (no duplicate uploads, no orphan blobs).
    const lieu: Lieu = {
      id,
      userId: myUid,
      name: sourceLieu.name,
      nameNormalized: sourceLieu.nameNormalized,
      city: sourceLieu.city,
      country: sourceLieu.country,
      address: sourceLieu.address,
      lat: sourceLieu.lat,
      lng: sourceLieu.lng,
      category: sourceLieu.category,
      description: sourceLieu.description,
      // Reference-copy the source's `photos[]` — same storagePaths, no Storage
      // duplication (matches the pre-#35 behavior on `screenshotStoragePath`).
      photos: sourceLieu.photos ? sourceLieu.photos.map((p) => ({ ...p })) : [],
      sourceInstagram: {
        author: sourceLieu.sourceInstagram.author,
        screenshotStoragePath: sourceLieu.sourceInstagram.screenshotStoragePath,
      },
      userNotes: null,
      savedFromUserId: credit.uid,
      savedFromUsername: credit.username,
      createdAt: ts,
      updatedAt: ts,
    };
    this.bucket(myUid).set(id, lieu);
    return lieu;
  }

  async addPhoto(
    userId: string,
    lieuId: string,
    imageUri: string,
    source: 'user',
  ): Promise<LieuPhoto> {
    this.assertOwnership(userId);
    const bucket = this.bucket(userId);
    const existing = bucket.get(lieuId);
    if (!existing) throw new Error(`Lieu ${lieuId} not found for user ${userId}`);
    const current = existing.photos ?? [];
    if (current.length >= MAX_PHOTOS_PER_LIEU) {
      throw new PhotoCapReachedError(lieuId);
    }
    const photoId = this.nextId();
    // In-memory stub: we don't actually upload — the storagePath is a marker
    // that mirrors the shape produced by the Firebase impl so tests can assert
    // on it. `imageUri` is otherwise unused.
    void imageUri;
    const storagePath = `users/${userId}/photos/${lieuId}/${photoId}.jpg`;
    const photo: LieuPhoto = { storagePath, source, addedAt: this.now() };
    const updated: Lieu = {
      ...existing,
      photos: [...current, photo],
      updatedAt: this.now(),
    };
    bucket.set(lieuId, updated);
    return photo;
  }

  async removePhoto(
    userId: string,
    lieuId: string,
    storagePath: string,
  ): Promise<void> {
    this.assertOwnership(userId);
    const bucket = this.bucket(userId);
    const existing = bucket.get(lieuId);
    if (!existing) return;
    const current = existing.photos ?? [];
    const next = current.filter((p) => p.storagePath !== storagePath);
    // No-op if the path wasn't in the gallery — matches the "best-effort"
    // posture of the Firebase impl (Storage delete of a missing blob is
    // silently swallowed there too).
    if (next.length === current.length) return;
    const updated: Lieu = {
      ...existing,
      photos: next,
      updatedAt: this.now(),
    };
    bucket.set(lieuId, updated);
  }

  async reorderPhotos(
    userId: string,
    lieuId: string,
    orderedStoragePaths: string[],
  ): Promise<void> {
    this.assertOwnership(userId);
    const bucket = this.bucket(userId);
    const existing = bucket.get(lieuId);
    if (!existing) throw new Error(`Lieu ${lieuId} not found for user ${userId}`);
    const current = existing.photos ?? [];
    // Set-equality check: same count, same members (unordered). Reject on
    // any mismatch — the caller shouldn't be able to sneak in / lose a photo
    // via reorder.
    if (orderedStoragePaths.length !== current.length) {
      throw new Error(
        `reorderPhotos: expected ${current.length} paths, got ${orderedStoragePaths.length}`,
      );
    }
    const currentSet = new Set(current.map((p) => p.storagePath));
    const nextSet = new Set(orderedStoragePaths);
    if (nextSet.size !== orderedStoragePaths.length) {
      throw new Error('reorderPhotos: duplicate storagePath in input');
    }
    for (const path of orderedStoragePaths) {
      if (!currentSet.has(path)) {
        throw new Error(`reorderPhotos: unknown storagePath ${path}`);
      }
    }
    const byPath = new Map(current.map((p) => [p.storagePath, p]));
    const reordered = orderedStoragePaths.map((path) => byPath.get(path)!);
    const updated: Lieu = {
      ...existing,
      photos: reordered,
      updatedAt: this.now(),
    };
    bucket.set(lieuId, updated);
  }

  /**
   * Simulate the Firestore rules check that gates each photo mutation on
   * `request.auth.uid == userId`. When {@link currentUid} is impersonated,
   * calling any of the new methods with a `userId` that doesn't match throws
   * — mirroring the "cross-user write rejected" behavior a rules test would
   * assert against the emulator. When `currentUid` is null (the default in
   * pre-#38 tests), no check is applied so existing tests keep passing.
   */
  private assertOwnership(userId: string): void {
    if (this.currentUid !== null && this.currentUid !== userId) {
      throw new Error(
        `Cross-user access rejected: signed-in uid ${this.currentUid} != userId ${userId}`,
      );
    }
  }

  /** Test helper: wipe all state. */
  reset(): void {
    this.store.clear();
    this.currentUid = null;
    this.seq = 0;
  }
}
