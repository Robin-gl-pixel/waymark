import type { Lieu } from '../types/Lieu';
import type {
  UserProfile,
  ProfileInput,
  ReportInput,
  ActivityPage,
} from '../types/User';

/**
 * Sole seam between UI and social data (users, follow graph, block, report,
 * feed, activity). Mirrors the `lieuxService` pattern: interface + Firebase
 * implementation + in-memory implementation for tests.
 *
 * Rules (from PRD V1 Social Layer):
 * - Follow model = asymmetric (Insta-style).
 * - `isPublic` defaults to true. A user with `isPublic: false` is invisible
 *   in feed, search, and profile reads (enforced at rules AND at query time).
 * - `block(uid)` is bidirectional-unfollow-forced: creates a block entry AND
 *   removes any existing follow relationship in both directions.
 * - `getFeed()` returns only pins from users I follow that are `isPublic`, and
 *   filters out users I've blocked, sorted `createdAt` desc, page 20.
 *
 * Consumers should NEVER instantiate an implementation directly — go through
 * `getSocialService()`.
 */
export interface FeedPage {
  items: Lieu[];
  cursor: string | null;
}

export interface SocialService {
  // --- Profile ---
  /** The signed-in user's profile, or null if not yet created (pre-PickUsername). */
  getMyProfile(): Promise<UserProfile | null>;
  getUserByUid(uid: string): Promise<UserProfile | null>;
  getUserByUsername(username: string): Promise<UserProfile | null>;
  /**
   * Create or update the current user's profile. Enforces:
   * - regex /^[a-z0-9._]{3,20}$/
   * - uniqueness (throws if taken)
   * - reserved-username blacklist (throws if reserved)
   * - 30-day cooldown between username changes (throws if too soon)
   */
  upsertProfile(input: ProfileInput): Promise<UserProfile>;
  setProfileVisibility(isPublic: boolean): Promise<void>;

  // --- iOS Shortcut token (#7) ---
  /**
   * Return the current user's Shortcut auth token, minting one on first call.
   *
   * The token is 32 bytes of CSPRNG output rendered as lowercase hex (64
   * chars). It's persisted on `/users/{uid}.shortcutToken`. Subsequent calls
   * return the same token — the Settings screen relies on this to render a
   * stable "copy me" value across renders. Use {@link regenerateShortcutToken}
   * to rotate.
   */
  getOrCreateShortcutToken(): Promise<string>;

  /**
   * Rotate the Shortcut auth token — mint a fresh 32-byte hex, overwrite
   * `/users/{uid}.shortcutToken`, return the new value. Any previously
   * configured Shortcut on the user's iCloud stops working until they paste
   * the new token in.
   */
  regenerateShortcutToken(): Promise<string>;

  // --- Search ---
  /** Exact-match on username in V1 (no fuzzy). Max 20 results. */
  searchUsers(query: string): Promise<UserProfile[]>;

  // --- Follow ---
  follow(uid: string): Promise<void>;
  unfollow(uid: string): Promise<void>;
  getFollowing(uid: string): Promise<UserProfile[]>;
  getFollowers(uid: string): Promise<UserProfile[]>;
  isFollowing(uid: string): Promise<boolean>;

  // --- Block ---
  block(uid: string): Promise<void>;
  unblock(uid: string): Promise<void>;
  getBlocked(): Promise<UserProfile[]>;
  isBlocked(uid: string): Promise<boolean>;

  // --- Report ---
  report(input: ReportInput): Promise<void>;

  // --- Feed (Réseau tab) ---
  getFeed(cursor?: string): Promise<FeedPage>;

  // --- Activity (badges + list on MyProfile) ---
  getActivity(cursor?: string): Promise<ActivityPage>;
  markActivityRead(activityId: string): Promise<void>;
  getUnreadActivityCount(): Promise<number>;
}

// -----------------------------------------------------------------------------
// Service resolution — mirrors the lieuxService pattern.
// -----------------------------------------------------------------------------

let instance: SocialService | null = null;

export function getSocialService(): SocialService {
  if (!instance) {
    // Late-import so test setups can inject before this is ever called.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FirebaseSocialService } = require('./firebaseSocialService');
    instance = new FirebaseSocialService();
  }
  return instance!;
}

/** Test-only. Reset by calling setSocialServiceForTests(null as any). */
export function setSocialServiceForTests(svc: SocialService): void {
  instance = svc;
}
