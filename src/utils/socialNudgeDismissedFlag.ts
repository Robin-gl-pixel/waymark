import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Post-activation social nudge banner (GitHub #81, PRD #77) — device-local
 * "user dismissed the banner" flag. Consumed by `resolveSocialNudge` so the
 * banner disappears immediately on tap and never comes back on this install.
 *
 * Storage-only (no Firestore doc, no Cloud Function) because the dismissal is
 * a UI preference — the PRD explicitly accepts re-showing after a reinstall
 * ("AsyncStorage device-local uniquement. Une réinstallation ré-affichera
 * bandeau et tip. Acceptable en V1.").
 *
 * Key is versioned (`_v1`) so a future migration copy can force a re-show
 * without colliding with the current one — same convention as
 * `SOCIAL_MIGRATION_STORAGE_KEY` and `SEEDED_FOLLOW_STORAGE_KEY`.
 */
export const SOCIAL_NUDGE_DISMISSED_STORAGE_KEY =
  '@waymark:social_nudge_dismissed_v1';

/**
 * Returns `true` when the current install has already dismissed the banner.
 *
 * Fail-closed on read errors: we return `true` so a broken AsyncStorage doesn't
 * spam the banner on every launch. Mirrors the fail-open bias in
 * `hasSeenSocialMigrationModal` — this is a low-value nudge, we'd rather miss
 * showing it than nag repeatedly if storage is misbehaving.
 */
export async function hasDismissedSocialNudge(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SOCIAL_NUDGE_DISMISSED_STORAGE_KEY);
    return value === 'true';
  } catch (err) {
    console.warn('[socialNudgeDismissedFlag] read failed', err);
    return true;
  }
}

/**
 * Persists the "user tapped the dismiss cross" flag. Swallows persistence
 * errors — the worst case is the banner re-shows on next launch, which is
 * acceptable per PRD ("informational content, low friction").
 */
export async function markSocialNudgeDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(SOCIAL_NUDGE_DISMISSED_STORAGE_KEY, 'true');
  } catch (err) {
    console.warn('[socialNudgeDismissedFlag] write failed', err);
  }
}
