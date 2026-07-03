/**
 * Unit tests for the iOS Shortcut auth helpers (#7).
 *
 * The handler itself pulls in `firebase-functions/v2/https`, `firebase-admin`,
 * and the vision + geocoding libs — all heavy modules whose init happens at
 * import time. We test the two exported helpers (`parseBearerToken`,
 * `findUserByShortcutToken`) in isolation because that's where the security
 * surface lives: the guarantee that a malformed header fails at the earliest
 * gate, and that a valid token round-trips through Firestore to the owning uid.
 */

import { parseBearerToken, findUserByShortcutToken, SHORTCUT_TOKEN_HEX_LENGTH } from '../extractFromShortcut';

describe('parseBearerToken (slice #7 — Shortcut auth)', () => {
  const validToken = 'a'.repeat(SHORTCUT_TOKEN_HEX_LENGTH);

  it('accepts a well-formed Bearer header with a 64-char hex token', () => {
    expect(parseBearerToken(`Bearer ${validToken}`)).toBe(validToken);
  });

  it('lower-cases the token so mixed-case pastes still match Firestore', () => {
    // The client-side generator emits lowercase; a rogue Shortcut author might
    // upper-case theirs. Normalize so both paths converge on the same key.
    const mixed = 'A'.repeat(SHORTCUT_TOKEN_HEX_LENGTH);
    expect(parseBearerToken(`Bearer ${mixed}`)).toBe('a'.repeat(SHORTCUT_TOKEN_HEX_LENGTH));
  });

  it('rejects a missing header', () => {
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it('rejects a header without the "Bearer " prefix', () => {
    expect(parseBearerToken(validToken)).toBeNull();
    expect(parseBearerToken(`Basic ${validToken}`)).toBeNull();
  });

  it('rejects a token whose length is off', () => {
    // Short by one char.
    expect(parseBearerToken(`Bearer ${'a'.repeat(SHORTCUT_TOKEN_HEX_LENGTH - 1)}`)).toBeNull();
    // Long by one char.
    expect(parseBearerToken(`Bearer ${'a'.repeat(SHORTCUT_TOKEN_HEX_LENGTH + 1)}`)).toBeNull();
  });

  it('rejects non-hex characters', () => {
    // 'g' is out of the hex alphabet — a token from a broken PRNG shouldn't
    // sneak through as if it were a real hex blob.
    expect(parseBearerToken(`Bearer ${'g'.repeat(SHORTCUT_TOKEN_HEX_LENGTH)}`)).toBeNull();
  });

  it('handles express array-shaped headers by taking the first value', () => {
    // Express sometimes exposes duplicated headers as an array; we take [0]
    // and reject the rest by ignoring — same posture as most middlewares.
    expect(parseBearerToken([`Bearer ${validToken}`, 'garbage'])).toBe(validToken);
  });
});

describe('findUserByShortcutToken (slice #7 — Shortcut lookup)', () => {
  // Minimal fake — enough to model `db.collection('users').where(...).limit(1).get()`.
  interface FakeDoc {
    id: string;
    data: Record<string, unknown>;
  }

  function makeFakeDb(seed: FakeDoc[]): unknown {
    return {
      collection(name: string) {
        expect(name).toBe('users');
        return {
          where(field: string, op: string, value: unknown) {
            expect(field).toBe('shortcutToken');
            expect(op).toBe('==');
            const hits = seed.filter((d) => d.data.shortcutToken === value);
            return {
              limit(n: number) {
                expect(n).toBe(1);
                return {
                  async get() {
                    const docs = hits.slice(0, 1);
                    return { empty: docs.length === 0, docs };
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  it('returns the owning uid when the token matches a user', async () => {
    const db = makeFakeDb([
      { id: 'uid-alice', data: { shortcutToken: 'a'.repeat(64) } },
      { id: 'uid-bob', data: { shortcutToken: 'b'.repeat(64) } },
    ]);
    const uid = await findUserByShortcutToken(db as never, 'a'.repeat(64));
    expect(uid).toBe('uid-alice');
  });

  it('returns null when no user has this token', async () => {
    const db = makeFakeDb([{ id: 'uid-alice', data: { shortcutToken: 'a'.repeat(64) } }]);
    const uid = await findUserByShortcutToken(db as never, 'z'.repeat(64));
    expect(uid).toBeNull();
  });

  it('returns null when the users collection is empty (fresh install)', async () => {
    const db = makeFakeDb([]);
    const uid = await findUserByShortcutToken(db as never, 'a'.repeat(64));
    expect(uid).toBeNull();
  });
});
