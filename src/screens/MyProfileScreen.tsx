import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSocialService } from '../services/socialService';
import type { UserProfile } from '../types/User';
import { colors, radius, spacing, type } from '../theme';

export default function MyProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await getSocialService().getMyProfile();
      setProfile(me);
    } catch (err) {
      console.warn('[MyProfile] load failed', err);
      setError('Impossible de charger ton profil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : profile ? (
          <ProfileCard profile={profile} />
        ) : (
          <Text style={styles.error}>Profil introuvable.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>
          {profile.username.charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
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

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
  },
  card: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarLetter: {
    ...type.display,
    color: colors.accent,
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
  error: {
    ...type.body,
    color: colors.error,
    textAlign: 'center',
  },
});
