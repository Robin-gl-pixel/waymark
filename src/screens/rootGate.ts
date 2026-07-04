/**
 * Pure resolver for the post-auth first-launch gate (GitHub #17, updated #78).
 *
 * `Root()` in `App.tsx` renders one of four gate states based on:
 *   - is there a signed-in user?
 *   - is the user anonymous (dev-skip)?
 *   - do we have their profile row loaded?
 *   - have they seen the 3-slide pitch onboarding?
 *   - have they picked a username?
 *
 * Extracting the decision to a pure function — same pattern as
 * `UserProfileScreen.viewMode.ts` — keeps the state machine unit-testable
 * without pulling react-native, navigation, or Firebase into the test env.
 *
 * ORDER MATTERS. The precedence is:
 *   1. auth still resolving                          → 'loading'
 *   2. no user                                       → 'auth'
 *   3. anonymous bypass                              → 'main' (dev skip button)
 *   4. profile / onboarding read still in-flight     → 'loading'
 *   5. username missing AND onboarding not yet seen  → 'onboarding'
 *   6. username missing                              → 'pick-username'
 *   7. otherwise                                     → 'main'
 *
 * Post-#78: the seeded-follow step is no longer a blocking gate. A user with a
 * username lands on Main even if `hasSeededFollowed` is false — the SeededFollow
 * screen is reached via a non-blocking banner in a later slice. The route
 * `'seeded-follow'` stays in `RootRoute` (the screen is still registered in the
 * stack and reachable via direct navigation), and `seededFollowLoading` /
 * `hasSeededFollowed` stay in `RootRouteInput` (they become the inputs of the
 * upcoming social-nudge resolver — see PRD #77).
 *
 * Re-signin edge case: if `hasUsername` is true (returning user cleared session
 * data and signed back in), the flow skips straight to 'main' — it does NOT
 * re-show the pitch slides.
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
  // Kept in the input shape for the upcoming social-nudge resolver (PRD #77);
  // no longer consulted by resolveRootRoute post-#78.
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
  if (input.profileLoading || input.onboardingLoading) {
    return 'loading';
  }

  if (!input.hasUsername && !input.hasSeenOnboarding) return 'onboarding';
  if (!input.hasUsername) return 'pick-username';
  return 'main';
}
