import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSocialService } from '../services/socialService';
import { colors, spacing, type, radius } from '../theme';
import type { UserProfile } from '../types/User';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonRowList } from '../components/SkeletonRow';

export default function BlockedUsersScreen() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blocked = await getSocialService().getBlocked();
      setUsers(blocked);
    } catch (err) {
      console.error(err);
      setError('Impossible de charger la liste.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmUnblock = (user: UserProfile) => {
    Alert.alert(
      'Débloquer @' + user.username + ' ?',
      'Il pourra à nouveau te suivre et voir tes lieux publics.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          onPress: async () => {
            setUnblocking(user.uid);
            try {
              await getSocialService().unblock(user.uid);
              setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
            } catch (err) {
              console.error(err);
              Alert.alert('Erreur', 'Déblocage échoué. Réessaie.');
            } finally {
              setUnblocking(null);
            }
          },
        },
      ],
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>Comptes bloqués</Text>
      <Text style={styles.subtitle}>
        Ils ne peuvent plus voir tes lieux ni te suivre.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {renderHeader()}
        <View style={styles.list}>
          <SkeletonRowList count={4} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {renderHeader()}
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {renderHeader()}

      {users.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Personne de bloqué"
          body="Tu n'as bloqué personne. Les comptes bloqués ne verront plus tes lieux."
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.uid}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar username={item.username} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.username}>@{item.username}</Text>
                {item.displayName ? (
                  <Text style={styles.displayName}>{item.displayName}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => confirmUnblock(item)}
                disabled={unblocking === item.uid}
                style={({ pressed }) => [
                  styles.unblockBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                {unblocking === item.uid ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.unblockLabel}>Débloquer</Text>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing['2xl'], paddingBottom: spacing.lg },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm },
  list: { paddingHorizontal: spacing['2xl'], paddingBottom: spacing['3xl'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  rowText: { flex: 1 },
  username: { ...type.h3, color: colors.text, fontWeight: '600' },
  displayName: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xs },
  unblockBtn: {
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockLabel: { ...type.caption, color: colors.text, fontWeight: '600' },
});
