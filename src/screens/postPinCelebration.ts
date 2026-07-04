/**
 * Pure resolver for the post-first-pin celebration (GitHub #80, parent #77).
 *
 * `ExtractConfirmScreen.handleConfirm` calls this right after a successful
 * `createLieu` to decide what feedback to surface on the map:
 *   - a confirmation toast on EVERY save (feedback minimal that the save landed)
 *   - a one-shot Share Extension tip on the VERY FIRST pin only, and only if
 *     the tip has never been shown on this install before
 *
 * Extracting the decision to a pure function — same pattern as `rootGate.ts`
 * and `mainTabsLayout.ts` — keeps the "should I nudge?" table unit-testable
 * without pulling react-native, AsyncStorage, or navigation into the test env.
 * The consumer is responsible for reading the AsyncStorage flag beforehand and
 * for persisting it after the tip has actually rendered.
 *
 * `pinsCountBeforeSave` is the count of the user's pins BEFORE the save that
 * triggered this call. Passing the pre-save count (rather than the post-save
 * count minus one) keeps the "is this the first pin?" predicate readable in
 * both the resolver body and the tests.
 */
export interface PostPinInput {
  pinsCountBeforeSave: number;
  hasShownShareExtensionTip: boolean;
}

export interface PostPinVerdict {
  showToast: boolean;
  showShareTip: boolean;
}

export function resolvePostPin(input: PostPinInput): PostPinVerdict {
  return {
    // Toast fires on every successful save — minimum viable feedback that the
    // action landed, not conditional on it being the first pin.
    showToast: true,
    // Tip is one-shot per install: only the very first pin (0 pins before
    // save) AND only if this install has never rendered the tip yet.
    showShareTip: input.pinsCountBeforeSave === 0 && !input.hasShownShareExtensionTip,
  };
}
