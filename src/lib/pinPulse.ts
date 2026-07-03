import { Animated } from 'react-native';

/**
 * Duration (ms) of a single leg of the pulse — up OR down.
 * Total pulse = 2 × this. Kept short (~125ms per leg = 250ms round-trip)
 * so the pulse reads as intentional selection feedback, not motion for its
 * own sake. Matches the v8 spec (« ~250 ms scale-up to 1.2× and back »).
 */
export const PIN_PULSE_HALF_DURATION_MS = 125;

/**
 * Peak scale during the pulse. 1.2× is the v8 spec — big enough to be
 * unmistakable on the small colored dot, small enough to stay non-cartoony.
 */
export const PIN_PULSE_TARGET_SCALE = 1.2;

interface PulseOptions {
  reducedMotion: boolean;
  targetScale?: number;
  halfDurationMs?: number;
}

/**
 * Build the selection-pulse animation for a map pin.
 *
 * Returns `null` when the OS-level `prefers-reduced-motion` is on — the
 * caller renders the pin at rest without triggering any animation, which is
 * the accessible behavior required by AC #4.
 *
 * When motion is allowed, returns an `Animated.sequence` that scales the
 * passed value from 1 → targetScale → 1 in two equal-length ease legs.
 * The caller invokes `.start()` on the returned handle; the value is left at
 * exactly 1 when the sequence completes so subsequent selections re-run
 * from a clean baseline.
 *
 * `useNativeDriver: false` — react-native-maps custom Marker children re-layout
 * on JS-driven transforms; the native driver would freeze the transform on iOS.
 */
export function createPinPulse(
  animated: Animated.Value,
  { reducedMotion, targetScale = PIN_PULSE_TARGET_SCALE, halfDurationMs = PIN_PULSE_HALF_DURATION_MS }: PulseOptions,
): Animated.CompositeAnimation | null {
  if (reducedMotion) return null;
  return Animated.sequence([
    Animated.timing(animated, {
      toValue: targetScale,
      duration: halfDurationMs,
      useNativeDriver: false,
    }),
    Animated.timing(animated, {
      toValue: 1,
      duration: halfDurationMs,
      useNativeDriver: false,
    }),
  ]);
}
