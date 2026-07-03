/**
 * Contract test for the reduced-motion helper.
 *
 * The hook itself is React-only and best exercised via React Testing Library —
 * outside this project's current jest setup. We at least assert the imperative
 * `runIfMotionAllowed` helper honours the flag, so refonte animations can rely
 * on it without a boolean-inversion bug slipping into production.
 */

import { runIfMotionAllowed } from '../runIfMotionAllowed';

describe('runIfMotionAllowed', () => {
  it('runs the callback when reduce is false', () => {
    const spy = jest.fn();
    runIfMotionAllowed(false, spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('skips the callback when reduce is true', () => {
    const spy = jest.fn();
    runIfMotionAllowed(true, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns a cleanup fn that forwards to the caller-provided cleanup', () => {
    const cleanup = jest.fn();
    const cancel = runIfMotionAllowed(false, () => cleanup);
    cancel();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op cleanup when reduce is true (no callback to clean up)', () => {
    const cancel = runIfMotionAllowed(true, () => {
      throw new Error('should not run');
    });
    // Must not throw when caller cleans up.
    expect(() => cancel()).not.toThrow();
  });

  it('returns a no-op cleanup when the callback returns undefined', () => {
    const cancel = runIfMotionAllowed(false, () => {
      // intentional no-return
    });
    expect(() => cancel()).not.toThrow();
  });
});
