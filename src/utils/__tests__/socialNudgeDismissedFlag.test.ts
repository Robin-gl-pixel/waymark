/**
 * Contract tests for the social-nudge-banner dismissal AsyncStorage flag
 * (GitHub #81). Mirrors `socialMigrationFlag.test.ts` — module-level mock of
 * `@react-native-async-storage/async-storage` so the tests exercise the exact
 * production code path (getItem/setItem calls with the versioned key) without
 * pulling in the RN runtime.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null)),
      setItem: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      }),
      // Test-only reset — jest.resetModules() would nuke the module registry
      // between tests but AsyncStorage state lives in this closure, so give
      // tests a way to clear it directly.
      __reset__: () => {
        store.clear();
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasDismissedSocialNudge,
  markSocialNudgeDismissed,
  SOCIAL_NUDGE_DISMISSED_STORAGE_KEY,
} from '../socialNudgeDismissedFlag';

// jest.mock replaces the default export with an object that has __reset__.
// TS doesn't know about it, so cast at the boundary once.
const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  __reset__: () => void;
};

describe('socialNudgeDismissedFlag', () => {
  beforeEach(() => {
    storage.__reset__();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
  });

  describe('hasDismissedSocialNudge', () => {
    it('returns false on a fresh install (no key set)', async () => {
      await expect(hasDismissedSocialNudge()).resolves.toBe(false);
      expect(storage.getItem).toHaveBeenCalledWith(SOCIAL_NUDGE_DISMISSED_STORAGE_KEY);
    });

    it('returns true once the key is set to "true"', async () => {
      await markSocialNudgeDismissed();
      await expect(hasDismissedSocialNudge()).resolves.toBe(true);
    });

    it('returns false when the stored value is anything other than "true"', async () => {
      // Guard against a stale legacy value from a prior build accidentally
      // being interpreted as "dismissed".
      await AsyncStorage.setItem(SOCIAL_NUDGE_DISMISSED_STORAGE_KEY, 'false');
      await expect(hasDismissedSocialNudge()).resolves.toBe(false);
    });

    it('fails closed (returns true) when AsyncStorage.getItem throws', async () => {
      // Broken storage shouldn't spam the banner on every launch — the nudge
      // is low-value informational, so we'd rather miss showing it than nag.
      storage.getItem.mockImplementationOnce(() =>
        Promise.reject(new Error('async-storage broken')),
      );
      await expect(hasDismissedSocialNudge()).resolves.toBe(true);
    });
  });

  describe('markSocialNudgeDismissed', () => {
    it('persists the flag so a subsequent read returns true', async () => {
      await markSocialNudgeDismissed();
      expect(storage.setItem).toHaveBeenCalledWith(SOCIAL_NUDGE_DISMISSED_STORAGE_KEY, 'true');
      await expect(hasDismissedSocialNudge()).resolves.toBe(true);
    });

    it('resolves without throwing when AsyncStorage.setItem rejects', async () => {
      // Persistence failure must never crash the app — worst case the banner
      // re-shows on next launch, which the PRD explicitly accepts.
      storage.setItem.mockImplementationOnce(() =>
        Promise.reject(new Error('async-storage write failed')),
      );
      await expect(markSocialNudgeDismissed()).resolves.toBeUndefined();
    });
  });

  describe('storage key', () => {
    it('is namespaced under the @waymark scope and versioned', () => {
      // The key is a public API for anyone debugging in-app: a rename would
      // silently re-show the banner to every existing install. Lock it here.
      expect(SOCIAL_NUDGE_DISMISSED_STORAGE_KEY).toBe(
        '@waymark:social_nudge_dismissed_v1',
      );
    });
  });
});
