import { resolveSocialNudge, type SocialNudgeInput } from '../socialNudgeBanner';

/**
 * Pin the social-nudge visibility state machine (GitHub #81, PRD #77) so the
 * banner can't silently regress: hide before activation, hide once the user
 * has completed or dismissed the SeededFollow ask, and hide entirely for the
 * anonymous dev-bypass path.
 *
 * Same table-driven shape as `rootGate.test.ts` — a `base(overrides)` factory
 * composes the input, and each `it()` pins one edge case with a comment
 * explaining the constraint.
 */
function base(overrides: Partial<SocialNudgeInput> = {}): SocialNudgeInput {
  return {
    hasAnyLieu: true,
    hasSeededFollowed: false,
    hasDismissedSocialNudge: false,
    isAnonymous: false,
    ...overrides,
  };
}

describe('resolveSocialNudge', () => {
  it('hides the banner on a fresh install with no pin yet, whatever the other flags', () => {
    // Activation is the gate: the banner is a post-first-pin nudge, so a user
    // who hasn't saved a single lieu must never see it — even if some other
    // flag (e.g. a returning user with hasSeededFollowed=false) would otherwise
    // let it through.
    expect(resolveSocialNudge(base({ hasAnyLieu: false }))).toBe('hide');
    expect(
      resolveSocialNudge(
        base({
          hasAnyLieu: false,
          hasSeededFollowed: false,
          hasDismissedSocialNudge: false,
          isAnonymous: false,
        }),
      ),
    ).toBe('hide');
  });

  it('hides the banner once the user has completed the seeded-follow step', () => {
    // No sense nudging a user who has already followed — even via a path
    // outside the banner itself (e.g. the Réseau tab).
    expect(resolveSocialNudge(base({ hasSeededFollowed: true }))).toBe('hide');
  });

  it('hides the banner once the user has tapped the dismiss cross', () => {
    // Dismissal is a hard "no" — the flag lives in AsyncStorage so the banner
    // must never come back at the next launch of the app.
    expect(resolveSocialNudge(base({ hasDismissedSocialNudge: true }))).toBe('hide');
  });

  it('hides the banner for anonymous / dev-bypass users', () => {
    // The « Skip (dev anonymous sign-in) » flow deliberately skips the whole
    // social layer; the nudge would be dead weight there.
    expect(resolveSocialNudge(base({ isAnonymous: true }))).toBe('hide');
  });

  it('shows the banner once activation is reached and no explicit refusal exists', () => {
    // Baseline positive case — the exact combination called out in the AC:
    // { hasAnyLieu: true, hasSeededFollowed: false, hasDismissedSocialNudge: false,
    //   isAnonymous: false } → 'show'.
    expect(
      resolveSocialNudge({
        hasAnyLieu: true,
        hasSeededFollowed: false,
        hasDismissedSocialNudge: false,
        isAnonymous: false,
      }),
    ).toBe('show');
  });
});
