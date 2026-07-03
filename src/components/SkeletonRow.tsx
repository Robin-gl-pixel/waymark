import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

/**
 * Skeleton primitives with a subtle fade shimmer, built on react-native's
 * `Animated` (no new deps). One shared driver would be nicer for perf, but
 * these lists are short-lived — a per-row driver keeps the API stateless and
 * cheap enough for V1.
 */

interface BlockProps {
  width?: number | `${number}%`;
  height?: number;
  br?: number;
  style?: ViewStyle;
}

/** Base building block — a single shimmer rectangle. */
export function SkeletonBlock({ width = '100%', height = 12, br = 6, style }: BlockProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: br,
          backgroundColor: colors.bgElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** A circular skeleton (avatars). */
export function SkeletonCircle({ size = 44, style }: { size?: number; style?: ViewStyle }) {
  return <SkeletonBlock width={size} height={size} br={size / 2} style={style} />;
}

/**
 * Standard list-row skeleton: avatar circle + 2 stacked bars. Matches the
 * row shape used by NetworkFeed / SearchUsers / BlockedUsers so the layout
 * doesn't jump when real data lands.
 */
export function SkeletonRow({
  avatarSize = 44,
  thumbShape = 'circle',
}: {
  avatarSize?: number;
  thumbShape?: 'circle' | 'square';
}) {
  return (
    <View style={styles.row}>
      {thumbShape === 'circle' ? (
        <SkeletonCircle size={avatarSize} />
      ) : (
        <SkeletonBlock width={avatarSize} height={avatarSize} br={radius.md} />
      )}
      <View style={styles.rowBody}>
        <SkeletonBlock width="60%" height={14} />
        <SkeletonBlock width="40%" height={11} style={{ marginTop: spacing.sm }} />
      </View>
    </View>
  );
}

/** Repeat `SkeletonRow` N times — reduces caller noise. */
export function SkeletonRowList({
  count = 5,
  thumbShape = 'circle',
  avatarSize = 44,
}: {
  count?: number;
  thumbShape?: 'circle' | 'square';
  avatarSize?: number;
}) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} thumbShape={thumbShape} avatarSize={avatarSize} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowBody: {
    flex: 1,
  },
});
