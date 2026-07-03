import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSocialService } from '../services/socialService';
import { colors, radius, spacing, type } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonBlock } from '../components/SkeletonRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_EMOJI: Record<LieuCategory, string> = {
  resto: '🍽️',
  bar: '🍸',
  café: '☕',
  activité: '🎨',
  musée: '🏛️',
  hôtel: '🏨',
  autre: '📍',
};

/**
 * Réseau tab — the retention loop for the V1 social layer.
 *
 * Chronological (no algo) list of pins from users I follow, most-recent first.
 * getFeed() returns page 1; scrolling triggers cursor-based pagination.
 *
 * Each row shows the owner's `@username` so the trust signal is legible at a
 * glance ("Alice recommends the 11e brunch" beats "here's a pin"). We map
 * owner uids to profiles once, then reuse the map to hydrate each row — a
 * follow-set is small enough at V1 scale that a single upfront read is fine.
 */
export default function NetworkFeedScreen() {
  const nav = useNavigation<Nav>();
  const [items, setItems] = useState<Lieu[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOwnerProfiles = useCallback(
    async (lieux: Lieu[], prior: Map<string, UserProfile>) => {
      const svc = getSocialService();
      const missing = Array.from(new Set(lieux.map((l) => l.userId))).filter(
        (uid) => !prior.has(uid),
      );
      if (missing.length === 0) return prior;
      const fetched = await Promise.all(missing.map((uid) => svc.getUserByUid(uid)));
      const next = new Map(prior);
      fetched.forEach((p, i) => {
        if (p) next.set(missing[i], p);
      });
      return next;
    },
    [],
  );

  const loadFirstPage = useCallback(async () => {
    setError(null);
    try {
      const page = await getSocialService().getFeed();
      setItems(page.items);
      setCursor(page.cursor);
      const nextProfiles = await loadOwnerProfiles(page.items, new Map());
      setProfiles(nextProfiles);
    } catch (err) {
      console.error('[NetworkFeed] load failed', err);
      setError('Chargement échoué.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadOwnerProfiles]);

  const loadNextPage = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getSocialService().getFeed(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.cursor);
      setProfiles((prev) => {
        // schedule an async merge — but useState setter runs synchronously,
        // so kick off the fetch outside and merge in a follow-up.
        loadOwnerProfiles(page.items, prev).then(setProfiles).catch((err) => {
          console.warn('[NetworkFeed] profile hydrate failed', err);
        });
        return prev;
      });
    } catch (err) {
      console.warn('[NetworkFeed] pagination failed', err);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, loadOwnerProfiles]);

  // Reload on every focus — cheap at V1 scale (small follow set + capped per-user reads).
  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage]),
  );

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFirstPage();
  };

  const openLieu = (l: Lieu) => {
    nav.navigate('LieuDetail', { lieuId: l.id, ownerUid: l.userId });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Réseau</Text>
          <Text style={styles.subtitle}>
            {loading
              ? '…'
              : items.length === 0
                ? 'Aucun lieu récent chez tes abonnements.'
                : `${items.length} lieu${items.length > 1 ? 'x' : ''} récent${items.length > 1 ? 's' : ''}`}
          </Text>
        </View>
        <Pressable
          style={styles.searchBtn}
          onPress={() => nav.navigate('SearchUsers')}
          accessibilityLabel="Rechercher un utilisateur"
          hitSlop={12}
        >
          <Ionicons name="search" size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {renderHeader()}
        <View style={styles.list}>
          <FeedRowSkeleton />
          <FeedRowSkeleton />
          <FeedRowSkeleton />
          <FeedRowSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {renderHeader()}
        <ErrorState message={error} onRetry={loadFirstPage} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {renderHeader()}

      <FlatList
        data={items}
        keyExtractor={(l) => `${l.userId}:${l.id}`}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        onEndReachedThreshold={0.6}
        onEndReached={loadNextPage}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Ton feed est vide"
            body="Suis un ami ou un compte Waymark Curated pour voir leurs lieux apparaître ici."
            ctaLabel="Trouver un ami"
            onCtaPress={() => nav.navigate('SearchUsers')}
          />
        }
        renderItem={({ item }) => (
          <FeedRow
            lieu={item}
            owner={profiles.get(item.userId) ?? null}
            onPress={() => openLieu(item)}
          />
        )}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

/**
 * Feed row. 60×60 emoji miniature (no cross-user Storage access on V1 —
 * per-user screenshots live under `users/{ownerUid}/screenshots/*` and reading
 * across users would need signed URLs that don't exist yet), then name + city
 * on line 1, `@username · category` on line 2.
 */
function FeedRow({
  lieu,
  owner,
  onPress,
}: {
  lieu: Lieu;
  owner: UserProfile | null;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.thumb}>
        <Text style={styles.thumbEmoji}>{CATEGORY_EMOJI[lieu.category]}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {lieu.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {lieu.city}
        </Text>
        <View style={styles.rowFooter}>
          <Avatar username={owner?.username} size={18} style={{ marginRight: spacing.xs }} />
          <Text style={styles.rowSaver} numberOfLines={1}>
            @{owner?.username ?? '…'}
          </Text>
          <Text style={styles.rowDot}> · </Text>
          <Text style={styles.rowCategory} numberOfLines={1}>
            {lieu.category}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

/** Skeleton with the same footprint as a FeedRow — avoids layout jumps. */
function FeedRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBlock width={60} height={60} br={radius.md} />
      <View style={styles.rowBody}>
        <SkeletonBlock width="70%" height={16} />
        <SkeletonBlock width="40%" height={12} style={{ marginTop: spacing.sm }} />
        <SkeletonBlock width="55%" height={10} style={{ marginTop: spacing.sm }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xs },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1 },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: spacing['2xl'], paddingBottom: spacing['3xl'] },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: { fontSize: 28 },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowTitle: { ...type.h3, color: colors.text, fontWeight: '600' },
  rowMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  rowSaver: { ...type.micro, color: colors.text, fontWeight: '600' },
  rowDot: { ...type.micro, color: colors.textTertiary },
  rowCategory: { ...type.micro, color: colors.textTertiary, textTransform: 'lowercase' },
});
