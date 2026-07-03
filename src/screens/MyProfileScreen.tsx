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
import { getLieuxService } from '../services/lieuxService';
import type { Activity, UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';
import { colors, radius, spacing, type } from '../theme';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonBlock, SkeletonRow } from '../components/SkeletonRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * MyProfileScreen — the "self" view.
 *
 * The card at the top pins my public identity (username, avatar letter, follower
 * counts). Below it sits the Activity section: a chronological list of "@x t'a
 * suivi" / "@x a sauvé <lieu>" rows written by the Cloud Function triggers
 * (`followTriggers.ts`, `saveAttribution.ts`).
 *
 * Opening this screen batch-clears unread markers so the Profile tab's badge
 * drops to 0 immediately. We do this fire-and-forget (no await on the UI
 * render) — the badge is derived from a live server count re-fetched on tab
 * focus, so eventual consistency is fine.
 */
export default function MyProfileScreen() {
  const nav = useNavigation<Nav>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lieuNames, setLieuNames] = useState<Map<string, string>>(new Map());

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const me = await getSocialService().getMyProfile();
      setProfile(me);
    } catch (err) {
      console.warn('[MyProfile] load profile failed', err);
      setProfileError('Impossible de charger ton profil.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const hydrateLieuNames = useCallback(
    async (items: Activity[], myUid: string, prior: Map<string, string>) => {
      const svc = getLieuxService();
      const missing = Array.from(
        new Set(
          items
            .map((a) => a.targetLieuId)
            .filter((id): id is string => typeof id === 'string' && !prior.has(id)),
        ),
      );
      if (missing.length === 0) return prior;
      const fetched = await Promise.all(
        missing.map((id) => svc.getLieuById(myUid, id).catch(() => null)),
      );
      const next = new Map(prior);
      fetched.forEach((l, i) => {
        if (l) next.set(missing[i], l.name);
      });
      return next;
    },
    [],
  );

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const page = await getSocialService().getActivity();
      setActivities(page.items);
      setActivityCursor(page.cursor);

      // Fire-and-forget: mark all currently-loaded unread rows as read so the
      // tab badge drops now (eventual — the count re-reads on next focus).
      const svc = getSocialService();
      const unreadIds = page.items.filter((a) => !a.read).map((a) => a.id);
      if (unreadIds.length > 0) {
        Promise.all(
          unreadIds.map((id) =>
            svc.markActivityRead(id).catch((err) => {
              console.warn('[MyProfile] markActivityRead failed', id, err);
            }),
          ),
        ).catch(() => {
          /* swallow — individual errors already logged */
        });
      }

      // Hydrate lieu names for `save` rows so we can render "a sauvé <name>".
      const me = await getSocialService().getMyProfile();
      if (me) {
        const names = await hydrateLieuNames(page.items, me.uid, lieuNames);
        setLieuNames(names);
      }
    } catch (err) {
      console.warn('[MyProfile] load activity failed', err);
    } finally {
      setActivityLoading(false);
      setRefreshing(false);
    }
  }, [hydrateLieuNames, lieuNames]);

  const loadMoreActivity = useCallback(async () => {
    if (!activityCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getSocialService().getActivity(activityCursor);
      setActivities((prev) => [...prev, ...page.items]);
      setActivityCursor(page.cursor);

      // Same fire-and-forget as loadActivity — anything loaded is considered
      // "shown to the user" and clears the badge.
      const svc = getSocialService();
      const unreadIds = page.items.filter((a) => !a.read).map((a) => a.id);
      if (unreadIds.length > 0) {
        Promise.all(unreadIds.map((id) => svc.markActivityRead(id).catch(() => null))).catch(
          () => null,
        );
      }

      const me = await getSocialService().getMyProfile();
      if (me) {
        const names = await hydrateLieuNames(page.items, me.uid, lieuNames);
        setLieuNames(names);
      }
    } catch (err) {
      console.warn('[MyProfile] load more activity failed', err);
    } finally {
      setLoadingMore(false);
    }
  }, [activityCursor, loadingMore, hydrateLieuNames, lieuNames]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Re-load activity on every focus so the Profile tab always shows fresh data
  // (and clears the badge as soon as the user opens the tab).
  useFocusEffect(
    useCallback(() => {
      loadActivity();
      // We intentionally do NOT include `loadActivity` in the dep array — its
      // identity churns whenever `lieuNames` mutates, which would cause a
      // reload loop. Focus-time invocation is enough.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadActivity();
  };

  const openActivity = (a: Activity) => {
    if (a.type === 'follow') {
      nav.navigate('UserProfile', { uid: a.actorUid });
    } else if (a.type === 'save' && a.targetLieuId) {
      nav.navigate('LieuDetail', { lieuId: a.targetLieuId });
    }
  };

  const renderHeader = () => (
    <View>
      {profileLoading ? (
        <ProfileCardSkeleton />
      ) : profileError ? (
        <ErrorState message={profileError} onRetry={loadProfile} />
      ) : profile ? (
        <ProfileCard profile={profile} />
      ) : (
        <Text style={styles.error}>Profil introuvable.</Text>
      )}

      <Text style={styles.sectionTitle}>Activité</Text>
      {activityLoading && activities.length === 0 ? (
        <View>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={activities}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          activityLoading || profileLoading ? null : (
            <EmptyState
              icon="notifications-outline"
              title="Aucune activité"
              body="Quand quelqu'un te suivra ou sauvera un de tes pins, tu le verras ici."
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        onEndReachedThreshold={0.6}
        onEndReached={loadMoreActivity}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
        renderItem={({ item }) => (
          <ActivityRow
            activity={item}
            lieuName={item.targetLieuId ? lieuNames.get(item.targetLieuId) ?? null : null}
            onPress={() => openActivity(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <View style={styles.card}>
      <Avatar username={profile.username} size={96} style={{ marginBottom: spacing.lg }} />
      <Text style={styles.username}>@{profile.username}</Text>
      {profile.displayName ? (
        <Text style={styles.displayName}>{profile.displayName}</Text>
      ) : null}

      <View style={styles.counters}>
        <Counter label="Abonnés" value={profile.followersCount} />
        <View style={styles.counterDivider} />
        <Counter label="Abonnements" value={profile.followingCount} />
      </View>
    </View>
  );
}

/** Ghost version of ProfileCard — same footprint, no data. */
function ProfileCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock width={96} height={96} br={48} style={{ marginBottom: spacing.lg }} />
      <SkeletonBlock width={160} height={22} />
      <SkeletonBlock width={120} height={14} style={{ marginTop: spacing.sm }} />
      <View style={[styles.counters, { minHeight: 72, borderColor: 'transparent' }]}>
        <View style={styles.counter}>
          <SkeletonBlock width={40} height={22} />
          <SkeletonBlock width={64} height={11} style={{ marginTop: spacing.xs }} />
        </View>
        <View style={styles.counterDivider} />
        <View style={styles.counter}>
          <SkeletonBlock width={40} height={22} />
          <SkeletonBlock width={64} height={11} style={{ marginTop: spacing.xs }} />
        </View>
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

function ActivityRow({
  activity,
  lieuName,
  onPress,
}: {
  activity: Activity;
  lieuName: string | null;
  onPress: () => void;
}) {
  const iconName = activity.type === 'follow' ? 'person-add' : 'bookmark';
  const label =
    activity.type === 'follow'
      ? `@${activity.actorUsername || '?'} t'a suivi`
      : `@${activity.actorUsername || '?'} a sauvé ${
          lieuName ?? (activity.targetLieuId ? 'un de tes lieux' : '…')
        }`;
  const relative = formatRelativeTime(activity.createdAt?.toDate?.() ?? new Date());

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.unreadWrap}>
        {!activity.read ? <View style={styles.unreadDot} /> : null}
      </View>
      <View style={styles.avatarStack}>
        <Avatar username={activity.actorUsername} size={40} />
        <View style={styles.activityIconBadge}>
          <Ionicons name={iconName} size={11} color={colors.text} />
        </View>
      </View>
      <View style={styles.activityBody}>
        <Text style={styles.activityText} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.activityTime}>{relative}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

/**
 * Simple relative-time helper, French. Kept local (no new dep) — the PRD's
 * needs (seconds → minutes → hours → days → weeks) fit in a couple of ifs.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `il y a ${day} j`;
  const week = Math.round(day / 7);
  if (week < 5) return `il y a ${week} sem`;
  // Fall back to a locale-aware date once we're past a month — the PRD only
  // needs coarse recency signal, not exact old-timestamp formatting.
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  card: {
    alignItems: 'center',
    paddingBottom: spacing['2xl'],
  },
  username: {
    ...type.h1,
    color: colors.text,
    fontWeight: '700',
  },
  displayName: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  counters: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  counter: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  counterDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  counterValue: {
    ...type.h2,
    color: colors.text,
    fontWeight: '700',
  },
  counterLabel: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    ...type.h2,
    color: colors.text,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unreadWrap: {
    width: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  avatarStack: {
    width: 40,
    height: 40,
    position: 'relative',
  },
  activityIconBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: { flex: 1 },
  activityText: {
    ...type.body,
    color: colors.text,
    fontWeight: '500',
  },
  activityTime: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  error: {
    ...type.body,
    color: colors.error,
    textAlign: 'center',
  },
});
