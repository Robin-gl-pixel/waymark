/**
 * Pure helper — kept in its own file so unit tests can import it under a
 * node-jest env without bringing react-native along for the ride.
 *
 * Run `run` unless reduced motion is on. Returns a cleanup fn if `run` produced
 * one — mirrors the React effect convention so animation orchestrations can
 * cancel cleanly.
 */
export function runIfMotionAllowed(reduce: boolean, run: () => void | (() => void)): () => void {
  if (reduce) return () => {};
  const cleanup = run();
  return typeof cleanup === 'function' ? cleanup : () => {};
}
