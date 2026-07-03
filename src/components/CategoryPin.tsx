import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { categoryColor, colors } from '../theme';
import type { LieuCategory } from '../types/Lieu';

interface Props {
  category: LieuCategory;
  /** Diameter in points. Default 14 — the canonical map-marker size. */
  size?: number;
  style?: ViewStyle;
}

/**
 * Flat colored circle — the atlas's map marker + list-row dot. An ink hairline
 * stroke keeps every hue legible on any map tile (chartreuse-Bar in particular
 * blended into the light OSM/Apple ground without it), and a slightly more
 * marked micro-shadow lifts the dot off paper without turning it into a chip.
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
    // 1.5px ink stroke — the v8 mockup edge that was lost in the first port.
    // Guarantees Bar-chartreuse (and every other cat) reads against any tile.
    borderWidth: 1.5,
    borderColor: colors.ink,
    // Slightly more marked micro-shadow so the dot lifts off paper/tile.
    shadowColor: '#14100A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
});
