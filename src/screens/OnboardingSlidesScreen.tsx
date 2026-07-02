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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

export default function OnboardingSlidesScreen() {
  const nav = useNavigation<Nav>();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  // Dismiss = go back to whatever pushed us. Callers decide the follow-up
  // (username picker, seeded follow, main app) — this screen is decoupled from
  // the auth flow on purpose. See issue #10 / #17 for the eventual wiring.
  const dismiss = useCallback(() => {
    if (nav.canGoBack()) nav.goBack();
  }, [nav]);

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
