import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../auth/firebase';
import { getSocialService } from '../services/socialService';
import { colors, radius, spacing, type } from '../theme';
import type { UserProfile } from '../types/User';
import type { Timestamp } from '../types/Lieu';

/**
 * Post-signup seeded follow (GitHub #17).
 *
 * Shown once, right after `PickUsernameScreen`, to bootstrap a fresh account's
 * feed with the 3-4 official Waymark Curated accounts (`isCurated == true`).
 * Switches default ON — "Continuer" batch-follows the ones still ON; the top
 * "Passer" button skips without following anything. Either exit path calls
 * `onComplete`, which the Root() gate turns into an AsyncStorage flag so the
 * screen never re-appears.
 *
 * We query `users` directly rather than adding a method to `SocialService`
 * because this is the only surface that reads a `isCurated`-filtered list — a
 * dedicated service method would be premature (and this PR is scoped not to
 * touch the service layer). The query uses an in-list `isPublic == true`
 * filter to satisfy the rules engine (see firestore.rules `/users/{uid}` rule)
 * and sorts client-side to avoid needing a new composite index.
 *
 * Failure posture: on load error / empty result / follow failure, the user is
 * NEVER blocked from continuing to the app — the whole flow is a nice-to-have
 * and must degrade gracefully (see PRD "Cold start").
 */

const CURATED_LIMIT = 10;
const DEFAULT_ON = true;

interface Props {
  onComplete: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; users: UserProfile[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export default function SeededFollowScreen({ onComplete }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Rules require `isPublic == true` at query-level (see firestore.rules
        // `/users/{userId}` read rule). Sort client-side by createdAt asc — the
        // list is tiny (~4 items) so this is negligible, and it lets us skip a
        // composite index that includes both `isCurated` and `isPublic`.
        const q = query(
          collection(db, 'users'),
          where('isCurated', '==', true),
          where('isPublic', '==', true),
          limit(CURATED_LIMIT),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const users = snap.docs
          .map((d) => hydrateUser(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        if (users.length === 0) {
          setState({ kind: 'empty' });
          return;
        }
        const initial: Record<string, boolean> = {};
        users.forEach((u) => { initial[u.uid] = DEFAULT_ON; });
        setSelected(initial);
        setState({ kind: 'ready', users });
      } catch (err) {
        if (cancelled) return;
        console.warn('[SeededFollow] load curated failed', err);
        setState({ kind: 'error', message: 'Impossible de charger les comptes. Tu peux passer.' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const skip = useCallback(() => {
    if (submitting) return;
    onComplete();
  }, [onComplete, submitting]);

  const proceed = useCallback(async () => {
    if (submitting) return;
    if (state.kind !== 'ready') {
      // Empty / error states: just move on. Rules for empty state per task —
      // "user should be able to reach the app either way".
      onComplete();
      return;
    }
    setSubmitting(true);
    const svc = getSocialService();
    const toFollow = state.users.filter((u) => selected[u.uid]);
    // Parallel follow — a single failure is logged but doesn't block the flow.
    // The user will still land on Main; they can manually follow later.
    await Promise.all(
      toFollow.map(async (u) => {
        try {
          await svc.follow(u.uid);
        } catch (err) {
          console.warn('[SeededFollow] follow failed for', u.uid, err);
        }
      }),
    );
    onComplete();
  }, [onComplete, selected, state, submitting]);

  const toggle = useCallback((uid: string, next: boolean) => {
    setSelected((prev) => ({ ...prev, [uid]: next }));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={skip}
          hitSlop={12}
          style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Passer"
          disabled={submitting}
        >
          <Text style={styles.skipLabel}>Passer</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Suis Waymark Curated</Text>
        <Text style={styles.subtitle}>
          Nos comptes officiels : des lieux parisiens choisis, un par un.
          Tu peux te désabonner à tout moment.
        </Text>

        {state.kind === 'loading' && (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {state.kind === 'error' && (
          <View style={styles.centerBlock}>
            <Text style={styles.errorText}>{state.message}</Text>
          </View>
        )}

        {state.kind === 'empty' && (
          <View style={styles.centerBlock}>
            <Text style={styles.emptyTitle}>Bientôt.</Text>
            <Text style={styles.emptyBody}>
              Nos comptes curated arrivent. En attendant, va faire un tour sur
              la carte.
            </Text>
          </View>
        )}

        {state.kind === 'ready' && (
          <View style={styles.list}>
            {state.users.map((user) => (
              <UserRow
                key={user.uid}
                user={user}
                on={!!selected[user.uid]}
                onToggle={(v) => toggle(user.uid, v)}
                disabled={submitting}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={proceed}
          disabled={submitting}
          style={({ pressed }) => [
            styles.cta,
            submitting && styles.ctaDisabled,
            pressed && !submitting && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Continuer"
        >
          {submitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.ctaLabel}>Continuer</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

interface RowProps {
  user: UserProfile;
  on: boolean;
  onToggle: (next: boolean) => void;
  disabled: boolean;
}

function UserRow({ user, on, onToggle, disabled }: RowProps) {
  const meta = user.bio ?? user.displayName ?? null;
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>
          {user.username.charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          @{user.username}
        </Text>
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Switch
        value={on}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.bgElevated }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.bgElevated}
      />
    </View>
  );
}

/**
 * Mirror of `FirebaseSocialService.hydrateUser` — we can't import that private
 * method, so this small duplicate stays local. Keep the two in sync if the
 * `UserProfile` shape changes.
 */
function hydrateUser(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid: (data.uid as string) ?? uid,
    username: (data.username as string) ?? '',
    displayName: (data.displayName as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    isPublic: (data.isPublic as boolean | undefined) ?? true,
    isCurated: (data.isCurated as boolean | undefined) ?? false,
    followersCount: (data.followersCount as number | undefined) ?? 0,
    followingCount: (data.followingCount as number | undefined) ?? 0,
    avatarUrl: (data.avatarUrl as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    usernameChangedAt: (data.usernameChangedAt as Timestamp | null) ?? null,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

/**
 * Defensive `Timestamp.toMillis()` — handles the (unlikely) case that
 * `createdAt` was missed on a legacy doc. Falls back to 0 so the row sorts
 * oldest-first without crashing.
 */
function toMs(ts: Timestamp | null | undefined): number {
  if (!ts || typeof ts.toMillis !== 'function') return 0;
  try { return ts.toMillis(); } catch { return 0; }
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
  body: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  title: {
    ...type.h1,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
  centerBlock: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...type.h3,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  errorText: {
    ...type.body,
    color: colors.error,
    textAlign: 'center',
  },
  list: {
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    ...type.h3,
    color: colors.accent,
    fontWeight: '700',
  },
  rowBody: { flex: 1 },
  rowTitle: { ...type.h3, color: colors.text, fontWeight: '600' },
  rowMeta: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.bgElevated },
  ctaLabel: { ...type.h3, color: colors.bg, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
