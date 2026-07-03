import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type, radius } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

/**
 * Copy comes from `docs/PRD.md` "V1 Social Layer → Onboarding" — keep in sync
 * if the pitch evolves. Illustrations are Ionicons placeholders (no bitmap
 * assets added in this PR).
 */
const SLIDES: Slide[] = [
  {
    key: 'problem',
    icon: 'bookmark-outline',
    title: "Tes screenshots Insta s'entassent.",
    subtitle: "Impossible de retrouver ce resto que ton pote t'a montré.",
  },
  {
    key: 'solution',
    icon: 'map-outline',
    title: 'Waymark les transforme en carte, en 4 secondes.',
    subtitle: 'Screenshot → pin sur ta carte perso. Zéro saisie.',
  },
  {
    key: 'social',
    icon: 'people-outline',
    title: 'Suis les amis dont tu aimes le goût.',
    subtitle: 'Vois leurs recos, sauve les tiennes, découvrez ensemble.',
  },
];

interface Props {
  /**
   * Called when the user finishes the slide deck or taps « Passer ». The
   * parent (`Root()` in `App.tsx`) advances the first-launch state machine —
   * this screen deliberately knows nothing about which screen comes next so
   * it can also be reused as a standalone dev preview.
   */
  onComplete: () => void;
}

export default function OnboardingSlidesScreen({ onComplete }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const dismiss = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleContinue = useCallback(() => {
    if (isLast) {
      dismiss();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    // Optimistic — onMomentumScrollEnd will confirm/correct once the animation lands.
    setIndex(next);
  }, [index, isLast, dismiss]);

  const handleMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (nextIndex !== index) setIndex(nextIndex);
  }, [index]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={dismiss}
          hitSlop={12}
          style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Passer l'onboarding"
        >
          <Text style={styles.skipLabel}>Passer</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        style={styles.scroll}
      >
        {SLIDES.map((slide) => (
          <View key={slide.key} style={styles.slide}>
            <View style={styles.iconWrap}>
              <Ionicons name={slide.icon} size={96} color={colors.accent} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>

        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Terminer' : 'Continuer'}
        >
          <Text style={styles.continueLabel}>{isLast ? 'Commencer' : 'Continuer'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  skipBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skipLabel: {
    ...type.body,
    color: colors.textSecondary,
  },
  scroll: { flex: 1 },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['3xl'],
  },
  title: {
    ...type.h1,
    color: colors.text,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 24,
  },
  continueBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLabel: {
    ...type.h3,
    color: colors.text,
    fontWeight: '700',
  },
  pressed: { opacity: 0.7 },
});
