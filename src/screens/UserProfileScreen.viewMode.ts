/**
 * Pure resolver for `UserProfileScreen`'s three render modes.
 *
 * Extracted from the screen so the mode decision (a contract from issue #49)
 * can be unit-tested without pulling in react-native, navigation, or the map
 * dependency tree. The screen imports and consumes this — it does not
 * re-implement the logic.
 *
 * - `own` — the viewer is the owner. Full profile, no follow button.
 * - `follower` — the viewer follows the owner. Full profile with `Suivi` state.
 * - `locked` — the viewer does not follow the owner. Renders `<ProfileLocked>`
 *   with a cerise « Suivre » CTA in place of the map + pin list.
 *
 * `isFollowing === null` is treated as `locked` so the viewer never sees a
 * stranger's pins during the loading window (fail-closed).
 */
export type ProfileViewMode = 'own' | 'follower' | 'locked';

export function resolveProfileViewMode(
  isMe: boolean,
  isFollowing: boolean | null,
): ProfileViewMode {
  if (isMe) return 'own';
  return isFollowing === true ? 'follower' : 'locked';
}
