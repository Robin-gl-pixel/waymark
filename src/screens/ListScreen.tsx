import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { RootStackParamList } from '../navigation';

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

export default function ListScreen() {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await getLieuxService().getAllLieux(user.uid);
      setLieux(list);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Chargement échoué.');
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing['3xl'] }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes lieux</Text>
        <Text style={styles.count}>{lieux.length} pin{lieux.length > 1 ? 's' : ''}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={lieux}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aucun lieu pour l'instant</Text>
            <Text style={styles.emptyBody}>Ajoute ton premier screenshot Insta.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <LieuRow lieu={item} onPress={() => nav.navigate('LieuDetail', { lieuId: item.id })} />
        )}
      />
    </SafeAreaView>
  );
}

function LieuRow({ lieu, onPress }: { lieu: Lieu; onPress: () => void }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  // Hero = `photos[0].storagePath` (#35, parent PRD #34). Legacy pins are
  // transparently normalised on read via the seam's synthesis path; the
  // `sourceInstagram.screenshotStoragePath` fallback is defensive belt-and-
  // braces in case the gallery ends up empty for a doc the hydrator missed.
  // If nothing resolves, the category-emoji placeholder renders.
  const heroPath =
    lieu.photos?.[0]?.storagePath || lieu.sourceInstagram.screenshotStoragePath || '';

  useEffect(() => {
    if (!heroPath) {
      setThumbUri(null);
      return;
    }
    getLieuxService()
      .getScreenshotUrl(heroPath)
      .then(setThumbUri)
      .catch(() => setThumbUri(null));
  }, [heroPath]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.thumb}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumbImg} />
        ) : (
          <Text style={styles.thumbFallback}>{CATEGORY_EMOJI[lieu.category]}</Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {CATEGORY_EMOJI[lieu.category]} {lieu.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{lieu.city}</Text>
        {lieu.sourceInstagram.author && (
          <Text style={styles.rowAuthor} numberOfLines={1}>Reco @{lieu.sourceInstagram.author}</Text>
        )}
      </View>
    </Pressable>
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
  count: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xs },
  list: { paddingHorizontal: spacing['2xl'], paddingBottom: spacing['3xl'] },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbFallback: { fontSize: 28 },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowTitle: { ...type.h3, color: colors.text, fontWeight: '600' },
  rowMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  rowAuthor: { ...type.micro, color: colors.textTertiary, marginTop: 2, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: spacing['4xl'] },
  emptyTitle: { ...type.h3, color: colors.textSecondary },
  emptyBody: { ...type.body, color: colors.textTertiary, marginTop: spacing.sm },
  error: { ...type.caption, color: colors.error, textAlign: 'center', margin: spacing.md },
});
