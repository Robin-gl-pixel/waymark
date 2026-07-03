import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

/**
 * One-shot informational modal for the social layer update (GitHub #43).
 *
 * Dismissable ONLY via the "Compris" button — not by tapping the backdrop, and
 * not by Android hardware back (`onRequestClose` is a no-op). The acknowledgement
 * is a soft consent gesture; letting users escape it silently defeats the point.
 *
 * The modal itself does NOT persist the flag — the parent owns that state so
 * the flag update stays in the same place as the "should I show?" check
 * (see App.tsx Root component).
 */

interface Props {
  visible: boolean;
  /** Fired when the user taps « Compris ». Parent should persist the flag then hide. */
  onAcknowledge: () => void;
}

export default function SocialMigrationModal({ visible, onAcknowledge }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // No-op: prevents Android hardware back from closing the modal without
      // acknowledgement. iOS default fullscreen Modal has no swipe-to-dismiss
      // affordance, so this covers both platforms.
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View
          style={styles.card}
          accessibilityRole="alert"
          accessibilityLabel="Nouveauté sociale"
        >
          <Text style={styles.title}>Nouveauté sociale</Text>
          <View style={styles.body}>
            <Text style={styles.line}>
              Tes notes sur les lieux sont maintenant visibles à tes followers
              (pas à n'importe qui).
            </Text>
            <Text style={styles.line}>
              Tes pins sont visibles uniquement à tes followers. Un profil
              non-suivi ne voit rien.
            </Text>
            <Text style={styles.line}>
              Si tu veux qu'une note reste privée, édite-la ou supprime-la.
            </Text>
          </View>
          <Pressable
            onPress={onAcknowledge}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Compris"
          >
            <Text style={styles.ctaLabel}>Compris</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing['2xl'],
    gap: spacing.xl,
  },
  title: {
    ...type.h2,
    color: colors.text,
    fontWeight: '700',
  },
  body: {
    gap: spacing.md,
  },
  line: {
    ...type.body,
    color: colors.textSecondary,
  },
  cta: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    ...type.h3,
    color: colors.bg,
    fontWeight: '700',
  },
  pressed: { opacity: 0.7 },
});
