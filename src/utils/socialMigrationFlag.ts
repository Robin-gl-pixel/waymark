import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-launch informational modal for the follower-gated pins + friend-visible
 * notes update (GitHub #43, parent #39). We record acknowledgement locally so
 * the modal never re-appears on this install.
 *
 * Storage-only (no Firestore doc, no Cloud Function) because the acknowledgement
 * is purely informational — the PRD explicitly says re-showing after a reinstall
 * is acceptable, which lines up with `SEEDED_FOLLOW_STORAGE_KEY` in `App.tsx`.
 *
 * Key is versioned (`_v1`) so a future migration copy can force a re-show
 * without colliding with the current one.
 */
export const SOCIAL_MIGRATION_STORAGE_KEY = '@waymark:social_migration_modal_seen_v1';

/**
 * Returns `true` when the current install has already seen the migration modal.
 *
 * Fail-closed on read errors: we return `true` so a broken AsyncStorage doesn't
 * spam the modal on every launch. Mirrors the fail-open bias in App.tsx's
 * `refreshSeededFollow` — informational content, low cost either way.
 */
export async function hasSeenSocialMigrationModal(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SOCIAL_MIGRATION_STORAGE_KEY);
    return value === 'true';
  } catch (err) {
    console.warn('[socialMigrationFlag] read failed', err);
    return true;
  }
}

/**
 * Persists the "user tapped Compris" flag. Swallows persistence errors — the
 * worst case is the modal re-shows on next launch, which is acceptable per PRD
 * ("informational content, low friction").
 */
export async function markSocialMigrationModalSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SOCIAL_MIGRATION_STORAGE_KEY, 'true');
  } catch (err) {
    console.warn('[socialMigrationFlag] write failed', err);
  }
}
