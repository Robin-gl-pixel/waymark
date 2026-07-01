import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, type, radius } from '../theme';

const FUNCTIONS_REGION = 'europe-west1';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer ton compte ?',
      'Toutes tes données (lieux, screenshots, compte) seront supprimées définitivement. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer mon compte',
          style: 'destructive',
          onPress: performDelete,
        },
      ],
    );
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      const functions = getFunctions(undefined, FUNCTIONS_REGION);
      const deleteAccount = httpsCallable(functions, 'deleteAccount');
      await deleteAccount({});
      // Server has revoked + deleted the Auth user; onAuthStateChanged will fire and route back to AuthScreen.
      await logout();
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Suppression échouée. Réessaie.');
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.title}>Réglages</Text>

        <View style={styles.userCard}>
          <Text style={styles.userLabel}>Connecté en tant que</Text>
          <Text style={styles.userName}>{user?.displayName ?? user?.email ?? '—'}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutLabel}>Se déconnecter</Text>
        </Pressable>

        <Pressable onPress={confirmDelete} disabled={deleting} style={styles.deleteBtn}>
          {deleting ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={styles.deleteLabel}>Supprimer mon compte</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  userCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userLabel: { ...type.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  userName: { ...type.h3, color: colors.text, fontWeight: '600' },
  logoutBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoutLabel: { ...type.h3, color: colors.text },
  deleteBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: { ...type.h3, color: colors.error, fontWeight: '600' },
});
