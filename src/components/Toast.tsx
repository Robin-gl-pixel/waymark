import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

/**
 * Minimal auto-dismissing toast (GitHub #80).
 *
 * Fades + slides in on mount, holds for `durationMs`, then fades out and calls
 * `onDismiss`. Tap anywhere on the toast to dismiss early. Non-blocking:
 * pointer events pass through the surrounding space so the underlying Map
 * stays fully interactive — only the pill itself intercepts taps.
 *
 * No external dep — the parent PRD explicitly forbids adding one. Layout is a
 * single pill overlaid at the position the parent picks (via `style` /
 * absolute-fill parent), so this component owns only the animation + timer,
 * not the placement.
 */
interface Props {
  message: string;
  /** Called after the exit animation completes. Parent unmounts on this. */
  onDismiss: () => void;
  /** Auto-dismiss delay (ms). Defaults to 2500ms — long enough to read a
   *  short French sentence, short enough to not linger on the map. */
  durationMs?: number;
  /** Optional secondary muted line (used by the Share Extension tip to spell
   *  out the "Insta → Pinti Share" mechanic under the headline). */
  hint?: string;
}

const DEFAULT_DURATION_MS = 2500;

export default function Toast({
  message,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  hint,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  // `dismissed` guards against a double-dismiss (auto-timer + user tap firing
  // both callbacks) — the parent's unmount is only safe to trigger once.
  const dismissed = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      dismiss();
    }, durationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -8, duration: 160, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.pill,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={hint ? `${message} — ${hint}` : message}
          style={styles.press}
        >
          <Text style={styles.message}>{message}</Text>
          {hint && <Text style={styles.hint}>{hint}</Text>}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  pill: {
    maxWidth: 340,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  press: {
    alignItems: 'center',
  },
  message: {
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    ...type.monoSm,
    color: colors.paper,
    opacity: 0.75,
    marginTop: 4,
    textAlign: 'center',
  },
});
