import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export interface ProfileStats {
  saves: number;
  followers: number;
  following: number;
}

interface Props {
  /** @-handle (without the @). */
  handle: string;
  /** URI for the user's avatar. Optional — the initial-tile fallback lives at the call site. */
  avatar?: string | null;
  stats: ProfileStats;
  bio?: string | null;
  onFollow: () => void;
  style?: ViewStyle;
}

/**
 * Full-screen locked skeleton shown when the viewer is not following the
 * profile owner. Reveals only: avatar + handle (grotesque black uppercase)
 * + stats (mono) + italic-serif bio + cerise « Suivre » CTA + a blurred pin
 * field placeholder + the « Sa carte est réservée à ses followers » message.
 *
 * The map area is a static placeholder in this component — the real blurred
 * pin field lands in a later slice. What matters here is the shape and the
 * social affordance (the CTA).
 */
export default function ProfileLocked({
  handle,
  avatar,
  stats,
  bio,
  onFollow,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatar ? null : <Text style={styles.avatarInitial}>{initialOf(handle)}</Text>}
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{handle.toUpperCase()}
        </Text>
        <View style={styles.statsRow}>
          <Stat value={stats.saves} label="saves" />
          <Stat value={stats.followers} label="followers" />
          <Stat value={stats.following} label="following" />
        </View>
        {bio ? <Text style={styles.bio}>« {bio} »</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Suivre"
          onPress={onFollow}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ctaLabel}>Suivre</Text>
        </Pressable>
      </View>

      <View style={styles.lockedField}>
        <View style={styles.lockedBlurLayer} />
        <Text style={styles.lockedMessage}>Sa carte est réservée à ses followers</Text>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function initialOf(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.length === 0 ? '?' : trimmed.charAt(0).toUpperCase();
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.hair,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarInitial: {
    ...type.h1,
    color: colors.ink,
  },
  handle: {
    ...type.h1,
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    ...type.mono,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  statLabel: {
    ...type.mono,
    color: colors.graphite,
    marginTop: 2,
  },
  bio: {
    ...type.serifItalic,
    color: colors.graphite,
    textAlign: 'center',
    marginTop: spacing.lg,
    maxWidth: 320,
  },
  cta: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
  },
  lockedField: {
    flex: 1,
    marginHorizontal: spacing.xl,
    marginBottom: spacing['3xl'],
    borderRadius: radius.md,
    backgroundColor: colors.hair,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lockedBlurLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.paper,
    opacity: 0.4,
  },
  lockedMessage: {
    ...type.serifItalic,
    color: colors.graphite,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
