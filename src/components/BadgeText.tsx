import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { colors, type } from '../theme';

export type BadgeStatus = 'wishlist' | 'visited' | null;

interface Props {
  status: BadgeStatus;
  style?: TextStyle;
}

/**
 * Renders the user's relation to a lieu as short French mono uppercase.
 * `wishlist` → « Envie » in peau (catCafe), `visited` → « Allé » in
 * chartreuse (catBar), `null` → renders nothing.
 *
 * Kept as a plain <Text> (not a pill) — the color IS the badge.
 */
export default function BadgeText({ status, style }: Props) {
  if (status === null) return null;

  const label = status === 'wishlist' ? 'Envie' : 'Allé';
  const color = status === 'wishlist' ? colors.catCafe : colors.catBar;

  return <Text style={[styles.label, { color }, style]}>{label}</Text>;
}

const styles = StyleSheet.create({
  label: {
    ...type.mono,
    fontWeight: '700',
  },
});
