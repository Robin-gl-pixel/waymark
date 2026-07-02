import type { Timestamp } from '../types/Lieu';
import type {
  UserProfile,
  ProfileInput,
  ReportInput,
  ReportReason,
  ActivityPage,
} from '../types/User';
import type { SocialService, FeedPage } from './socialService';

/**
 * Firebase-backed implementation. Methods are stubbed at scaffolding time —
 * each social slice (see GitHub issues #10, #12, #15…) fills in its piece.
 *
 * Anything hitting a stub throws `SocialNotImplemented` — this makes it
 * obvious in dev + tests which method a slice still needs to build.
 */
export class SocialNotImplemented extends Error {
  constructor(method: string) {
    super(`SocialService.${method} is not yet implemented — see the corresponding social slice issue on GitHub.`);
    this.name = 'SocialNotImplemented';
  }
}

// Firebase modules are loaded lazily inside methods (via `require`) so that
// consumers who only need the exported constants — `InMemorySocialService`,
// contract tests — don't drag `../auth/firebase` into their module graph.
// (`../auth/firebase` has an unrelated pre-existing type error that would
// otherwise break `ts-jest` for anything upstream.)
type FirebaseFirestore = typeof import('firebase/firestore');
type FirebaseAuthModule = { auth: { currentUser: { uid: string; displayName: string | null; email: string | null } | null }; db: unknown };

function loadFirebase(): FirebaseAuthModule & FirebaseFirestore {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const authMod = require('../auth/firebase') as FirebaseAuthModule;
  const fs = require('firebase/firestore') as FirebaseFirestore;
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { ...fs, auth: authMod.auth, db: authMod.db };
}

export class FirebaseSocialService implements SocialService {
  // --- Profile ---
  async getMyProfile(): Promise<UserProfile | null> {
    const { auth } = loadFirebase();
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    return this.getUserByUid(uid);
  }

  async getUserByUid(uid: string): Promise<UserProfile | null> {
    const { db, doc, getDoc } = loadFirebase();
    const snap = await getDoc(doc(db as never, 'users', uid));
    if (!snap.exists()) return null;
    return this.hydrateUser(uid, snap.data() as Record<string, unknown>);
  }

  async getUserByUsername(username: string): Promise<UserProfile | null> {
    const uname = username.toLowerCase().replace(/^@/, '');
    if (!uname) return null;
    const { db, doc, getDoc } = loadFirebase();
    const idx = await getDoc(doc(db as never, 'usernames', uname));
    if (!idx.exists()) return null;
    const uid = (idx.data() as { uid?: unknown } | undefined)?.uid;
    if (typeof uid !== 'string') return null;
    return this.getUserByUid(uid);
  }

  async upsertProfile(input: ProfileInput): Promise<UserProfile> {
    const { auth, db, doc, runTransaction, serverTimestamp } = loadFirebase();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not signed in');
    const uname = input.username.toLowerCase();
    if (!USERNAME_REGEX.test(uname)) throw new Error('Invalid username format');
    if (RESERVED_USERNAMES.has(uname)) throw new Error('Username is reserved');

    const uid = currentUser.uid;
    const displayName = currentUser.displayName ?? null;
    const email = currentUser.email ?? null;

    // Transaction serialises the availability check + writes so two clients
    // racing on the same username can't both win. The `usernames/{lc}` doc is
    // the lock; Firestore rules enforce owner-only writes on it as a second layer.
    await runTransaction(db as never, async (tx) => {
      const usernameRef = doc(db as never, 'usernames', uname);
      const userRef = doc(db as never, 'users', uid);

      const unameSnap = await tx.get(usernameRef);
      const userSnap = await tx.get(userRef);

      if (unameSnap.exists()) {
        const ownerUid = (unameSnap.data() as { uid?: unknown }).uid;
        if (ownerUid !== uid) throw new Error('Username already taken');
      }

      const now = serverTimestamp();

      if (userSnap.exists()) {
        const existing = userSnap.data() as Record<string, unknown>;
        const oldUname = (existing.username as string | undefined)?.toLowerCase();
        if (oldUname && oldUname !== uname) {
          const changedAt = existing.usernameChangedAt as { toMillis?: () => number } | null | undefined;
          if (changedAt && typeof changedAt.toMillis === 'function') {
            const sinceLast = Date.now() - changedAt.toMillis();
            if (sinceLast < USERNAME_CHANGE_COOLDOWN_MS) {
              throw new Error('Username change cooldown active (30 days)');
            }
          }
          tx.delete(doc(db as never, 'usernames', oldUname));
        }
        tx.update(userRef, {
          username: uname,
          usernameChangedAt: now,
          updatedAt: now,
        });
      } else {
        tx.set(userRef, {
          uid,
          username: uname,
          displayName,
          email,
          isPublic: true,
          isCurated: false,
          followersCount: 0,
          followingCount: 0,
          avatarUrl: null,
          bio: null,
          usernameChangedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (!unameSnap.exists()) {
        tx.set(usernameRef, { uid, createdAt: now });
      }
    });

    const created = await this.getUserByUid(uid);
    if (!created) throw new Error('Failed to read back created profile');
    return created;
  }

  async setProfileVisibility(_isPublic: boolean): Promise<void> { throw new SocialNotImplemented('setProfileVisibility'); }

  private hydrateUser(uid: string, data: Record<string, unknown>): UserProfile {
    return {
      uid: (data.uid as string) ?? uid,
      username: (data.username as string) ?? '',
      displayName: (data.displayName as string | null) ?? null,
      email: (data.email as string | null) ?? null,
      isPublic: (data.isPublic as boolean | undefined) ?? true,
      isCurated: (data.isCurated as boolean | undefined) ?? false,
      followersCount: (data.followersCount as number | undefined) ?? 0,
      followingCount: (data.followingCount as number | undefined) ?? 0,
      avatarUrl: (data.avatarUrl as string | null) ?? null,
      bio: (data.bio as string | null) ?? null,
      usernameChangedAt: (data.usernameChangedAt as Timestamp | null) ?? null,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
    };
  }

  // --- Search ---
  /**
   * Exact-match search on `username` (V1 — no fuzzy). The caller may pass a
   * leading `@` for UX; we strip it, lowercase, and query the `users`
   * collection with `where('username' == uname)` + `where('isPublic' == true)`.
   *
   * Excludes the signed-in user client-side (Firestore doesn't support
   * "not equal to a specific value" as a query filter). Capped at 20 hits —
   * exact match on a unique field will only ever return 0 or 1, but the limit
   * is kept in case V2 relaxes uniqueness or adds prefix support.
   */
  async searchUsers(query: string): Promise<UserProfile[]> {
    const uname = query.toLowerCase().replace(/^@/, '').trim();
    if (!uname) return [];
    const { auth, db, collection, query: fsQuery, where, limit, getDocs } = loadFirebase();
    const myUid = auth.currentUser?.uid;
    const q = fsQuery(
      collection(db as never, 'users'),
      where('username', '==', uname),
      where('isPublic', '==', true),
      limit(20),
    );
    const snap = await getDocs(q);
    return snap.docs
      .filter((d) => d.id !== myUid)
      .map((d) => this.hydrateUser(d.id, d.data() as Record<string, unknown>));
  }

  // --- Follow ---
  async follow(_uid: string): Promise<void> { throw new SocialNotImplemented('follow'); }
  async unfollow(_uid: string): Promise<void> { throw new SocialNotImplemented('unfollow'); }
  async getFollowing(_uid: string): Promise<UserProfile[]> { throw new SocialNotImplemented('getFollowing'); }
  async getFollowers(_uid: string): Promise<UserProfile[]> { throw new SocialNotImplemented('getFollowers'); }
  async isFollowing(_uid: string): Promise<boolean> { throw new SocialNotImplemented('isFollowing'); }

  // --- Block ---
  /**
   * Block a user (Apple guideline 1.2 compliance).
   *
   * Bidirectional forced unfollow: clean up every follow edge on MY side of the
   * graph in a single atomic batch. Server-side symmetry (removing my entry
   * from THEIR followers sub-collection) lives in a Cloud Function trigger
   * that owns the follow slice (#12).
   */
  async block(uid: string): Promise<void> {
    const { auth, db, doc, writeBatch, serverTimestamp } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    if (uid === me.uid) throw new Error('Cannot block yourself');

    const batch = writeBatch(db as never);
    batch.set(doc(db as never, `users/${me.uid}/blocks/${uid}`), {
      createdAt: serverTimestamp(),
    });
    batch.delete(doc(db as never, `users/${me.uid}/following/${uid}`));
    batch.delete(doc(db as never, `users/${me.uid}/followers/${uid}`));
    await batch.commit();
  }

  async unblock(uid: string): Promise<void> {
    const { auth, db, doc, deleteDoc } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    await deleteDoc(doc(db as never, `users/${me.uid}/blocks/${uid}`));
  }

  async getBlocked(): Promise<UserProfile[]> {
    const { auth, db, collection, getDocs } = loadFirebase();
    const me = auth.currentUser;
    if (!me) return [];
    const snap = await getDocs(collection(db as never, `users/${me.uid}/blocks`));
    const uids = snap.docs.map((d) => d.id);
    const profiles = await Promise.all(uids.map((uid) => this.getUserByUid(uid)));
    return profiles.filter((p): p is UserProfile => p !== null);
  }

  async isBlocked(uid: string): Promise<boolean> {
    const { auth, db, doc, getDoc } = loadFirebase();
    const me = auth.currentUser;
    if (!me) return false;
    const snap = await getDoc(doc(db as never, `users/${me.uid}/blocks/${uid}`));
    return snap.exists();
  }

  // --- Report ---
  /**
   * Create a moderation report. Client writes to `/reports/{reportId}` — an
   * `onDocumentCreated` Cloud Function relays it to a private Slack channel
   * where Robin reviews manually (V1 moderation posture per PRD).
   */
  async report(input: ReportInput): Promise<void> {
    const { auth, db, addDoc, collection, serverTimestamp } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    validateReportInput(input);
    await addDoc(collection(db as never, 'reports'), {
      reporterUid: me.uid,
      targetUid: input.targetUid,
      targetLieuId: input.targetLieuId ?? null,
      reason: input.reason,
      freeText: input.freeText ?? null,
      status: 'open',
      createdAt: serverTimestamp(),
    });
  }

  // --- Feed ---
  async getFeed(_cursor?: string): Promise<FeedPage> { throw new SocialNotImplemented('getFeed'); }

  // --- Activity ---
  async getActivity(_cursor?: string): Promise<ActivityPage> { throw new SocialNotImplemented('getActivity'); }
  async markActivityRead(_activityId: string): Promise<void> { throw new SocialNotImplemented('markActivityRead'); }
  async getUnreadActivityCount(): Promise<number> { throw new SocialNotImplemented('getUnreadActivityCount'); }
}

/**
 * Reserved usernames — hardcoded blacklist checked on upsertProfile.
 * Kept in code (not Firestore) so a compromised DB can't bypass it.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'waymark',
  'admin', 'root', 'staff', 'support', 'help', 'moderator', 'mod',
  'system', 'official', 'team', 'contact',
  'about', 'terms', 'privacy', 'legal', 'settings',
  'user', 'users', 'profile', 'profiles', 'account', 'accounts',
  'feed', 'search', 'discover', 'explore',
  'apple', 'google', 'facebook', 'instagram', 'twitter', 'meta', 'openai', 'anthropic',
  'null', 'undefined', 'nan', 'true', 'false',
]);

export const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;

export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Valid report reasons — matches ReportReason. Kept as an array for enum-style iteration in the UI. */
export const REPORT_REASONS: readonly ReportReason[] = ['spam', 'offensif', 'faux'] as const;

/** Max length of the optional freeText field on a report — matches the ReportScreen textarea cap. */
export const REPORT_FREETEXT_MAX_LENGTH = 200;

/**
 * Validate a `ReportInput` before it hits Firestore. Throws on invalid reason
 * or overlong freeText. Kept as a pure function so it's testable without a
 * Firebase environment.
 */
export function validateReportInput(input: ReportInput): void {
  if (!input || typeof input !== 'object') throw new Error('Invalid report input');
  if (!input.targetUid || typeof input.targetUid !== 'string') {
    throw new Error('targetUid is required');
  }
  if (!REPORT_REASONS.includes(input.reason)) {
    throw new Error(`Invalid reason — must be one of ${REPORT_REASONS.join(', ')}`);
  }
  if (input.freeText !== undefined && input.freeText !== null && input.freeText.length > REPORT_FREETEXT_MAX_LENGTH) {
    throw new Error(`freeText must be ≤ ${REPORT_FREETEXT_MAX_LENGTH} characters`);
  }
}
