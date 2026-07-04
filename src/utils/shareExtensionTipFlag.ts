import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One-shot post-first-pin Share Extension tip flag (GitHub #80, parent #77).
 *
 * The tip teaches the user that they can also share a screenshot into Pinti
 * from Instagram via the iOS Share Sheet. It's shown at most ONCE per install
 * (right after the very first pin save), so we persist a boolean here.
 *
 * Storage-only (no Firestore doc, no Cloud Function) because the acknowledgement
 * is purely informational — the parent PRD explicitly says a reinstall re-showing
 * the tip is acceptable in V1. Same posture as `socialMigrationFlag.ts` for the
 * migration modal.
 *
 * Key is versioned (`_v1`) so a future rewording / redesign can force a re-show
 * without colliding with the current one.
 */
export const SHARE_EXTENSION_TIP_STORAGE_KEY = '@waymark:share_extension_tip_shown_v1';

/**
 * Returns `true` when the current install has already rendered the tip.
 *
 * Fail-closed on read errors: we return `true` so a broken AsyncStorage doesn't
 * turn every save into a re-teach of the Share Extension. Mirrors the bias of
 * `hasSeenSocialMigrationModal` — informational content, low cost either way.
 */
export async function hasShownShareExtensionTip(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SHARE_EXTENSION_TIP_STORAGE_KEY);
    return value === 'true';
  } catch (err) {
    console.warn('[shareExtensionTipFlag] read failed', err);
    return true;
  }
}

/**
 * Persists the "tip has been shown" flag. Swallows persistence errors — the
 * worst case is the tip re-shows on the user's next first-pin state (there
 * won't be one on the same install), which is acceptable per PRD.
 */
export async function markShareExtensionTipShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(SHARE_EXTENSION_TIP_STORAGE_KEY, 'true');
  } catch (err) {
    console.warn('[shareExtensionTipFlag] write failed', err);
  }
}
