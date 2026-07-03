import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { categoryColor } from '../theme';
import type { LieuCategory } from '../types/Lieu';

interface Props {
  category: LieuCategory;
  /** Diameter in points. Default 14 — the canonical map-marker size. */
  size?: number;
  style?: ViewStyle;
}

/**
 * Flat colored circle — the atlas's map marker + list-row dot. Zero text,
 * zero border, subtle shadow so it lifts off paper without becoming a chip.
 *
 * The color is resolved via `categoryColor()` — never inline a hex here.
 */
export default function CategoryPin({ category, size = 14, style }: Props) {
  const color = categoryColor(category);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Catégorie ${category}`}
      style={[
        styles.pin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  pin: {
    // Subtle shadow — reads on paper without becoming a "chip"
    shadowColor: '#14100A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
    elevation: 1,
  },
});
