import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  message?: string;
  onRetry?: () => void;
  /** Override the retry button label — defaults to "Réessayer". */
  retryLabel?: string;
  style?: ViewStyle;
}

/**
 * Shared error card with a retry pill. Shown when a network read fails —
 * every load path in the social layer routes through this rather than a bare
 * red string, so failures always give the user an obvious next step.
 */
export default function ErrorState({
  message = 'Chargement échoué.',
  onRetry,
  retryLabel = 'Réessayer',
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Ionicons name="warning-outline" size={40} color={colors.error} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Ionicons name="refresh" size={16} color={colors.text} />
          <Text style={styles.btnLabel}>{retryLabel}</Text>
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
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  message: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnLabel: {
    ...type.body,
    color: colors.text,
    fontWeight: '600',
  },
});
