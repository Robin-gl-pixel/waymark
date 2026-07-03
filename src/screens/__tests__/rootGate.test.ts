import { resolveRootRoute, type RootRouteInput } from '../rootGate';

/**
 * Pin the first-launch state machine (GitHub #17) so the flow can't silently
 * regress: Auth → OnboardingSlides → PickUsername → SeededFollow → Main, with
 * the "skip onboarding if the user already has a username" edge case.
 */

function base(overrides: Partial<RootRouteInput> = {}): RootRouteInput {
  return {
    authLoading: false,
    hasUser: true,
    isAnonymous: false,
    profileLoading: false,
    hasUsername: false,
    onboardingLoading: false,
    hasSeenOnboarding: false,
    seededFollowLoading: false,
    hasSeededFollowed: false,
    ...overrides,
  };
}

describe('resolveRootRoute', () => {
  it('shows the loading spinner while the auth state is still resolving', () => {
    expect(
      resolveRootRoute(base({ authLoading: true, hasUser: false })),
    ).toBe('loading');
  });

  it('shows the AuthScreen when no user is signed in', () => {
    expect(resolveRootRoute(base({ hasUser: false }))).toBe('auth');
  });

  it('routes anonymous / dev-bypass users straight to Main', () => {
    // The "Skip (dev anonymous sign-in)" flow is meant to reach the map fast;
    // it must skip both the pitch slides and the seeded-follow list.
    expect(
      resolveRootRoute(
        base({ isAnonymous: true, hasUsername: false, hasSeenOnboarding: false }),
      ),
    ).toBe('main');
  });

  it('shows loading while any dependent read is still in-flight', () => {
    // Profile / onboarding / seeded-follow are all resolved via async reads —
    // route decisions must wait for them so we never flash the picker before
    // learning the user already has a profile row.
    expect(resolveRootRoute(base({ profileLoading: true }))).toBe('loading');
    expect(resolveRootRoute(base({ onboardingLoading: true }))).toBe('loading');
    expect(resolveRootRoute(base({ seededFollowLoading: true }))).toBe('loading');
  });

  it('shows the pitch slides on first launch (fresh user, no username, slides not seen)', () => {
    expect(resolveRootRoute(base())).toBe('onboarding');
  });

  it('advances to the username picker once the slides are done', () => {
    expect(resolveRootRoute(base({ hasSeenOnboarding: true }))).toBe('pick-username');
  });

  it('advances to the seeded-follow screen once a username exists', () => {
    expect(
      resolveRootRoute(base({ hasSeenOnboarding: true, hasUsername: true })),
    ).toBe('seeded-follow');
  });

  it('lands on Main once every gate is cleared', () => {
    expect(
      resolveRootRoute(
        base({
          hasSeenOnboarding: true,
          hasUsername: true,
          hasSeededFollowed: true,
        }),
      ),
    ).toBe('main');
  });

  it('skips the pitch slides for a returning user who already picked a username', () => {
    // Edge case flagged in the AC: re-signin after logout should NOT re-show
    // the pitch — a user who already has a username has clearly seen the app.
    expect(
      resolveRootRoute(
        base({
          hasUsername: true,
          hasSeenOnboarding: false, // AsyncStorage may have been wiped
          hasSeededFollowed: true,
        }),
      ),
    ).toBe('main');
  });

  it('still shows seeded-follow to a returning user who never completed it', () => {
    // If the returning user picked a username but never got to the follow
    // step (e.g. force-quit the app), we let them finish it — but never send
    // them back to the pitch slides.
    expect(
      resolveRootRoute(
        base({
          hasUsername: true,
          hasSeenOnboarding: false,
          hasSeededFollowed: false,
        }),
      ),
    ).toBe('seeded-follow');
  });
});
