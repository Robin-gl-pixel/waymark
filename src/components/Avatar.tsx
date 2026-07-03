import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { avatarColor, avatarInitial } from '../utils/avatar';
import { fonts } from '../theme';

interface Props {
  /** The @handle without the leading `@`. Empty/null shows a neutral tile. */
  username: string | null | undefined;
  /** Diameter in px. Text size = ~46% of diameter. Defaults to 44. */
  size?: number;
  /** Extra style overrides — margins / positioning. */
  style?: ViewStyle;
}

/**
 * Colored-circle + initial avatar. Deterministic — same username, same colour.
 *
 * Renders a slim inner ring for extra depth on dark backgrounds; the letter
 * uses a semi-condensed weight so it stays legible at small sizes without
 * competing with the tile colour. Text scales as ~46% of the tile diameter,
 * which lands correctly for the sizes we actually use (36–96 px).
 */
export default function Avatar({ username, size = 44, style }: Props) {
  const bg = avatarColor(username);
  const letter = avatarInitial(username);
  const dim = { width: size, height: size, borderRadius: size / 2 };
  const fontSize = Math.round(size * 0.46);
  return (
    <View
      style={[styles.wrap, dim, { backgroundColor: bg }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.letter, { fontSize, lineHeight: Math.round(fontSize * 1.1) }]}>
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    // Faint dark ring so the tile still reads on very-light palette entries.
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  letter: {
    color: '#FFFFFF',
    fontFamily: fonts.extrabold,
    // A tiny inset so the letter doesn't visually kiss the ring on some devices.
    marginTop: -1,
    includeFontPadding: false,
  },
});
