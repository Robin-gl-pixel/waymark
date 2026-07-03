import { Lieu, LieuInput, LieuExtracted, Timestamp } from '../types/Lieu';
import { LieuxService, LieuDuplicateError, DUPLICATE_DISTANCE_M } from './lieuxService';
import { normalizeName } from '../lib/normalize';
import { hydrateLieuFromRaw } from './hydrateLieu';

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
 * Backed by a per-user `Map<lieuId, RawDoc>` — RawDoc mirrors what Firestore
 * stores, so the read layer exercises the same `hydrateLieuFromRaw` path as
 * the Firebase impl. This lets tests inject legacy-shaped docs (via
 * {@link seedRawDoc}) to verify the `photos[]` read-compat synthesis.
 *
 * Not for production use.
 */
export class InMemoryLieuxService implements LieuxService {
  /** userId -> lieuId -> raw Firestore-shaped doc */
  private readonly store = new Map<string, Map<string, Record<string, unknown>>>();

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

  private bucket(userId: string): Map<string, Record<string, unknown>> {
    let m = this.store.get(userId);
    if (!m) {
      m = new Map<string, Record<string, unknown>>();
      this.store.set(userId, m);
    }
    return m;
  }

  private nextId(): string {
    this.seq += 1;
    return `mem-${this.seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private randomPhotoId(): string {
    return Math.random().toString(36).slice(2, 12).padEnd(10, '0');
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
    const items = Array.from(this.bucket(userId).entries()).map(([id, data]) =>
      hydrateLieuFromRaw(id, data),
    );
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    return items;
  }

  async getLieuById(userId: string, lieuId: string): Promise<Lieu | null> {
    const raw = this.bucket(userId).get(lieuId);
    if (!raw) return null;
    return hydrateLieuFromRaw(lieuId, raw);
  }

  async createLieu(userId: string, input: LieuInput): Promise<Lieu> {
    const id = this.nextId();
    const extFromMime: Record<LieuInput['screenshotMediaType'], string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    };
    const ext = extFromMime[input.screenshotMediaType];
    const ts = this.now();
    // NEW SCHEMA (parent PRD #34, slice #35): photos[] holds one insta-sourced
    // entry on create. `sourceInstagram.screenshotStoragePath` is DELIBERATELY
    // omitted on write — the read-compat path only synthesises photos[] when
    // it sees a legacy doc (screenshotStoragePath present, photos absent).
    let photos: Array<{ storagePath: string; source: 'insta'; addedAt: Timestamp }> = [];
    if (input.screenshotUri && input.screenshotUri.length > 0) {
      const photoId = this.randomPhotoId();
      const storagePath = `users/${userId}/photos/${id}/${photoId}.${ext}`;
      photos = [{ storagePath, source: 'insta', addedAt: ts }];
    }
    const raw: Record<string, unknown> = {
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
      // #41 — new pins default to wishlist; visitedAt stays undefined until
      // the user flips the toggle to 'visited'.
      status: 'wishlist',
      createdAt: ts,
      updatedAt: ts,
    };
    this.bucket(userId).set(id, raw);
    return hydrateLieuFromRaw(id, raw);
  }

  async updateLieu(
    userId: string,
    lieuId: string,
    patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes' | 'status'>>,
  ): Promise<void> {
    const bucket = this.bucket(userId);
    const existing = bucket.get(lieuId);
    if (!existing) return;
    // Only allow the whitelisted fields — mirror the seam contract even though callers are typed.
    // NOTE: `visitedAt` is intentionally NOT in this list — it's service-managed
    // via the status invariant below (#41).
    const allowed: Array<keyof typeof patch> = [
      'name',
      'city',
      'address',
      'category',
      'userNotes',
      'status',
    ];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in patch && patch[key] !== undefined) {
        filtered[key] = patch[key];
      }
    }
    const nameNormalized =
      filtered.name !== undefined ? normalizeName(filtered.name as string) : existing.nameNormalized;
    const nextRaw: Record<string, unknown> = {
      ...existing,
      ...filtered,
      nameNormalized,
      updatedAt: this.now(),
    };
    // #41 — enforce the visitedAt invariant. Transition INTO 'visited' stamps
    // visitedAt with the current time; any other status transition clears it.
    // Mirror this logic identically in FirebaseLieuxService.
    if ('status' in filtered) {
      if (filtered.status === 'visited') {
        nextRaw.visitedAt = this.now();
      } else {
        delete nextRaw.visitedAt;
      }
    }
    bucket.set(lieuId, nextRaw);
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
      photoBoundingBox: null,
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
      photoBoundingBox: null,
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
    // Storage paths are REFERENCED, not copied — this is the whole point of
    // the "save from network" flow (no duplicate uploads, no orphan blobs).
    const raw: Record<string, unknown> = {
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
      sourceInstagram: {
        author: sourceLieu.sourceInstagram.author,
        // Preserve the legacy pointer only if the source still carries it
        // (pre-migration source docs) — matches the Firebase impl so a
        // resave during the transition doesn't lose the read-compat handle.
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
      // #41 — status is about MY relation to the place, not the source's.
      // Fresh resaves always land in my wishlist regardless of what the
      // source pin was tagged as.
      status: 'wishlist',
      createdAt: ts,
      updatedAt: ts,
    };
    this.bucket(myUid).set(id, raw);
    return hydrateLieuFromRaw(id, raw);
  }

  /**
   * Test helper — inject a raw Firestore-shaped doc bypassing `createLieu`.
   *
   * Used by the read-compat suite to simulate a pre-migration doc that only
   * carries `sourceInstagram.screenshotStoragePath` (no `photos[]`). The
   * hydrator's synthesis path is verified by reading the pin back through
   * the normal seam methods.
   */
  seedRawDoc(userId: string, lieuId: string, raw: Record<string, unknown>): void {
    this.bucket(userId).set(lieuId, raw);
  }

  /** Test helper: wipe all state. */
  reset(): void {
    this.store.clear();
    this.currentUid = null;
    this.seq = 0;
  }
}
