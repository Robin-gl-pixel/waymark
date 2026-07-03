import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { categoryColor, colors, radius, spacing, type } from '../theme';
import type { LieuCategory } from '../types/Lieu';

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
        <BlurredPinField />
        <View style={styles.lockedBlurLayer} />
        <View style={styles.lockedMessageWrap}>
          <Text style={styles.lockedMessage}>Sa carte est réservée à ses followers</Text>
          <Text style={styles.lockedSubtitle}>Suis pour la débloquer</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Five semi-transparent dots in category colors, semi-blurred behind the
 * locked-map message. Positions chosen to echo the mockup's phone 04 layout
 * (top-left resto, top-right bar, middle hotel, bottom-left café,
 * bottom-right musée) — a hint of the atlas behind the veil.
 */
function BlurredPinField() {
  return (
    <View style={styles.pinField} pointerEvents="none">
      {PIN_FIELD.map((pin, i) => (
        <View
          key={i}
          style={[
            styles.pinFieldDot,
            {
              backgroundColor: categoryColor(pin.category),
              top: pin.top,
              left: pin.left,
            },
          ]}
        />
      ))}
    </View>
  );
}

const PIN_FIELD: Array<{ category: LieuCategory; top: `${number}%`; left: `${number}%` }> = [
  { category: 'resto', top: '20%', left: '25%' },
  { category: 'bar', top: '35%', left: '75%' },
  { category: 'café', top: '68%', left: '30%' },
  { category: 'musée', top: '82%', left: '72%' },
  { category: 'hôtel', top: '50%', left: '52%' },
];

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
  pinField: {
    ...StyleSheet.absoluteFillObject,
    // No blur() in RN core — the paper overlay above plus opacity 0.35 on the
    // dots gives the veiled effect described in the v8 mockup (§ Écrans
    // sociaux, phone 04). A real Gaussian blur would need @react-native-community/blur;
    // scope creep for this slice, and the paper veil already reads as blurred.
  },
  pinFieldDot: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.35,
    // Slight halo so the color reads at low opacity
    shadowColor: '#14100A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  lockedMessageWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  lockedMessage: {
    ...type.serifItalic,
    color: colors.graphite,
    textAlign: 'center',
  },
  lockedSubtitle: {
    ...type.mono,
    color: colors.graphite,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1.4,
  },
});
