import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, spacing, type } from '../theme';
import type { BadgeStatus } from './BadgeText';

interface Props {
  status: BadgeStatus;
  onChange: (next: BadgeStatus) => void;
  style?: ViewStyle;
}

/**
 * Two side-by-side ink-outlined buttons — « Envie » and « Allé ».
 *
 * The currently-active button fills with solid ink and its label goes paper.
 * Tapping the active button clears the status (calls `onChange(null)`); tapping
 * the inactive one sets it. Fully controlled — the parent owns the state.
 */
export default function StatusToggle({ status, onChange, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <ToggleButton
        label="Envie"
        active={status === 'wishlist'}
        onPress={() => onChange(status === 'wishlist' ? null : 'wishlist')}
      />
      <ToggleButton
        label="Allé"
        active={status === 'visited'}
        onPress={() => onChange(status === 'visited' ? null : 'visited')}
      />
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active ? styles.buttonActive : styles.buttonInactive,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: colors.ink,
  },
  buttonInactive: {
    backgroundColor: 'transparent',
  },
  label: {
    ...type.mono,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.paper,
  },
  labelInactive: {
    color: colors.ink,
  },
});
