/**
 * Contract tests for the social-migration-modal AsyncStorage flag (GitHub #43).
 *
 * We mock `@react-native-async-storage/async-storage` module-level so tests
 * exercise the exact production code path (getItem/setItem calls with the
 * versioned key) without pulling in the RN runtime. Matches the "test at the
 * seam" convention — the seam here is AsyncStorage, wrapped by two functions
 * whose external contract is what we assert.
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
  hasSeenSocialMigrationModal,
  markSocialMigrationModalSeen,
  SOCIAL_MIGRATION_STORAGE_KEY,
} from '../socialMigrationFlag';

// jest.mock replaces the default export with an object that has __reset__.
// TS doesn't know about it, so cast at the boundary once.
const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  __reset__: () => void;
};

describe('socialMigrationFlag', () => {
  beforeEach(() => {
    storage.__reset__();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
  });

  describe('hasSeenSocialMigrationModal', () => {
    it('returns false on a fresh install (no key set)', async () => {
      await expect(hasSeenSocialMigrationModal()).resolves.toBe(false);
      expect(storage.getItem).toHaveBeenCalledWith(SOCIAL_MIGRATION_STORAGE_KEY);
    });

    it('returns true once the key is set to "true"', async () => {
      await markSocialMigrationModalSeen();
      await expect(hasSeenSocialMigrationModal()).resolves.toBe(true);
    });

    it('returns false when the stored value is anything other than "true"', async () => {
      // Guard against a stale legacy value from a prior build accidentally
      // being interpreted as "seen".
      await AsyncStorage.setItem(SOCIAL_MIGRATION_STORAGE_KEY, 'false');
      await expect(hasSeenSocialMigrationModal()).resolves.toBe(false);
    });

    it('fails closed (returns true) when AsyncStorage.getItem throws', async () => {
      // Broken storage shouldn't spam the modal on every launch — the modal
      // is informational, so we'd rather miss showing it than nag repeatedly.
      storage.getItem.mockImplementationOnce(() =>
        Promise.reject(new Error('async-storage broken')),
      );
      await expect(hasSeenSocialMigrationModal()).resolves.toBe(true);
    });
  });

  describe('markSocialMigrationModalSeen', () => {
    it('persists the flag so a subsequent read returns true', async () => {
      await markSocialMigrationModalSeen();
      expect(storage.setItem).toHaveBeenCalledWith(SOCIAL_MIGRATION_STORAGE_KEY, 'true');
      await expect(hasSeenSocialMigrationModal()).resolves.toBe(true);
    });

    it('resolves without throwing when AsyncStorage.setItem rejects', async () => {
      // Persistence failure must never crash the app — worst case the modal
      // re-shows on next launch, which the PRD explicitly accepts.
      storage.setItem.mockImplementationOnce(() =>
        Promise.reject(new Error('async-storage write failed')),
      );
      await expect(markSocialMigrationModalSeen()).resolves.toBeUndefined();
    });
  });

  describe('storage key', () => {
    it('is namespaced under the @waymark scope and versioned', () => {
      // The key is a public API for anyone debugging in-app: a rename would
      // silently re-show the modal to every existing install. Lock it here.
      expect(SOCIAL_MIGRATION_STORAGE_KEY).toBe('@waymark:social_migration_modal_seen_v1');
    });
  });
});
