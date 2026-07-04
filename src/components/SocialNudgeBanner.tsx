import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { colors, fonts, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';
import { resolveSocialNudge } from '../screens/socialNudgeBanner';
import {
  hasDismissedSocialNudge,
  markSocialNudgeDismissed,
} from '../utils/socialNudgeDismissedFlag';

/**
 * Post-activation social nudge banner (GitHub #81, PRD #77) — a non-blocking
 * invitation to complete the SeededFollow step that #78 pulled out of the
 * blocking `rootGate` flow. Rendered at the top of MapScreen + ListScreen.
 *
 * The banner is a "smart" component: it owns the two AsyncStorage reads
 * (`hasDismissedSocialNudge`, `hasSeededFollowed`) so Map + List don't each
 * have to duplicate the hydration. Visibility is delegated to the pure
 * `resolveSocialNudge` resolver — Map/List pass in `hasAnyLieu` (the only bit
 * they know about that the banner can't cheaply observe).
 *
 * The two flags are re-read on every focus (`useFocusEffect`) so that:
 *   - completing the SeededFollow via another path (Réseau tab, banner tap)
 *     hides the banner as soon as the user swipes back to Map / List;
 *   - a cold-launch after dismiss reads the persisted flag and never re-shows.
 *
 * NOTE: `SEEDED_FOLLOW_STORAGE_KEY` is duplicated from `App.tsx` on purpose —
 * this component reads the same flag App.tsx writes when SeededFollowScreen's
 * `onComplete` fires. Kept as a local constant so slice D doesn't have to
 * touch App.tsx's flag hydration; if the key ever changes both call sites
 * must move together (both are versioned `_v1`).
 */
const SEEDED_FOLLOW_STORAGE_KEY = '@waymark:seeded_follow_done_v1';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  hasAnyLieu: boolean;
}

export default function SocialNudgeBanner({ hasAnyLieu }: Props) {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const [dismissed, setDismissed] = useState(false);
  const [seededFollowed, setSeededFollowed] = useState(false);

  // Refresh both flags whenever the host screen (Map or List) gains focus —
  // that's the cheapest way to notice a SeededFollow completion that happened
  // on another screen without wiring a global subscription.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [nudge, seeded] = await Promise.all([
            hasDismissedSocialNudge(),
            AsyncStorage.getItem(SEEDED_FOLLOW_STORAGE_KEY),
          ]);
          if (cancelled) return;
          setDismissed(nudge);
          setSeededFollowed(seeded === 'true');
        } catch (err) {
          // Fail-closed: hide the banner rather than nag on a broken storage
          // layer. Mirrors `hasDismissedSocialNudge`'s own fail-closed read.
          console.warn('[SocialNudgeBanner] flag refresh failed', err);
          if (!cancelled) {
            setDismissed(true);
            setSeededFollowed(true);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const verdict = resolveSocialNudge({
    hasAnyLieu,
    hasSeededFollowed: seededFollowed,
    hasDismissedSocialNudge: dismissed,
    isAnonymous: Boolean(user?.isAnonymous),
  });

  const openSeededFollow = useCallback(() => {
    nav.navigate('SeededFollow');
  }, [nav]);

  const onDismiss = useCallback(async () => {
    // Optimistically hide first so the tap feels instant; the async write can
    // race in the background. If the write fails, the banner re-shows on next
    // launch — acceptable per PRD ("informational content, low friction").
    setDismissed(true);
    await markSocialNudgeDismissed();
  }, []);

  if (verdict === 'hide') return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={openSeededFollow}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Ajoute des amis pour voir leurs recos"
      >
        <Ionicons name="people-outline" size={20} color={colors.ink} />
        <Text style={styles.text} numberOfLines={2}>
          Ajoute des amis pour voir leurs recos
        </Text>
        <Text style={styles.cta}>Voir</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Masquer le bandeau"
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color={colors.graphite} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-width paper strip with a hair-thin bottom rule — reads as archival
  // chrome, never fighting the map tiles or the numbered list rows.
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hair,
    gap: spacing.md,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
  },
  cta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.32,
    color: colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
