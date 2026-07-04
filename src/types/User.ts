import type { Timestamp } from './Lieu';

/**
 * A user profile in Pinti. Lives at `/users/{uid}`.
 * Written at signup + username pick, updated via SettingsScreen.
 *
 * `isPublic` defaults to true — matches the "Mapstr-style" social positioning
 * decided in the /grill-me session (see docs/PRD.md V1 Social Layer).
 * `isCurated` is true ONLY for the official @waymark.paris.* accounts.
 */
export interface UserProfile {
  uid: string;
  username: string;                     // unique, lowercase, /^[a-z0-9._]{3,20}$/
  displayName: string | null;           // from Apple Sign In
  email: string | null;
  isPublic: boolean;                    // default true
  isCurated: boolean;                   // default false; true for @waymark.*
  followersCount: number;               // denormalized, kept in sync by Cloud Fn
  followingCount: number;               // denormalized, kept in sync by Cloud Fn
  avatarUrl: string | null;             // V2 (V1: null everywhere)
  bio: string | null;                   // V2 (V1: null everywhere)
  usernameChangedAt: Timestamp | null;  // for the 30-day cooldown on renames
  /**
   * Personal secret used by the iOS Shortcut integration (#7) to authenticate
   * a call to the `extractFromShortcut` Cloud Function without a Firebase ID
   * token. 32-byte hex (64 chars) — minted lazily on first visit to the
   * Shortcut Settings screen and rotated via `regenerateShortcutToken`.
   * `null` when the user hasn't opened Settings → Shortcut yet.
   */
  shortcutToken?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * User-facing input for creating/updating a profile. Non-username fields
 * are added over time (V2: avatar, bio).
 */
export interface ProfileInput {
  username: string;
}

/**
 * A moderation report — one row per user Report action. Written to top-level
 * `/reports/{reportId}`, readable only by admin SDK (Cloud Function → Slack).
 */
export type ReportReason = 'spam' | 'offensif' | 'faux';

export interface ReportInput {
  targetUid: string;
  targetLieuId?: string;      // set when reporting a specific pin, else profile-level
  reason: ReportReason;
  freeText?: string;          // max 200 chars, optional details
}

/**
 * An entry in the user's in-app "Activity" feed. Written by Cloud Function
 * triggers (never by the client directly).
 */
export type ActivityType = 'follow' | 'save';

export interface Activity {
  id: string;
  type: ActivityType;
  actorUid: string;
  actorUsername: string;
  targetLieuId?: string;      // set on type='save' — the lieu that was re-saved
  createdAt: Timestamp;
  read: boolean;
}

export interface ActivityPage {
  items: Activity[];
  cursor: string | null;      // null when no more pages
}
