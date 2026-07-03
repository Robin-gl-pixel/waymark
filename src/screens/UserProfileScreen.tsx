import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Animated,
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
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonBlock } from '../components/SkeletonRow';
import { statusBadgeIcon, statusBadgeLabel } from '../lib/statusBadge';

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
  const { user } = useAuth();
  const isMe = user?.uid === uid;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View3>('map');
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load profile + pins + follow state in parallel — all independent reads.
      // Pins read fails gracefully if the owner is private (rules deny) — we
      // still show the header with a note.
      const [p, ls, isFollowing] = await Promise.all([
        getSocialService().getUserByUid(uid),
        getLieuxService()
          .getAllLieux(uid)
          .catch((err) => {
            console.warn('[UserProfile] getAllLieux failed (owner may be private)', err);
            return [] as Lieu[];
          }),
        isMe
          ? Promise.resolve(false)
          : getSocialService()
              .isFollowing(uid)
              .catch((err) => {
                console.warn('[UserProfile] isFollowing failed', err);
                return false;
              }),
      ]);
      setProfile(p);
      setLieux(ls);
      setFollowing(isFollowing);
    } catch (err) {
      console.error('[UserProfile] load failed', err);
      setError('Chargement échoué.');
    } finally {
      setLoading(false);
    }
  }, [uid, isMe]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Optimistic follow toggle. We flip the local state immediately so the
   * button reacts instantly; on error we roll back. The Cloud Function
   * trigger will update `followersCount` a second later — we bump the
   * profile counter locally to mirror that so the header count doesn't lag.
   */
  const toggleFollow = useCallback(async () => {
    if (followBusy || following === null || !profile || isMe) return;
    const wasFollowing = following;
    setFollowBusy(true);
    setFollowing(!wasFollowing);
    setProfile({
      ...profile,
      followersCount: Math.max(0, profile.followersCount + (wasFollowing ? -1 : 1)),
    });
    try {
      if (wasFollowing) {
        await getSocialService().unfollow(uid);
      } else {
        await getSocialService().follow(uid);
      }
    } catch (err) {
      console.error('[UserProfile] follow toggle failed', err);
      // Roll back on failure.
      setFollowing(wasFollowing);
      setProfile((p) =>
        p ? { ...p, followersCount: Math.max(0, p.followersCount + (wasFollowing ? 1 : -1)) } : p,
      );
      Alert.alert('Erreur', 'Action échouée. Réessaie.');
    } finally {
      setFollowBusy(false);
    }
  }, [followBusy, following, profile, uid, isMe]);

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
        <HeaderSkeleton />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorState message={error} onRetry={load} style={{ marginTop: spacing['3xl'] }} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="lock-closed-outline"
          title="Profil introuvable"
          body="Ce compte n'existe plus ou est privé."
          style={{ marginTop: spacing['3xl'] }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ProfileHeader
        profile={profile}
        pinCount={lieux.length}
        showFollowButton={!isMe}
        isFollowing={following}
        followBusy={followBusy}
        onToggleFollow={toggleFollow}
      />
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

function ProfileHeader({
  profile,
  pinCount,
  showFollowButton,
  isFollowing,
  followBusy,
  onToggleFollow,
}: {
  profile: UserProfile;
  pinCount: number;
  showFollowButton: boolean;
  isFollowing: boolean | null;
  followBusy: boolean;
  onToggleFollow: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.avatarRow}>
        <Avatar username={profile.username} size={64} />
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
        {showFollowButton && (
          <FollowButton
            isFollowing={isFollowing}
            busy={followBusy}
            onPress={onToggleFollow}
          />
        )}
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

function FollowButton({
  isFollowing,
  busy,
  onPress,
}: {
  isFollowing: boolean | null;
  busy: boolean;
  onPress: () => void;
}) {
  // While isFollowing is unknown we render a neutral pill so tapping it doesn't
  // guess wrong. Disabled during the load + during optimistic writes.
  const label = isFollowing === null ? '…' : isFollowing ? 'Suivi' : 'Suivre';
  const disabled = busy || isFollowing === null;

  // Subtle press-in shrink to give the pill a physical feel. Native driver so
  // the animation runs off the JS thread — matters on slow first-page loads.
  const scale = useRef(new Animated.Value(1)).current;
  const springIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const springOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={springIn}
        onPressOut={springOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={isFollowing ? 'Se désabonner' : 'Suivre'}
        style={[
          styles.followBtn,
          isFollowing ? styles.followBtnActive : styles.followBtnInactive,
          disabled && { opacity: 0.6 },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={isFollowing ? colors.text : colors.bg} />
        ) : (
          <View style={styles.followBtnContent}>
            {isFollowing ? (
              <Ionicons
                name="checkmark"
                size={14}
                color={colors.text}
                style={{ marginRight: spacing.xs }}
              />
            ) : null}
            <Text
              style={[
                styles.followBtnLabel,
                isFollowing ? styles.followBtnLabelActive : styles.followBtnLabelInactive,
              ]}
            >
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
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
        <View style={styles.emptyOverlay}>
          <EmptyState
            icon="map-outline"
            title="Aucun pin"
            body="Ce profil n'a pas encore ajouté de lieu."
          />
        </View>
      )}
    </View>
  );
}

function ListPane({ lieux, onOpenLieu }: { lieux: Lieu[]; onOpenLieu: (l: Lieu) => void }) {
  if (lieux.length === 0) {
    return (
      <EmptyState
        icon="location-outline"
        title="Aucun pin"
        body="Ce profil n'a pas encore ajouté de lieu."
      />
    );
  }

  return (
    <FlatList
      data={lieux}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        // #42 — friend-facing badge, immediately after the name so the icon
        // sits in the eye-scan lane of the list. Absent when status is null
        // or the pin predates #41 (undefined field on the doc).
        const badge = statusBadgeIcon(item.status);
        const badgeA11y = statusBadgeLabel(item.status);
        return (
          <Pressable
            onPress={() => onOpenLieu(item)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.rowThumb}>
              <Text style={styles.rowEmoji}>{CATEGORY_EMOJI[item.category]}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTitleLine}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                {badge !== null && (
                  <Text
                    style={styles.rowBadge}
                    accessibilityLabel={badgeA11y ?? undefined}
                  >
                    {badge}
                  </Text>
                )}
              </View>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.city}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        );
      }}
    />
  );
}

/** Ghost header — same footprint as ProfileHeader while data loads. */
function HeaderSkeleton() {
  return (
    <View style={styles.header}>
      <View style={styles.avatarRow}>
        <SkeletonBlock width={64} height={64} br={32} />
        <View style={styles.avatarBody}>
          <SkeletonBlock width={140} height={22} />
          <SkeletonBlock width={100} height={14} style={{ marginTop: spacing.sm }} />
        </View>
      </View>
      <View style={[styles.counters, { borderColor: 'transparent' }]}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            <View style={styles.counter}>
              <SkeletonBlock width={32} height={20} />
              <SkeletonBlock width={56} height={11} style={{ marginTop: spacing.xs }} />
            </View>
            {i < 2 ? <View style={styles.counterDivider} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
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
  followBtn: {
    minWidth: 92,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  followBtnInactive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  followBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnLabel: { ...type.caption, fontWeight: '700' },
  followBtnLabelInactive: { color: colors.bg },
  followBtnLabelActive: { color: colors.text },
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
  // #42 — the title line hosts the pin name and (optionally) the friend badge.
  // Row layout so the badge tucks in just after the name; `flex: 1` on the
  // name lets the badge stay pinned to its natural width while the name
  // truncates.
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { ...type.h3, color: colors.text, fontWeight: '600', flexShrink: 1 },
  // Discreet, monochrome badge — colour would fight the category emoji thumb.
  rowBadge: {
    ...type.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  rowMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.75)',
  },
});
