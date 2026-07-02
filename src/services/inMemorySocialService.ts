import type { Lieu, Timestamp } from '../types/Lieu';
import type {
  UserProfile,
  ProfileInput,
  ReportInput,
  Activity,
  ActivityPage,
} from '../types/User';
import type { SocialService, FeedPage } from './socialService';
import { RESERVED_USERNAMES, USERNAME_REGEX, USERNAME_CHANGE_COOLDOWN_MS } from './firebaseSocialService';

/**
 * In-memory implementation used by contract tests + as a stub in Storybook / dev.
 * Same seam as `InMemoryLieuxService` — the shape is the ONLY thing under test.
 *
 * The auth uid is set via `setCurrentUid()` (test helper) — no Firebase auth
 * here. Keep the API tiny and predictable.
 */
export class InMemorySocialService implements SocialService {
  private currentUid: string | null = null;
  private users = new Map<string, UserProfile>();
  private usernameIndex = new Map<string, string>(); // lowercase username → uid
  private following = new Map<string, Set<string>>(); // uid → Set<followedUid>
  private followers = new Map<string, Set<string>>(); // uid → Set<followerUid>
  private blocks = new Map<string, Set<string>>();    // uid → Set<blockedUid>
  private activities = new Map<string, Activity[]>(); // uid → activities (desc by createdAt)
  private reports: Array<ReportInput & { reporterUid: string; createdAt: Timestamp }> = [];
  private lieuxByOwner = new Map<string, Lieu[]>();   // uid → their lieux
  private clock = 1_700_000_000_000;

  setCurrentUid(uid: string | null): void {
    this.currentUid = uid;
  }

  /** Pre-populate a user (for test fixtures — bypasses upsertProfile validation). */
  seedUser(user: Omit<UserProfile, 'createdAt' | 'updatedAt'> & Partial<Pick<UserProfile, 'createdAt' | 'updatedAt'>>): UserProfile {
    const ts = this.stamp();
    const full: UserProfile = {
      createdAt: ts,
      updatedAt: ts,
      ...user,
    } as UserProfile;
    this.users.set(user.uid, full);
    this.usernameIndex.set(user.username.toLowerCase(), user.uid);
    return full;
  }

  seedLieu(ownerUid: string, lieu: Lieu): void {
    const arr = this.lieuxByOwner.get(ownerUid) ?? [];
    arr.push(lieu);
    this.lieuxByOwner.set(ownerUid, arr);
  }

  reset(): void {
    this.currentUid = null;
    this.users.clear();
    this.usernameIndex.clear();
    this.following.clear();
    this.followers.clear();
    this.blocks.clear();
    this.activities.clear();
    this.reports = [];
    this.lieuxByOwner.clear();
    this.clock = 1_700_000_000_000;
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  async getMyProfile(): Promise<UserProfile | null> {
    if (!this.currentUid) return null;
    return this.users.get(this.currentUid) ?? null;
  }

  async getUserByUid(uid: string): Promise<UserProfile | null> {
    return this.users.get(uid) ?? null;
  }

  async getUserByUsername(username: string): Promise<UserProfile | null> {
    const uid = this.usernameIndex.get(username.toLowerCase());
    return uid ? (this.users.get(uid) ?? null) : null;
  }

  async upsertProfile(input: ProfileInput): Promise<UserProfile> {
    if (!this.currentUid) throw new Error('Not signed in');
    const uname = input.username.toLowerCase();
    if (!USERNAME_REGEX.test(uname)) throw new Error('Invalid username format');
    if (RESERVED_USERNAMES.has(uname)) throw new Error('Username is reserved');

    const existingUid = this.usernameIndex.get(uname);
    if (existingUid && existingUid !== this.currentUid) throw new Error('Username already taken');

    const existing = this.users.get(this.currentUid);
    if (existing && existing.username !== uname && existing.usernameChangedAt) {
      const sinceLast = this.now() - existing.usernameChangedAt.toMillis();
      if (sinceLast < USERNAME_CHANGE_COOLDOWN_MS) {
        throw new Error('Username change cooldown active (30 days)');
      }
    }

    // Free the old username in the index if renaming.
    if (existing && existing.username !== uname) {
      this.usernameIndex.delete(existing.username.toLowerCase());
    }

    const ts = this.stamp();
    const next: UserProfile = existing
      ? { ...existing, username: uname, usernameChangedAt: ts, updatedAt: ts }
      : {
          uid: this.currentUid,
          username: uname,
          displayName: null,
          email: null,
          isPublic: true,
          isCurated: false,
          followersCount: 0,
          followingCount: 0,
          avatarUrl: null,
          bio: null,
          usernameChangedAt: null,
          createdAt: ts,
          updatedAt: ts,
        };
    this.users.set(this.currentUid, next);
    this.usernameIndex.set(uname, this.currentUid);
    return next;
  }

  async setProfileVisibility(isPublic: boolean): Promise<void> {
    if (!this.currentUid) throw new Error('Not signed in');
    const u = this.users.get(this.currentUid);
    if (!u) throw new Error('No profile');
    this.users.set(this.currentUid, { ...u, isPublic, updatedAt: this.stamp() });
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  async searchUsers(query: string): Promise<UserProfile[]> {
    const q = query.toLowerCase().replace(/^@/, '');
    const uid = this.usernameIndex.get(q);
    if (!uid || uid === this.currentUid) return [];
    const user = this.users.get(uid);
    return user && user.isPublic ? [user] : [];
  }

  // -------------------------------------------------------------------------
  // Follow
  // -------------------------------------------------------------------------

  async follow(uid: string): Promise<void> {
    if (!this.currentUid) throw new Error('Not signed in');
    if (uid === this.currentUid) throw new Error('Cannot follow yourself');
    if ((this.blocks.get(this.currentUid) ?? new Set()).has(uid)) throw new Error('User is blocked');
    if ((this.blocks.get(uid) ?? new Set()).has(this.currentUid)) throw new Error('You are blocked by this user');

    (this.following.get(this.currentUid) ?? this.setDefault(this.following, this.currentUid)).add(uid);
    (this.followers.get(uid) ?? this.setDefault(this.followers, uid)).add(this.currentUid);

    // Update denormalized counts.
    const me = this.users.get(this.currentUid);
    if (me) this.users.set(this.currentUid, { ...me, followingCount: me.followingCount + 1 });
    const them = this.users.get(uid);
    if (them) this.users.set(uid, { ...them, followersCount: them.followersCount + 1 });

    // Activity for the followed user.
    if (me) {
      const list = this.activities.get(uid) ?? [];
      list.unshift({
        id: `act-${this.now()}-follow-${this.currentUid}`,
        type: 'follow',
        actorUid: this.currentUid,
        actorUsername: me.username,
        createdAt: this.stamp(),
        read: false,
      });
      this.activities.set(uid, list);
    }
  }

  async unfollow(uid: string): Promise<void> {
    if (!this.currentUid) throw new Error('Not signed in');
    const following = this.following.get(this.currentUid);
    const followers = this.followers.get(uid);
    if (!following?.has(uid)) return;

    following.delete(uid);
    followers?.delete(this.currentUid);

    const me = this.users.get(this.currentUid);
    if (me) this.users.set(this.currentUid, { ...me, followingCount: Math.max(0, me.followingCount - 1) });
    const them = this.users.get(uid);
    if (them) this.users.set(uid, { ...them, followersCount: Math.max(0, them.followersCount - 1) });
  }

  async getFollowing(uid: string): Promise<UserProfile[]> {
    return Array.from(this.following.get(uid) ?? []).map((u) => this.users.get(u)!).filter(Boolean);
  }

  async getFollowers(uid: string): Promise<UserProfile[]> {
    return Array.from(this.followers.get(uid) ?? []).map((u) => this.users.get(u)!).filter(Boolean);
  }

  async isFollowing(uid: string): Promise<boolean> {
    return this.currentUid ? (this.following.get(this.currentUid)?.has(uid) ?? false) : false;
  }

  // -------------------------------------------------------------------------
  // Block
  // -------------------------------------------------------------------------

  async block(uid: string): Promise<void> {
    if (!this.currentUid) throw new Error('Not signed in');
    if (uid === this.currentUid) throw new Error('Cannot block yourself');
    (this.blocks.get(this.currentUid) ?? this.setDefault(this.blocks, this.currentUid)).add(uid);
    // Bidirectional forced unfollow.
    await this.unfollow(uid);
    const theyFollowMe = this.following.get(uid);
    if (theyFollowMe?.has(this.currentUid)) {
      const savedUid = this.currentUid;
      this.setCurrentUid(uid);
      try { await this.unfollow(savedUid); } finally { this.setCurrentUid(savedUid); }
    }
  }

  async unblock(uid: string): Promise<void> {
    if (!this.currentUid) throw new Error('Not signed in');
    this.blocks.get(this.currentUid)?.delete(uid);
  }

  async getBlocked(): Promise<UserProfile[]> {
    if (!this.currentUid) return [];
    return Array.from(this.blocks.get(this.currentUid) ?? []).map((u) => this.users.get(u)!).filter(Boolean);
  }

  async isBlocked(uid: string): Promise<boolean> {
    return this.currentUid ? (this.blocks.get(this.currentUid)?.has(uid) ?? false) : false;
  }

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  async report(input: ReportInput): Promise<void> {
    if (!this.currentUid) throw new Error('Not signed in');
    this.reports.push({ ...input, reporterUid: this.currentUid, createdAt: this.stamp() });
  }

  /** Test-only accessor. */
  getReportsForTests() { return [...this.reports]; }

  // -------------------------------------------------------------------------
  // Feed
  // -------------------------------------------------------------------------

  async getFeed(_cursor?: string): Promise<FeedPage> {
    if (!this.currentUid) return { items: [], cursor: null };
    const following = this.following.get(this.currentUid) ?? new Set();
    const blocked = this.blocks.get(this.currentUid) ?? new Set();
    const items: Lieu[] = [];
    for (const uid of following) {
      if (blocked.has(uid)) continue;
      const user = this.users.get(uid);
      if (!user || !user.isPublic) continue;
      for (const lieu of this.lieuxByOwner.get(uid) ?? []) items.push(lieu);
    }
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    return { items: items.slice(0, 20), cursor: items.length > 20 ? String(items[19].createdAt.toMillis()) : null };
  }

  // -------------------------------------------------------------------------
  // Activity
  // -------------------------------------------------------------------------

  async getActivity(_cursor?: string): Promise<ActivityPage> {
    if (!this.currentUid) return { items: [], cursor: null };
    const list = this.activities.get(this.currentUid) ?? [];
    return { items: list.slice(0, 20), cursor: list.length > 20 ? list[19].id : null };
  }

  async markActivityRead(activityId: string): Promise<void> {
    if (!this.currentUid) return;
    const list = this.activities.get(this.currentUid) ?? [];
    const i = list.findIndex((a) => a.id === activityId);
    if (i >= 0) list[i] = { ...list[i], read: true };
  }

  async getUnreadActivityCount(): Promise<number> {
    if (!this.currentUid) return 0;
    return (this.activities.get(this.currentUid) ?? []).filter((a) => !a.read).length;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private setDefault<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
    const s = new Set<V>();
    map.set(key, s);
    return s;
  }

  private now(): number {
    return this.clock++;
  }

  private stamp(): Timestamp {
    const ms = this.now();
    return {
      seconds: Math.floor(ms / 1000),
      nanoseconds: (ms % 1000) * 1_000_000,
      toDate: () => new Date(ms),
      toMillis: () => ms,
    };
  }
}
