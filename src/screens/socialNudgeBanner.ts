/**
 * Pure resolver for the post-first-pin social nudge banner (GitHub #81, PRD #77).
 *
 * The banner sits at the top of Map + List and invites the user to complete the
 * SeededFollow step that #78 removed from the blocking `rootGate` flow. It is a
 * pure invitation — never a wall — so the resolver defaults to `'hide'` unless
 * every condition to `'show'` is met.
 *
 * Extracting the decision to a pure function — same pattern as `rootGate.ts` —
 * keeps the visibility logic unit-testable without pulling react-native,
 * navigation, or Firebase into the test env.
 *
 * ORDER MATTERS. The precedence is:
 *   1. anonymous bypass          → 'hide' (dev skip — no social layer applies)
 *   2. pre-activation (no pin)   → 'hide' (banner only fires after 1st pin)
 *   3. seeded-follow completed   → 'hide' (nothing left to nudge for)
 *   4. banner explicitly dismissed → 'hide' (user said no; respect it forever)
 *   5. otherwise                 → 'show'
 *
 * Failure posture: any AsyncStorage read that fails should be surfaced by its
 * caller as its "true" value for the two dismiss/done flags — that way a broken
 * storage layer hides the banner rather than nagging on every launch.
 */
export type SocialNudgeVerdict = 'show' | 'hide';

export interface SocialNudgeInput {
  hasAnyLieu: boolean;
  hasSeededFollowed: boolean;
  hasDismissedSocialNudge: boolean;
  isAnonymous: boolean;
}

export function resolveSocialNudge(input: SocialNudgeInput): SocialNudgeVerdict {
  if (input.isAnonymous) return 'hide';
  if (!input.hasAnyLieu) return 'hide';
  if (input.hasSeededFollowed) return 'hide';
  if (input.hasDismissedSocialNudge) return 'hide';
  return 'show';
}
