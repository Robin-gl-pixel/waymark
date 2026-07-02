import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import MapView from 'react-native-map-clustering';
import { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { getSocialService } from '../services/socialService';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'UserProfile'>;
type Rt = RouteProp<RootStackParamList, 'UserProfile'>;

const CATEGORY_EMOJI: Record<LieuCategory, string> = {
  resto: '🍽️',
  bar: '🍸',
  café: '☕',
  activité: '🎨',
  musée: '🏛️',
  hôtel: '🏨',
  autre: '📍',
};

// Fallback region — Paris. Used when the profile has no pins so the map still
// has *something* to show before the empty overlay renders on top.
const FALLBACK_REGION = {
  latitude: 48.8566,
  longitude: 2.3522,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

type View3 = 'map' | 'list';

export default function UserProfileScreen() {
  const nav = useNavigation<Nav>();
  const { uid } = useRoute<Rt>().params;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View3>('map');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load profile + pins in parallel — both are independent Firestore reads.
      // Pins read fails gracefully if the owner is private (rules deny) — we
      // still show the header with a note.
      const [p, ls] = await Promise.all([
        getSocialService().getUserByUid(uid),
        getLieuxService()
          .getAllLieux(uid)
          .catch((err) => {
            console.warn('[UserProfile] getAllLieux failed (owner may be private)', err);
            return [] as Lieu[];
          }),
      ]);
      setProfile(p);
      setLieux(ls);
    } catch (err) {
      console.error('[UserProfile] load failed', err);
      setError('Chargement échoué.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const openMenu = useCallback(() => {
    Alert.alert(
      'Actions',
      undefined,
      [
        { text: 'Signaler', onPress: () => nav.navigate('Report', { targetUid: uid }) },
        { text: 'Bloquer', style: 'destructive', onPress: confirmBlock },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, uid]);

  const confirmBlock = () => {
    Alert.alert(
      'Bloquer cet utilisateur ?',
      'Vous ne verrez plus ses lieux et il ne pourra plus vous suivre.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            try {
              await getSocialService().block(uid);
              nav.goBack();
            } catch (err) {
              console.error(err);
              Alert.alert('Erreur', 'Blocage échoué. Réessaie.');
            }
          },
        },
      ],
    );
  };

  useLayoutEffect(() => {
    nav.setOptions({
      title: profile ? `@${profile.username}` : 'Profil',
      headerRight: () => (
        <Pressable
          onPress={openMenu}
          hitSlop={12}
          accessibilityLabel="Ouvrir le menu d'actions"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [nav, openMenu, profile]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing['3xl'] }} size="large" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Text style={styles.error}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Text style={styles.notFound}>Profil introuvable ou privé.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ProfileHeader profile={profile} pinCount={lieux.length} />
      <ViewToggle view={view} onChange={setView} />
      <View style={styles.bodyContainer}>
        {view === 'map' ? (
          <MapPane lieux={lieux} onOpenLieu={(l) => nav.navigate('LieuDetail', { lieuId: l.id })} />
        ) : (
          <ListPane lieux={lieux} onOpenLieu={(l) => nav.navigate('LieuDetail', { lieuId: l.id })} />
        )}
      </View>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function ProfileHeader({ profile, pinCount }: { profile: UserProfile; pinCount: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>
            {profile.username.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.avatarBody}>
          <Text style={styles.username} numberOfLines={1}>@{profile.username}</Text>
          {profile.displayName ? (
            <Text style={styles.displayName} numberOfLines={1}>{profile.displayName}</Text>
          ) : null}
          {profile.isCurated && (
            <View style={styles.curatedBadge}>
              <Text style={styles.curatedLabel}>Waymark Curated</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.counters}>
        <Counter label="Pins" value={pinCount} />
        <View style={styles.counterDivider} />
        <Counter label="Abonnés" value={profile.followersCount} />
        <View style={styles.counterDivider} />
        <Counter label="Abonnements" value={profile.followingCount} />
      </View>
    </View>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Segmented toggle
// -----------------------------------------------------------------------------

function ViewToggle({ view, onChange }: { view: View3; onChange: (v: View3) => void }) {
  return (
    <View style={styles.toggle}>
      <ToggleButton
        active={view === 'map'}
        onPress={() => onChange('map')}
        icon="map"
        label="Carte"
      />
      <ToggleButton
        active={view === 'list'}
        onPress={() => onChange('list')}
        icon="list"
        label="Liste"
      />
    </View>
  );
}

function ToggleButton({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: 'map' | 'list';
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggleBtn, active && styles.toggleBtnActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? colors.text : colors.textSecondary}
      />
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// -----------------------------------------------------------------------------
// Map / List panes
// -----------------------------------------------------------------------------

function MapPane({ lieux, onOpenLieu }: { lieux: Lieu[]; onOpenLieu: (l: Lieu) => void }) {
  // If we have pins, center on the first one so the map isn't stuck on Paris
  // when the user is scrolling a Lyon profile.
  const initialRegion = lieux[0]
    ? {
        latitude: lieux[0].lat,
        longitude: lieux[0].lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : FALLBACK_REGION;

  return (
    <View style={styles.mapContainer}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        userInterfaceStyle="dark"
        clusterColor={colors.accent}
        clusterTextColor={colors.text}
        radius={40}
        minPoints={3}
      >
        {lieux.map((lieu) => (
          <Marker
            key={lieu.id}
            coordinate={{ latitude: lieu.lat, longitude: lieu.lng }}
            title={lieu.name}
            description={`${CATEGORY_EMOJI[lieu.category]} ${lieu.city}`}
            pinColor="tomato"
            onCalloutPress={() => onOpenLieu(lieu)}
          />
        ))}
      </MapView>

      {lieux.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyTitle}>Aucun pin</Text>
          <Text style={styles.emptyBody}>Ce profil n'a pas encore ajouté de lieu.</Text>
        </View>
      )}
    </View>
  );
}

function ListPane({ lieux, onOpenLieu }: { lieux: Lieu[]; onOpenLieu: (l: Lieu) => void }) {
  if (lieux.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Aucun pin</Text>
        <Text style={styles.emptyBody}>Ce profil n'a pas encore ajouté de lieu.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={lieux}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpenLieu(item)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.rowThumb}>
            <Text style={styles.rowEmoji}>{CATEGORY_EMOJI[item.category]}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.city}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    ...type.h1,
    color: colors.accent,
    fontWeight: '800',
  },
  avatarBody: { flex: 1 },
  username: { ...type.h2, color: colors.text, fontWeight: '700' },
  displayName: { ...type.body, color: colors.textSecondary, marginTop: 2 },
  curatedBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  curatedLabel: {
    ...type.micro,
    color: colors.bg,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  counters: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  counter: { flex: 1, alignItems: 'center' },
  counterDivider: { width: 1, height: 28, backgroundColor: colors.border },
  counterValue: { ...type.h3, color: colors.text, fontWeight: '700' },
  counterLabel: {
    ...type.micro,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggle: {
    flexDirection: 'row',
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  toggleBtnActive: { backgroundColor: colors.accent },
  toggleLabel: { ...type.caption, color: colors.textSecondary, fontWeight: '600' },
  toggleLabelActive: { color: colors.text },
  bodyContainer: { flex: 1 },
  mapContainer: { flex: 1, backgroundColor: colors.bg },
  list: {
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
  rowThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 24 },
  rowBody: { flex: 1 },
  rowTitle: { ...type.h3, color: colors.text, fontWeight: '600' },
  rowMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    backgroundColor: 'rgba(10,10,10,0.7)',
  },
  emptyTitle: { ...type.h3, color: colors.textSecondary, textAlign: 'center' },
  emptyBody: {
    ...type.body,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  error: {
    ...type.body,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
  notFound: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
});
