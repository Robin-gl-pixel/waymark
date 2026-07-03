import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import BadgeText from '../components/BadgeText';
import CategoryPin from '../components/CategoryPin';
import { getLieuxService } from '../services/lieuxService';
import { colors, fonts, spacing, type } from '../theme';
import type { Lieu } from '../types/Lieu';
import type { RootStackParamList } from '../navigation';
import {
  buildMetaPrefix,
  formatEntryNumber,
  matchesQuery,
  resolvePinStatus,
} from './listScreenHelpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * "Ta collection" — the numbered atlas view. Every save is one entry
 * `Nº 0XX` in reverse-chronological order, with a mono meta line ending
 * on an inline `<BadgeText />` when the pin has been tagged wishlist or
 * visited. Design refonte 4/6 (issue #48) — the row template comes from
 * `docs/design/waymark-v8.html` phone 03 · Liste.
 *
 * Motion: the header count animates a rolling transition (~450ms, single
 * fire) whenever the total grows while this screen stays mounted. Respects
 * `AccessibilityInfo.isReduceMotionEnabled()`.
 */
export default function ListScreen() {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  // Pre-tag each pin with its unfiltered `Nº` so search-filter doesn't
  // renumber the visible rows. `Nº 048` must stay tied to the same pin
  // whether or not the list is filtered — it's a stable atlas index.
  const annotated = useMemo(
    () => lieux.map((lieu, i) => ({ lieu, entryNumber: formatEntryNumber(i, lieux.length) })),
    [lieux],
  );
  const visible = useMemo(
    () =>
      trimmedQuery
        ? annotated.filter(({ lieu }) => matchesQuery(lieu, trimmedQuery))
        : annotated,
    [annotated, trimmedQuery],
  );

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduceMotion(v);
      })
      .catch(() => {
        /* fall back to reduce-motion off — animation is short and low-cost */
      });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (v) => mounted && setReduceMotion(v),
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await getLieuxService().getAllLieux(user.uid);
      setLieux(list);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Chargement raté.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Ta collection</Text>
        <View style={styles.titleRow}>
          <CountRoll count={lieux.length} reduceMotion={reduceMotion} />
          <Text style={styles.titleWord}> entrées</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher un lieu"
          placeholderTextColor={colors.graphite}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Chercher un lieu"
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.lieu.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ink}
          />
        }
        ListEmptyComponent={
          loading ? null : trimmedQuery ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aucun résultat</Text>
              <Text style={styles.emptyBody}>
                {`Aucun résultat pour "${trimmedQuery}"`}
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Rien encore</Text>
              <Text style={styles.emptyBody}>
                Balance ton premier screenshot Insta — ça atterrit ici en Nº 001.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <LieuRow
            lieu={item.lieu}
            entryNumber={item.entryNumber}
            onPress={() => nav.navigate('LieuDetail', { lieuId: item.lieu.id })}
          />
        )}
      />
    </SafeAreaView>
  );
}

/**
 * Rolling counter for the header title. On mount and whenever the count
 * shrinks (delete, initial load) it snaps; on an increase it slides the
 * previous number up out of frame while the new one slides in from below,
 * over ~450ms. Skipped entirely when reduce-motion is on.
 *
 * The two Text nodes stay mounted the whole time — animating a translateY
 * on a single Animated.View keeps this cheap and native-driver-friendly.
 */
function CountRoll({
  count,
  reduceMotion,
}: {
  count: number;
  reduceMotion: boolean;
}) {
  const [displayed, setDisplayed] = useState(count);
  const [previous, setPrevious] = useState(count);
  const translateY = useRef(new Animated.Value(0)).current;
  const lineHeight = titleStyle.lineHeight;

  useEffect(() => {
    if (count === displayed) return;
    if (reduceMotion || count < displayed) {
      // No animation — snap. Also snap on decrement (delete) so we never
      // roll backwards.
      setPrevious(count);
      setDisplayed(count);
      translateY.setValue(0);
      return;
    }
    // The stack renders <previous> on top, <count> below. Slide it up by
    // one line-height so <count> lands in the visible window.
    setPrevious(displayed);
    translateY.setValue(0);
    Animated.timing(translateY, {
      toValue: -lineHeight,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setDisplayed(count);
      setPrevious(count);
      translateY.setValue(0);
    });
  }, [count, displayed, reduceMotion, translateY, lineHeight]);

  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Text style={styles.titleNum}>{previous}</Text>
        <Text style={styles.titleNum}>{count}</Text>
      </Animated.View>
    </View>
  );
}

function LieuRow({
  lieu,
  entryNumber,
  onPress,
}: {
  lieu: Lieu;
  entryNumber: string;
  onPress: () => void;
}) {
  const status = resolvePinStatus(lieu);
  const metaPrefix = buildMetaPrefix(lieu, status !== null);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Entrée ${entryNumber}, ${lieu.name}`}
    >
      <Text style={styles.rowNum}>{entryNumber}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {lieu.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {metaPrefix}
          <BadgeText status={status} />
        </Text>
      </View>
      <View style={styles.rowDot}>
        <CategoryPin category={lieu.category} size={10} />
      </View>
    </Pressable>
  );
}

const titleStyle = {
  fontSize: 34,
  lineHeight: 34,
  letterSpacing: -1,
} as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.graphite,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xs,
  },
  titleNum: {
    fontFamily: fonts.display,
    fontWeight: '900',
    color: colors.ink,
    textTransform: 'uppercase',
    ...titleStyle,
  },
  titleWord: {
    fontFamily: fonts.display,
    fontWeight: '900',
    color: colors.ink,
    textTransform: 'uppercase',
    ...titleStyle,
  },
  searchWrap: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  searchInput: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hair,
    backgroundColor: colors.paper,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hair,
    gap: spacing.md,
  },
  rowPressed: { opacity: 0.55 },
  rowNum: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.88, // ~0.08em at 11px
    color: colors.graphite,
    width: 52,
  },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowName: {
    fontFamily: fonts.display,
    fontWeight: '900',
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.0, // ~0.1em at 10px
    textTransform: 'uppercase',
    color: colors.graphite,
    marginTop: 5,
  },
  rowDot: { width: 12, alignItems: 'flex-end' },
  empty: { alignItems: 'center', paddingTop: spacing['3xl'] },
  emptyTitle: {
    fontFamily: fonts.display,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  emptyBody: {
    ...type.body,
    color: colors.graphite,
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  error: {
    ...type.caption,
    color: colors.catResto,
    textAlign: 'center',
    margin: spacing.md,
  },
});
