import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { getAuthService } from '../services/authService';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!user) return;
    // Fetch the current pin count so the dialog matches Apple's guidance to
    // spell out what will be lost.
    let pinCount = 0;
    try {
      pinCount = (await getLieuxService().getAllLieux(user.uid)).length;
    } catch (err) {
      console.warn('[confirmDelete] failed to count lieux, proceeding without count', err);
    }
    const pinsLine =
      pinCount > 0
        ? `Tes ${pinCount} pin${pinCount > 1 ? 's' : ''} seront perdu${pinCount > 1 ? 's' : ''}. `
        : '';
    Alert.alert(
      'Supprimer ton compte ?',
      `${pinsLine}Toutes tes données (lieux, screenshots, compte) seront supprimées définitivement. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer mon compte', style: 'destructive', onPress: performDelete },
      ],
    );
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      await getAuthService().deleteAccount();
      Alert.alert(
        'Compte supprimé',
        'Toutes tes données ont été effacées. À bientôt.',
        [{ text: 'OK', onPress: () => { logout().catch(console.error); } }],
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Suppression échouée. Réessaie.');
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Réglages</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Connecté en tant que</Text>
          <Text style={styles.cardValue}>{user?.displayName ?? user?.email ?? '—'}</Text>
        </View>

        <Text style={styles.sectionTitle}>Ajout depuis Partager</Text>
        <Text style={styles.sectionBody}>
          Depuis Photos, Instagram ou n'importe quelle app, tape Partager et choisis Waymark dans la
          grille — l'extraction se lance automatiquement, aucune configuration.
        </Text>

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    minHeight: '100%',
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    ...type.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: { ...type.h3, color: colors.text, fontWeight: '600' },
  sectionTitle: { ...type.h2, color: colors.text, fontWeight: '700', marginTop: spacing.xl },
  sectionBody: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm },
  logoutBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing['3xl'],
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
