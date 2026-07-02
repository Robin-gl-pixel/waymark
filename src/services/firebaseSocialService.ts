import type { Lieu } from '../types/Lieu';
import type {
  UserProfile,
  ProfileInput,
  ReportInput,
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

export class FirebaseSocialService implements SocialService {
  // --- Profile ---
  async getMyProfile(): Promise<UserProfile | null> { throw new SocialNotImplemented('getMyProfile'); }
  async getUserByUid(_uid: string): Promise<UserProfile | null> { throw new SocialNotImplemented('getUserByUid'); }
  async getUserByUsername(_username: string): Promise<UserProfile | null> { throw new SocialNotImplemented('getUserByUsername'); }
  async upsertProfile(_input: ProfileInput): Promise<UserProfile> { throw new SocialNotImplemented('upsertProfile'); }
  async setProfileVisibility(_isPublic: boolean): Promise<void> { throw new SocialNotImplemented('setProfileVisibility'); }

  // --- Search ---
  async searchUsers(_query: string): Promise<UserProfile[]> { throw new SocialNotImplemented('searchUsers'); }

  // --- Follow ---
  async follow(_uid: string): Promise<void> { throw new SocialNotImplemented('follow'); }
  async unfollow(_uid: string): Promise<void> { throw new SocialNotImplemented('unfollow'); }
  async getFollowing(_uid: string): Promise<UserProfile[]> { throw new SocialNotImplemented('getFollowing'); }
  async getFollowers(_uid: string): Promise<UserProfile[]> { throw new SocialNotImplemented('getFollowers'); }
  async isFollowing(_uid: string): Promise<boolean> { throw new SocialNotImplemented('isFollowing'); }

  // --- Block ---
  async block(_uid: string): Promise<void> { throw new SocialNotImplemented('block'); }
  async unblock(_uid: string): Promise<void> { throw new SocialNotImplemented('unblock'); }
  async getBlocked(): Promise<UserProfile[]> { throw new SocialNotImplemented('getBlocked'); }
  async isBlocked(_uid: string): Promise<boolean> { throw new SocialNotImplemented('isBlocked'); }

  // --- Report ---
  async report(_input: ReportInput): Promise<void> { throw new SocialNotImplemented('report'); }

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
