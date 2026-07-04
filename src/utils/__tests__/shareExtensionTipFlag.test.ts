/**
 * Contract tests for the share-extension-tip AsyncStorage flag (GitHub #80).
 *
 * We mock `@react-native-async-storage/async-storage` module-level so tests
 * exercise the exact production code path (getItem/setItem calls with the
 * versioned key) without pulling in the RN runtime. Matches the "test at the
 * seam" convention already used by `socialMigrationFlag.test.ts` — the seam
 * here is AsyncStorage, wrapped by two functions whose external contract is
 * what we assert.
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
  hasShownShareExtensionTip,
  markShareExtensionTipShown,
  SHARE_EXTENSION_TIP_STORAGE_KEY,
} from '../shareExtensionTipFlag';

// jest.mock replaces the default export with an object that has __reset__.
// TS doesn't know about it, so cast at the boundary once.
const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  __reset__: () => void;
};

describe('shareExtensionTipFlag', () => {
  beforeEach(() => {
    storage.__reset__();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
  });

  describe('hasShownShareExtensionTip', () => {
    it('returns false on a fresh install (no key set)', async () => {
      await expect(hasShownShareExtensionTip()).resolves.toBe(false);
      expect(storage.getItem).toHaveBeenCalledWith(SHARE_EXTENSION_TIP_STORAGE_KEY);
    });

    it('returns true once the key is set to "true"', async () => {
      await markShareExtensionTipShown();
      await expect(hasShownShareExtensionTip()).resolves.toBe(true);
    });

    it('returns false when the stored value is anything other than "true"', async () => {
      // Guard against a stale legacy value from a prior build accidentally
      // being interpreted as "shown".
      await AsyncStorage.setItem(SHARE_EXTENSION_TIP_STORAGE_KEY, 'false');
      await expect(hasShownShareExtensionTip()).resolves.toBe(false);
    });

    it('fails closed (returns true) when AsyncStorage.getItem throws', async () => {
      // Broken storage shouldn't turn every save into a re-teach of the Share
      // Extension — the tip is informational, so we'd rather miss showing it
      // than spam it after a storage regression.
      storage.getItem.mockImplementationOnce(() =>
        Promise.reject(new Error('async-storage broken')),
      );
      await expect(hasShownShareExtensionTip()).resolves.toBe(true);
    });
  });

  describe('markShareExtensionTipShown', () => {
    it('persists the flag so a subsequent read returns true', async () => {
      await markShareExtensionTipShown();
      expect(storage.setItem).toHaveBeenCalledWith(SHARE_EXTENSION_TIP_STORAGE_KEY, 'true');
      await expect(hasShownShareExtensionTip()).resolves.toBe(true);
    });

    it('resolves without throwing when AsyncStorage.setItem rejects', async () => {
      // Persistence failure must never crash the save flow — worst case the
      // tip re-shows on the next fresh-install first pin, which the PRD
      // explicitly accepts.
      storage.setItem.mockImplementationOnce(() =>
        Promise.reject(new Error('async-storage write failed')),
      );
      await expect(markShareExtensionTipShown()).resolves.toBeUndefined();
    });
  });

  describe('storage key', () => {
    it('is namespaced under the @waymark scope and versioned', () => {
      // The key is a public API for anyone debugging in-app: a rename would
      // silently re-show the tip to every existing install. Lock it here.
      expect(SHARE_EXTENSION_TIP_STORAGE_KEY).toBe('@waymark:share_extension_tip_shown_v1');
    });
  });
});
