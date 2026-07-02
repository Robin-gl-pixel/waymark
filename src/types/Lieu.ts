export type LieuCategory = 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre';

// Structural match for firebase/firestore Timestamp so screens don't need to import from firebase/*.
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

/**
 * A persisted place in Waymark. Lives at `/users/{uid}/lieux/{lieuId}`.
 */
export interface Lieu {
  id: string;
  userId: string;
  name: string;
  city: string;
  country: string;
  address: string;
  lat: number;
  lng: number;
  category: LieuCategory;
  description: string | null;
  sourceInstagram: {
    author: string | null;
    screenshotStoragePath: string;
  };
  userNotes: string | null;
  /**
   * Attribution — set when the pin was re-saved from another user's collection
   * via `LieuxService.resaveFromNetwork` (#13). Points at the *immediate* saver,
   * not the original creator of the chain. Nullified by the account-delete
   * cascade if that user disappears (see functions/src/lib/socialCascade.ts).
   * Undefined on pre-#13 pins and on pins the user uploaded themselves.
   */
  savedFromUserId?: string | null;
  savedFromUsername?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Shape returned by the `extract` Cloud Function. Nullable everywhere because
 * a screenshot may fail to yield a specific field — the UI surfaces this to the
 * user for correction before saving.
 */
export interface LieuExtracted {
  name: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  category: LieuCategory | null;
  description: string | null;
  sourceAuthor: string | null;
  lat: number | null;
  lng: number | null;
  mapboxId: string | null;
  addressCanonical: string | null;
}

/**
 * User-facing input when confirming an extraction. Everything is guaranteed non-null
 * at this layer — the confirm screen defaults + requires the missing fields.
 */
export interface LieuInput {
  name: string;
  city: string;
  country: string;
  address: string;
  lat: number;
  lng: number;
  category: LieuCategory;
  description: string | null;
  sourceAuthor: string | null;
  userNotes: string | null;
  screenshotUri: string;
  screenshotMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  /**
   * Optional attribution — populated only when the input represents a re-save
   * from another user's pin (`LieuxService.resaveFromNetwork`, #13). The
   * standard upload path leaves both null.
   */
  savedFromUserId?: string | null;
  savedFromUsername?: string | null;
}
