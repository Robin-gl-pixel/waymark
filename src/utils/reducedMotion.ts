/**
 * Reduced-motion audit hook.
 *
 * The v8 refonte adds two motion moments (map pin pulse on selection, list
 * counter roll on save) that must respect iOS "Reduce Motion" and Android
 * "Remove animations" — a hard accessibility requirement in PRD #44.
 *
 * `useReducedMotion()` returns the current preference and stays in sync with
 * user changes via `AccessibilityInfo`'s change event. Consumers can gate any
 * animated transition on this — the compiled `Animated` value should skip
 * straight to the terminal state when `reduce === true`.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export { runIfMotionAllowed } from './runIfMotionAllowed';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Initial read — some platforms resolve synchronously, but await either way.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch((err) => {
        // A read failure shouldn't hide reduced-motion state — assume default
        // (no reduce) but log so we notice regressions on RN upgrades.
        console.warn('[useReducedMotion] isReduceMotionEnabled failed', err);
      });

    // Subscribe so a user toggling "Reduce Motion" mid-session propagates
    // without a full app reload. `remove()` is idempotent on modern RN.
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(!!value);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduced;
}
