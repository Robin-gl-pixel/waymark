/**
 * Pure resolver for the post-auth first-launch gate (GitHub #17).
 *
 * `Root()` in `App.tsx` renders one of five states based on:
 *   - is there a signed-in user?
 *   - is the user anonymous (dev-skip)?
 *   - do we have their profile row loaded?
 *   - have they seen the 3-slide pitch onboarding?
 *   - have they picked a username?
 *   - have they completed (or skipped) the seeded follow step?
 *
 * Extracting the decision to a pure function — same pattern as
 * `UserProfileScreen.viewMode.ts` — keeps the state machine unit-testable
 * without pulling react-native, navigation, or Firebase into the test env.
 *
 * ORDER MATTERS. The precedence is:
 *   1. no user           → 'auth'
 *   2. anonymous bypass  → 'main' (dev skip button; skip social onboarding)
 *   3. loading           → 'loading' (any of the async reads still in-flight)
 *   4. username missing AND onboarding not yet seen → 'onboarding'
 *   5. username missing                             → 'pick-username'
 *   6. seeded-follow not yet done                   → 'seeded-follow'
 *   7. otherwise         → 'main'
 *
 * Re-signin edge case: if `hasUsername` is true (returning user cleared session
 * data and signed back in), the flow skips straight to 'seeded-follow' or
 * 'main' — it does NOT re-show the pitch slides.
 *
 * Failure posture: any read that fails should be surfaced by its caller as its
 * "false" value here — that way the flow prefers "show the picker / show the
 * slides" over "trap the user on a spinner".
 */
export type RootRoute =
  | 'loading'
  | 'auth'
  | 'onboarding'
  | 'pick-username'
  | 'seeded-follow'
  | 'main';

export interface RootRouteInput {
  authLoading: boolean;
  hasUser: boolean;
  isAnonymous: boolean;
  profileLoading: boolean;
  hasUsername: boolean;
  onboardingLoading: boolean;
  hasSeenOnboarding: boolean;
  seededFollowLoading: boolean;
  hasSeededFollowed: boolean;
}

export function resolveRootRoute(input: RootRouteInput): RootRoute {
  if (input.authLoading) return 'loading';
  if (!input.hasUser) return 'auth';
  if (input.isAnonymous) return 'main';

  // Any dependent load still in-flight blocks routing — better to hold on the
  // spinner for a beat than to flash the picker before we know the user
  // already has a profile row.
  if (input.profileLoading || input.onboardingLoading || input.seededFollowLoading) {
    return 'loading';
  }

  if (!input.hasUsername && !input.hasSeenOnboarding) return 'onboarding';
  if (!input.hasUsername) return 'pick-username';
  if (!input.hasSeededFollowed) return 'seeded-follow';
  return 'main';
}
