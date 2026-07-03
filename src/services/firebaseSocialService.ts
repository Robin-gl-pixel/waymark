import type { Lieu, Timestamp } from '../types/Lieu';
import type {
  UserProfile,
  ProfileInput,
  ReportInput,
  ReportReason,
  Activity,
  ActivityType,
  ActivityPage,
} from '../types/User';
import type { SocialService, FeedPage } from './socialService';
import { hydrateLieuFromRaw } from './hydrateLieu';

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
          // #7 — Shortcut token is minted lazily on first Settings visit.
          // A brand-new profile has no token until the user explicitly opens
          // the Shortcut setup screen.
          shortcutToken: null,
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

  /**
   * Flip the current user's profile visibility.
   *
   * `isPublic: false` → I become invisible in search + feeds. My pins are still
   * mine (nothing is deleted) but rules deny reads from anyone other than me,
   * and the client-side `isPublic` filter on getFeed / searchUsers keeps
   * private accounts out of other users' surfaces. Undoing this is symmetric —
   * `isPublic: true` re-enables discoverability immediately.
   */
  async setProfileVisibility(isPublic: boolean): Promise<void> {
    const { auth, db, doc, updateDoc, serverTimestamp } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    await updateDoc(doc(db as never, 'users', me.uid), {
      isPublic,
      updatedAt: serverTimestamp(),
    });
  }

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
      shortcutToken: (data.shortcutToken as string | null | undefined) ?? null,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
    };
  }

  // --- iOS Shortcut token (#7) ---

  /**
   * Return the current user's Shortcut auth token, minting one on first read.
   *
   * The token is stored on `/users/{uid}.shortcutToken` and gates the
   * `extractFromShortcut` Cloud Function (auth by Bearer token, not Firebase
   * ID). We use `expo-crypto`'s CSPRNG (`getRandomBytesAsync(32)`) then render
   * as lowercase hex — 64 chars, indistinguishable from a random blob to a
   * bruteforcer at that entropy.
   */
  async getOrCreateShortcutToken(): Promise<string> {
    const { auth, db, doc, getDoc, updateDoc, serverTimestamp } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    const userRef = doc(db as never, 'users', me.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error('Profile not found — complete PickUsername first.');
    const existing = (snap.data() as Record<string, unknown>).shortcutToken;
    if (typeof existing === 'string' && existing.length === 64) return existing;
    const token = await generateShortcutToken();
    await updateDoc(userRef, { shortcutToken: token, updatedAt: serverTimestamp() });
    return token;
  }

  async regenerateShortcutToken(): Promise<string> {
    const { auth, db, doc, updateDoc, serverTimestamp } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    const token = await generateShortcutToken();
    await updateDoc(doc(db as never, 'users', me.uid), {
      shortcutToken: token,
      updatedAt: serverTimestamp(),
    });
    return token;
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

  /**
   * Follow another user. Writes both sides of the edge in a single atomic
   * batch:
   *   users/{me}/following/{uid}   — my perspective
   *   users/{uid}/followers/{me}   — their perspective
   *
   * Denormalized counts (`followersCount` / `followingCount`) are NOT written
   * here — a Cloud Function trigger listens on `followers/*` and increments
   * both counters + writes an Activity in one hop. Doing it server-side keeps
   * the write atomic across counts + activity even if a client dies mid-flow.
   *
   * Rules note: the follower-side write (`followers/{me}`) is only permitted
   * to the follower (see firestore.rules) — that's what makes this a client
   * write and not a Cloud Function.
   */
  async follow(uid: string): Promise<void> {
    const { auth, db, doc, writeBatch, serverTimestamp } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    if (uid === me.uid) throw new Error('Cannot follow yourself');

    const now = serverTimestamp();
    const batch = writeBatch(db as never);
    batch.set(doc(db as never, `users/${me.uid}/following/${uid}`), { createdAt: now });
    batch.set(doc(db as never, `users/${uid}/followers/${me.uid}`), { createdAt: now });
    await batch.commit();
  }

  /**
   * Unfollow a user — symmetric to `follow`. Delete both edges in one batch.
   * A missing edge is silently ignored (Firestore treats delete-of-nothing as
   * a no-op), so a double-tap doesn't error.
   */
  async unfollow(uid: string): Promise<void> {
    const { auth, db, doc, writeBatch } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');

    const batch = writeBatch(db as never);
    batch.delete(doc(db as never, `users/${me.uid}/following/${uid}`));
    batch.delete(doc(db as never, `users/${uid}/followers/${me.uid}`));
    await batch.commit();
  }

  async getFollowing(uid: string): Promise<UserProfile[]> {
    const { db, collection, getDocs } = loadFirebase();
    const snap = await getDocs(collection(db as never, `users/${uid}/following`));
    const uids = snap.docs.map((d) => d.id);
    const profiles = await Promise.all(uids.map((u) => this.getUserByUid(u)));
    return profiles.filter((p): p is UserProfile => p !== null);
  }

  async getFollowers(uid: string): Promise<UserProfile[]> {
    const { db, collection, getDocs } = loadFirebase();
    const snap = await getDocs(collection(db as never, `users/${uid}/followers`));
    const uids = snap.docs.map((d) => d.id);
    const profiles = await Promise.all(uids.map((u) => this.getUserByUid(u)));
    return profiles.filter((p): p is UserProfile => p !== null);
  }

  async isFollowing(uid: string): Promise<boolean> {
    const { auth, db, doc, getDoc } = loadFirebase();
    const me = auth.currentUser;
    if (!me) return false;
    const snap = await getDoc(doc(db as never, `users/${me.uid}/following/${uid}`));
    return snap.exists();
  }

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

  /**
   * Chronological network feed — pins from users I follow, most-recent first.
   *
   * Fan-out strategy (V1 scale: <50 users, <100 pins/user):
   *  1. List everyone I follow (single sub-collection read).
   *  2. Load my block list in parallel — I never want to see a blocked user's
   *     pins even if I still follow them (the block cascade should have
   *     unfollowed, but this is defensive).
   *  3. For each followed uid I'm not blocking, load their `users/{uid}/lieux`
   *     ordered by `createdAt` desc, capped at `FEED_PER_USER_LIMIT` so a
   *     hyperactive follow can't drown the merge.
   *  4. Skip users whose `isPublic == false` — rules already deny the read,
   *     but the client filter avoids surfacing a partial "you were blocked"
   *     error state.
   *  5. Merge, sort desc across all users, apply the cursor filter, slice
   *     to `PAGE_SIZE`. Cursor = createdAt millis of the tail item; a follow
   *     up call gets everything strictly older.
   *
   * This design is O(follows) reads per page — acceptable at V1 scale. If
   * we hit 1000 followees per user we'd move to a materialised per-user feed
   * (V2, per PRD "Explosion des reads Firestore" risk note).
   */
  async getFeed(cursor?: string): Promise<FeedPage> {
    const { auth, db, collection, getDocs, query: fsQuery, orderBy, limit } = loadFirebase();
    const me = auth.currentUser;
    if (!me) return { items: [], cursor: null };

    // 1. My follow set + block set.
    const [followingSnap, blockedUids] = await Promise.all([
      getDocs(collection(db as never, `users/${me.uid}/following`)),
      (async () => {
        const s = await getDocs(collection(db as never, `users/${me.uid}/blocks`));
        return new Set(s.docs.map((d) => d.id));
      })(),
    ]);
    const followedUids = followingSnap.docs
      .map((d) => d.id)
      .filter((uid) => !blockedUids.has(uid));
    if (followedUids.length === 0) return { items: [], cursor: null };

    // 2. In parallel: profile + latest lieux for each followee. Defensive
    //    isPublic filter — rules already deny reads on private users but the
    //    client filter keeps error paths quiet.
    const perUser = await Promise.all(
      followedUids.map(async (uid) => {
        const [profile, lieuxSnap] = await Promise.all([
          this.getUserByUid(uid),
          getDocs(
            fsQuery(
              collection(db as never, `users/${uid}/lieux`),
              orderBy('createdAt', 'desc'),
              limit(FEED_PER_USER_LIMIT),
            ),
          ).catch((err) => {
            // A private-owner denial or a transient read failure shouldn't
            // nuke the whole feed — log it and treat as empty for this owner.
            console.warn('[getFeed] read lieux for', uid, 'failed', err);
            return null;
          }),
        ]);
        if (!profile || !profile.isPublic || !lieuxSnap) return [];
        return lieuxSnap.docs.map((d) => hydrateLieu(uid, d.id, d.data() as Record<string, unknown>));
      }),
    );

    // 3. Merge + sort desc, cursor-filter, page.
    let items: Lieu[] = perUser.flat();
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    const cursorMs = cursor ? Number(cursor) : null;
    if (cursorMs !== null && Number.isFinite(cursorMs)) {
      items = items.filter((l) => l.createdAt.toMillis() < cursorMs);
    }

    const pageItems = items.slice(0, FEED_PAGE_SIZE);
    const hasMore = items.length > FEED_PAGE_SIZE;
    const tail = pageItems[pageItems.length - 1];
    return {
      items: pageItems,
      cursor: hasMore && tail ? String(tail.createdAt.toMillis()) : null,
    };
  }

  // --- Activity ---

  /**
   * Paginated in-app activity feed for the current user.
   *
   * Reads `users/{me}/activity` ordered by `createdAt` desc, page-of-20.
   * Cursor = the previous page's tail `createdAt.toMillis()` — we re-hydrate
   * it to a Firestore `Timestamp` for `startAfter` so the query engine can
   * seek directly rather than scanning back to the start each page.
   *
   * Activity docs are only ever *written* by Cloud Function triggers
   * (`followTriggers.ts`, `saveAttribution.ts`) via the Admin SDK — so we
   * trust the schema without re-validating it here. The `read` field defaults
   * to `false` (defensive) in case an older doc is missing it.
   */
  async getActivity(cursor?: string): Promise<ActivityPage> {
    const {
      auth,
      db,
      collection,
      query: fsQuery,
      orderBy,
      limit,
      startAfter,
      getDocs,
      Timestamp,
    } = loadFirebase();
    const me = auth.currentUser;
    if (!me) return { items: [], cursor: null };

    const cursorMs = cursor && Number.isFinite(Number(cursor)) ? Number(cursor) : null;
    const baseCol = collection(db as never, `users/${me.uid}/activity`);
    const q = cursorMs !== null
      ? fsQuery(
          baseCol,
          orderBy('createdAt', 'desc'),
          startAfter(Timestamp.fromMillis(cursorMs)),
          limit(ACTIVITY_PAGE_SIZE),
        )
      : fsQuery(baseCol, orderBy('createdAt', 'desc'), limit(ACTIVITY_PAGE_SIZE));
    const snap = await getDocs(q);

    const items: Activity[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        type: data.type as ActivityType,
        actorUid: (data.actorUid as string) ?? '',
        actorUsername: (data.actorUsername as string) ?? '',
        targetLieuId: (data.targetLieuId as string | undefined) ?? undefined,
        createdAt: data.createdAt as Timestamp,
        read: (data.read as boolean | undefined) ?? false,
      };
    });

    // A full page = there's likely more. If we got fewer than PAGE_SIZE the
    // caller has drained the feed and we return a null cursor.
    const tail = items[items.length - 1];
    const nextCursor =
      items.length === ACTIVITY_PAGE_SIZE && tail
        ? String(tail.createdAt.toMillis())
        : null;

    return { items, cursor: nextCursor };
  }

  /**
   * Mark a single activity entry as read. Idempotent — an already-read doc is
   * a no-op update. `markActivityRead` on a missing id throws (updateDoc on a
   * non-existent doc surfaces the error to the caller so a stale UI id can't
   * silently fail).
   */
  async markActivityRead(activityId: string): Promise<void> {
    const { auth, db, doc, updateDoc } = loadFirebase();
    const me = auth.currentUser;
    if (!me) throw new Error('Not signed in');
    await updateDoc(doc(db as never, `users/${me.uid}/activity/${activityId}`), { read: true });
  }

  /**
   * Unread-count query for the badge. Uses the composite index
   * `[read ASC, createdAt DESC]` declared in `firestore.indexes.json`.
   *
   * Returns 0 when signed out — the badge helper is safe to call anywhere.
   */
  async getUnreadActivityCount(): Promise<number> {
    const { auth, db, collection, query: fsQuery, where, getDocs } = loadFirebase();
    const me = auth.currentUser;
    if (!me) return 0;
    const q = fsQuery(
      collection(db as never, `users/${me.uid}/activity`),
      where('read', '==', false),
    );
    const snap = await getDocs(q);
    return snap.size;
  }
}

/**
 * Activity page size — matches PRD ("page 20") and the InMemory contract.
 * Kept module-level so UI + tests reference the same knob.
 */
export const ACTIVITY_PAGE_SIZE = 20;

/**
 * Feed page size — matches PRD ("page de 20") and the InMemory contract.
 * Kept as a module-level export so tests + UI can reference the same knob.
 */
export const FEED_PAGE_SIZE = 20;

/**
 * How many pins we load per followed user before merging into the feed.
 * Capped so a single hyperactive account can't dominate a page — 20 matches
 * the page size, so even in the pathological case a single user could still
 * fill the whole page if they had the 20 most recent pins.
 */
export const FEED_PER_USER_LIMIT = 20;

/**
 * Hydrate a Firestore `lieux/{id}` doc into a `Lieu` when the owner uid isn't
 * the caller — the getFeed path reads from other users' subcollections, so we
 * need a small mirror of `FirebaseLieuxService.hydrate` here rather than
 * plumbing an owner override through the lieux service.
 */
function hydrateLieu(ownerUid: string, id: string, data: Record<string, unknown>): Lieu {
  // Default userId to the owner uid used to reach this subcollection — the
  // feed reads from other users' subtrees so the doc may or may not carry
  // its own `userId` field. `hydrateLieuFromRaw` handles the pre-#41 status
  // read-compat + pre-migration photos[] synthesis.
  const withOwner = data.userId ? data : { ...data, userId: ownerUid };
  return hydrateLieuFromRaw(id, withOwner);
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
/**
 * Length of the raw entropy for a Shortcut token, in bytes. 32 bytes ×
 * 8 bits = 256 bits — bruteforce-proof at any reasonable scale, and the
 * rendered hex form (64 chars) is short enough to fit on a single Settings
 * row without wrapping awkwardly on a phone.
 */
export const SHORTCUT_TOKEN_BYTES = 32;

/**
 * Length of a valid Shortcut token in rendered lowercase-hex form. The
 * `extractFromShortcut` Cloud Function rejects any header that isn't exactly
 * this long, so a malformed paste from the iOS Shortcut app fails fast.
 */
export const SHORTCUT_TOKEN_HEX_LENGTH = SHORTCUT_TOKEN_BYTES * 2;

/**
 * Generate a fresh Shortcut token: 32 bytes from `expo-crypto`'s CSPRNG,
 * rendered as lowercase hex. Async because `getRandomBytesAsync` is — Expo's
 * sync equivalent isn't guaranteed to be a real CSPRNG on every device.
 */
async function generateShortcutToken(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  const bytes = await Crypto.getRandomBytesAsync(SHORTCUT_TOKEN_BYTES);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

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
