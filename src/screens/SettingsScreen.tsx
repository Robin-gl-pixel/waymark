import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { getAuthService } from '../services/authService';
import { getLieuxService } from '../services/lieuxService';
import { getOrCreateShortcutToken, regenerateShortcutToken } from '../services/shortcutTokenService';
import { colors, spacing, type, radius } from '../theme';

// Placeholder — will be replaced by the actual iCloud shortcut URL after publishing
// via Shortcuts.app → Share → Copy iCloud Link. Documented in docs/shortcut-setup.md.
const SHORTCUT_ICLOUD_URL = 'https://www.icloud.com/shortcuts/PLACEHOLDER';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    getOrCreateShortcutToken(user.uid)
      .then(setToken)
      .catch(console.error)
      .finally(() => setTokenLoading(false));
  }, [user]);

  const copyToken = async () => {
    if (!token) return;
    await Clipboard.setStringAsync(token);
    Alert.alert('Copié', 'Token copié dans le presse-papier.');
  };

  const regenerate = () => {
    if (!user) return;
    Alert.alert(
      'Régénérer le token ?',
      "Ton ancien Shortcut ne marchera plus. Tu devras le reconfigurer avec le nouveau token.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Régénérer',
          style: 'destructive',
          onPress: async () => {
            setTokenLoading(true);
            try {
              const newToken = await regenerateShortcutToken(user.uid);
              setToken(newToken);
            } finally {
              setTokenLoading(false);
            }
          },
        },
      ],
    );
  };

  const openShortcut = () => {
    Linking.openURL(SHORTCUT_ICLOUD_URL).catch(() => {
      Alert.alert('Info', "Le lien Shortcut n'est pas encore publié. Voir docs/shortcut-setup.md.");
    });
  };

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
      // Confirm to the user before the auth listener kicks them back to AuthScreen.
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

        <Text style={styles.sectionTitle}>Ajout rapide depuis Photos</Text>
        <Text style={styles.sectionBody}>
          Installe le Shortcut iOS pour partager un screenshot depuis Photos ou Instagram directement vers Waymark, sans ouvrir l'app.
        </Text>

        <Pressable
          onPress={openShortcut}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed ? colors.accentDim : colors.accent },
          ]}
        >
          <Text style={styles.primaryLabel}>Installer le Shortcut</Text>
        </Pressable>

        <Text style={styles.cardLabel}>Ton token perso (à coller dans le Shortcut)</Text>
        <View style={styles.tokenBox}>
          {tokenLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.tokenText} numberOfLines={1} ellipsizeMode="middle">
              {token ?? '—'}
            </Text>
          )}
        </View>
        <View style={styles.tokenActions}>
          <Pressable onPress={copyToken} disabled={!token} style={styles.smallBtn}>
            <Text style={styles.smallBtnLabel}>Copier</Text>
          </Pressable>
          <Pressable onPress={regenerate} disabled={!token} style={styles.smallBtnGhost}>
            <Text style={styles.smallBtnGhostLabel}>Régénérer</Text>
          </Pressable>
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
    marginTop: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: { ...type.h3, color: colors.text, fontWeight: '600' },
  sectionTitle: { ...type.h2, color: colors.text, fontWeight: '700', marginTop: spacing.xl },
  sectionBody: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm },
  primaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  tokenBox: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  tokenText: { ...type.caption, color: colors.text, fontFamily: 'Menlo' },
  tokenActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  smallBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnLabel: { ...type.body, color: colors.text },
  smallBtnGhost: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnGhostLabel: { ...type.body, color: colors.textSecondary },
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
