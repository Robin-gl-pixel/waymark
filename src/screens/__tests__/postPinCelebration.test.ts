import { resolvePostPin, type PostPinInput } from '../postPinCelebration';

/**
 * Pin the post-first-pin celebration truth table (GitHub #80) so the toast +
 * one-shot Share Extension tip contract can't silently regress: toast on every
 * save, tip only on the very first pin AND only if the install hasn't already
 * seen it.
 */

function base(overrides: Partial<PostPinInput> = {}): PostPinInput {
  return {
    pinsCountBeforeSave: 0,
    hasShownShareExtensionTip: false,
    ...overrides,
  };
}

describe('resolvePostPin', () => {
  it('shows both the toast and the tip on the very first pin when the tip has never been shown', () => {
    // The activation moment PRD #77 targets: fresh install, 0 pins before
    // save, the tip flag has never been persisted — teach both feedback and
    // the Share Extension in one go.
    expect(resolvePostPin(base())).toEqual({
      showToast: true,
      showShareTip: true,
    });
  });

  it('still shows the toast but suppresses the tip when the tip has already been shown once', () => {
    // Guards the "one-shot per install" contract: even on a hypothetical
    // "first pin" state where the tip flag is already set (e.g. user tapped
    // through the tip on a previous install-and-wipe cycle within the same
    // AsyncStorage — or the flag was pre-seeded), we must NOT re-show it.
    expect(
      resolvePostPin(base({ pinsCountBeforeSave: 0, hasShownShareExtensionTip: true })),
    ).toEqual({ showToast: true, showShareTip: false });
  });

  it('shows the toast alone on the 2nd pin, regardless of the tip flag', () => {
    // Once the user has at least one pin, the activation-teaching moment has
    // passed — the tip stays hidden whether or not it was ever shown before.
    expect(
      resolvePostPin(base({ pinsCountBeforeSave: 1, hasShownShareExtensionTip: false })),
    ).toEqual({ showToast: true, showShareTip: false });
    expect(
      resolvePostPin(base({ pinsCountBeforeSave: 1, hasShownShareExtensionTip: true })),
    ).toEqual({ showToast: true, showShareTip: false });
  });

  it('shows the toast alone on any subsequent save (high pin counts)', () => {
    // Sanity check that the "pinsCountBeforeSave >= 1 → no tip" rule holds
    // for realistic later saves, not just the boundary at 1.
    expect(
      resolvePostPin(base({ pinsCountBeforeSave: 42, hasShownShareExtensionTip: false })),
    ).toEqual({ showToast: true, showShareTip: false });
    expect(
      resolvePostPin(base({ pinsCountBeforeSave: 42, hasShownShareExtensionTip: true })),
    ).toEqual({ showToast: true, showShareTip: false });
  });
});
