import { resolveProfileViewMode } from '../UserProfileScreen.viewMode';
import { InMemorySocialService } from '../../services/inMemorySocialService';

/**
 * Screen-level render tests are impractical here — UserProfileScreen owns
 * `useAuth`, `useNavigation`, `useRoute`, and multiple async effects, so the
 * hook-free walker used elsewhere for shared components doesn't apply.
 *
 * Instead, the render decision was extracted to `resolveProfileViewMode(isMe,
 * isFollowing)` — a pure function that's easy to unit-test and pins the
 * follower-gate contract from issue #49.
 */
describe('resolveProfileViewMode', () => {
  it('always renders own mode when the viewer is the profile owner', () => {
    // isFollowing shouldn't matter — the owner check wins.
    expect(resolveProfileViewMode(true, null)).toBe('own');
    expect(resolveProfileViewMode(true, false)).toBe('own');
    expect(resolveProfileViewMode(true, true)).toBe('own');
  });

  it('renders follower mode when the viewer follows the profile owner', () => {
    expect(resolveProfileViewMode(false, true)).toBe('follower');
  });

  it('renders locked mode when the viewer does not follow the owner', () => {
    expect(resolveProfileViewMode(false, false)).toBe('locked');
  });

  it('renders locked mode while the follow state is still loading (null)', () => {
    // Fail-closed: better to show the locked skeleton for a beat than to
    // briefly reveal a stranger's pins. Once the isFollowing read resolves,
    // the screen re-renders with the correct mode.
    expect(resolveProfileViewMode(false, null)).toBe('locked');
  });
});

/**
 * Integration at the social seam: the ProfileLocked CTA calls the existing
 * `follow()` action, and the mode resolver flips to `follower` on the next
 * `isFollowing()` read — no new server logic is introduced by this slice.
 *
 * We exercise the InMemorySocialService directly (same seam UserProfileScreen
 * consumes via `getSocialService()`) so the wave-2 contract is pinned end-to-
 * end without booting the screen.
 */
describe('UserProfileScreen locked→follower transition (seam contract)', () => {
  const ME = 'uid-me';
  const OWNER = 'uid-owner';

  function makeSvc(): InMemorySocialService {
    const svc = new InMemorySocialService();
    svc.setCurrentUid(ME);
    svc.seedUser({
      uid: OWNER,
      username: 'lerougegorge',
      displayName: null,
      email: null,
      isPublic: true,
      isCurated: false,
      followersCount: 234,
      followingCount: 91,
      avatarUrl: null,
      bio: null,
      usernameChangedAt: null,
    });
    return svc;
  }

  it('starts locked before follow', async () => {
    const svc = makeSvc();
    const isFollowing = await svc.isFollowing(OWNER);
    expect(resolveProfileViewMode(false, isFollowing)).toBe('locked');
  });

  it('transitions to follower after a successful follow (the CTA reuses existing follow logic)', async () => {
    const svc = makeSvc();
    // ProfileLocked's CTA → toggleFollow → getSocialService().follow(uid).
    await svc.follow(OWNER);
    const isFollowing = await svc.isFollowing(OWNER);
    expect(isFollowing).toBe(true);
    expect(resolveProfileViewMode(false, isFollowing)).toBe('follower');
  });
});
