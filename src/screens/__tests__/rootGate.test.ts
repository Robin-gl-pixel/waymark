import { resolveRootRoute, type RootRouteInput } from '../rootGate';

/**
 * Pin the first-launch state machine (GitHub #17, updated #78) so the flow
 * can't silently regress: Auth → OnboardingSlides → PickUsername → Main, with
 * the "skip onboarding if the user already has a username" edge case.
 *
 * Post-#78: seeded-follow is no longer a blocking gate — a user with a
 * username lands on Main regardless of `hasSeededFollowed`. The SeededFollow
 * screen is reached later via a non-blocking banner (PRD #77).
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
    // it must skip both the pitch slides and (post-#78) the seeded-follow list.
    expect(
      resolveRootRoute(
        base({ isAnonymous: true, hasUsername: false, hasSeenOnboarding: false }),
      ),
    ).toBe('main');
  });

  it('shows loading while a profile or onboarding read is still in-flight', () => {
    // Profile / onboarding are resolved via async reads — route decisions must
    // wait for them so we never flash the picker before learning the user
    // already has a profile row. `seededFollowLoading` is no longer consulted
    // by this resolver (post-#78); it's an input of the social-nudge resolver.
    expect(resolveRootRoute(base({ profileLoading: true }))).toBe('loading');
    expect(resolveRootRoute(base({ onboardingLoading: true }))).toBe('loading');
  });

  it('does not block on seededFollowLoading (kept in the input shape but inert here post-#78)', () => {
    // The field lives on RootRouteInput because the upcoming social-nudge
    // resolver consumes it; resolveRootRoute must ignore it entirely so the
    // deferred SeededFollow read can never trap a user on the spinner.
    expect(
      resolveRootRoute(
        base({
          hasSeenOnboarding: true,
          hasUsername: true,
          seededFollowLoading: true,
        }),
      ),
    ).toBe('main');
  });

  it('shows the pitch slides on first launch (fresh user, no username, slides not seen)', () => {
    expect(resolveRootRoute(base())).toBe('onboarding');
  });

  it('advances to the username picker once the slides are done', () => {
    expect(resolveRootRoute(base({ hasSeenOnboarding: true }))).toBe('pick-username');
  });

  it('lands on Main once a username exists, even if seeded-follow is not done', () => {
    // Post-#78: seeded-follow is deferred to a non-blocking banner. A user who
    // completed slides + pick-username must reach Main immediately, regardless
    // of hasSeededFollowed.
    expect(
      resolveRootRoute(base({ hasSeenOnboarding: true, hasUsername: true })),
    ).toBe('main');
  });

  it('stays on Main even when seeded-follow has never been done', () => {
    // Explicit AC case for #78: the state that used to route to 'seeded-follow'
    // now routes to 'main'. Documents the new contract in isolation.
    expect(
      resolveRootRoute(
        base({
          hasSeenOnboarding: true,
          hasUsername: true,
          hasSeededFollowed: false,
        }),
      ),
    ).toBe('main');
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

  it('lands a returning user who never completed seeded-follow straight on Main', () => {
    // Post-#78: seeded-follow is no longer a gate. A returning user (username
    // present, slides flag wiped, hasSeededFollowed still false) skips both
    // the pitch and the follow list and reaches Main directly.
    expect(
      resolveRootRoute(
        base({
          hasUsername: true,
          hasSeenOnboarding: false,
          hasSeededFollowed: false,
        }),
      ),
    ).toBe('main');
  });
});
