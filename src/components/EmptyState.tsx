import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  /** Primary CTA — only render one, keep the empty state punchy. */
  ctaLabel?: string;
  onCtaPress?: () => void;
  /** Icon size, defaults to 72 (big enough to anchor the frame). */
  iconSize?: number;
  style?: ViewStyle;
}

/**
 * Shared empty-state pattern for social screens.
 *
 * Uses a large muted Ionicon as the visual anchor, a bold heading, a
 * one-sentence "why" paragraph, and an optional CTA pill in the brand accent.
 * Kept deliberately terse — every empty state in the app should render at the
 * same rhythm so users learn "nothing here yet + here's what to do".
 */
export default function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCtaPress,
  iconSize = 72,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={iconSize} color={colors.textTertiary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <Pressable
          onPress={onCtaPress}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  iconWrap: {
    marginBottom: spacing.lg,
    opacity: 0.85,
  },
  title: {
    ...type.h2,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 320,
  },
  cta: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    ...type.body,
    color: colors.text,
    fontWeight: '700',
  },
});
