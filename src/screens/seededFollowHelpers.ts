import type { UserProfile } from '../types/User';
import type { SocialService } from '../services/socialService';

/**
 * SeededFollowScreen helpers (GitHub #17).
 *
 * The screen shows a small list of Pinti Curated accounts, each with a Switch
 * default-ON, and a "Continuer" button. The two functions below are the pure
 * pieces of the flow that we test at the seam via `InMemorySocialService`:
 *
 * 1. `pickBatchFollowTargets` — given the current user list + selected map,
 *    return the users whose Switch is still ON (the ones we'll actually follow).
 *
 * 2. `runBatchFollow` — given a service instance and a target list, issue the
 *    follow calls in parallel. A single failure is swallowed with a `console.warn`
 *    so the flow degrades gracefully — the user still lands on the Map even if
 *    one write hit a permission-denied.
 *
 * Kept pure (no React) so both are trivially unit-testable without spinning up
 * the RN test env.
 */

/**
 * Filter the loaded curated users down to the ones the caller wants to follow.
 * `selected` is a `uid → boolean` map — a missing key defaults to OFF (matches
 * the semantics of the Switch component's controlled value).
 */
export function pickBatchFollowTargets(
  users: UserProfile[],
  selected: Record<string, boolean>,
): UserProfile[] {
  return users.filter((u) => selected[u.uid] === true);
}

/**
 * Fan out `follow()` calls in parallel. Never throws — logs and skips on
 * individual failures so the seeded-follow step never traps the user.
 */
export async function runBatchFollow(
  svc: Pick<SocialService, 'follow'>,
  targets: UserProfile[],
): Promise<void> {
  await Promise.all(
    targets.map(async (u) => {
      try {
        await svc.follow(u.uid);
      } catch (err) {
        console.warn('[SeededFollow] follow failed for', u.uid, err);
      }
    }),
  );
}
