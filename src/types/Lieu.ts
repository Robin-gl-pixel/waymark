export type LieuCategory = 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre';

/**
 * Owner's relation to a lieu — `wishlist` = «Envie», `visited` = «Allé», null
 * = unclassified. Surfaced by `<StatusToggle>` in owner mode and by
 * `<BadgeText>` in friend/follower mode. Persistence lives on the pin
 * document; wave 2 introduces the field, wave 3 will handle the social
 * follow-gate rules.
 */
export type LieuStatus = 'wishlist' | 'visited';

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
  /**
   * Lowercased, NFD-stripped, whitespace-collapsed form of `name`. Written
   * automatically on create/update. Used by the extract Cloud Function to look
   * up an already-known lieu across all users (collectionGroup query) before
   * hitting Claude/Google/Mapbox — dedup + zero API cost when someone already
   * added this venue.
   */
  nameNormalized: string;
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
  /**
   * Owner-set relation to the pin: `wishlist` («Envie») / `visited` («Allé»)
   * / `null` (unclassified). Only the owner writes it — friends read it to
   * render `<BadgeText>` under the address on their view of the pin.
   * Undefined on pre-wave-2 docs; treat as `null`.
   */
  status?: LieuStatus | null;
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
