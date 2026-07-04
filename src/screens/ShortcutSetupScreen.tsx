import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { getSocialService } from '../services/socialService';
import { colors, radius, spacing, type } from '../theme';

/**
 * Public URL of the pre-configured iCloud Shortcut. Publishing the Shortcut on
 * iCloud is a one-off manual step by Robin (see `NEXT-STEPS.md`) — once done,
 * replace this placeholder with the actual `https://www.icloud.com/shortcuts/…`
 * URL. Until then, the "Installer le Shortcut" button surfaces the placeholder
 * as an Alert so users know we're not silently opening a broken link.
 */
const ICLOUD_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/waymark-add-lieu';

/**
 * Settings screen for the iOS Shortcut integration (#7).
 *
 * On mount, calls `getOrCreateShortcutToken()` — the seam mints the token on
 * first visit and returns the existing value on every subsequent load, so the
 * screen renders a stable "copy me" value across sessions.
 *
 * Layout mirrors the v8 « atlas numéroté » spec used by EditUsernameScreen:
 * mono eyebrow, display h1, serifItalic body, hair-thin dividers.
 */
export default function ShortcutSetupScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getSocialService().getOrCreateShortcutToken();
        if (!cancelled) setToken(t);
      } catch (err) {
        console.warn('[ShortcutSetup] token load failed', err);
        if (!cancelled) setError('Impossible de charger le token. Vérifie ta connexion.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyToken = async () => {
    if (!token) return;
    try {
      await Clipboard.setStringAsync(token);
      Alert.alert('Copié', 'Colle le token dans le Shortcut, à la ligne "Authorization".');
    } catch (err) {
      console.warn('[ShortcutSetup] clipboard write failed', err);
      Alert.alert('Aïe', 'Copie foirée. Réessaie.');
    }
  };

  const openShortcut = async () => {
    try {
      const supported = await Linking.canOpenURL(ICLOUD_SHORTCUT_URL);
      if (!supported) {
        Alert.alert(
          'iCloud indisponible',
          'On ne peut pas ouvrir le Shortcut depuis cet appareil. Ouvre-le depuis ton iPhone.',
        );
        return;
      }
      await Linking.openURL(ICLOUD_SHORTCUT_URL);
    } catch (err) {
      console.warn('[ShortcutSetup] openURL failed', err);
      Alert.alert('Aïe', "Impossible d'ouvrir le Shortcut.");
    }
  };

  const regenerate = () => {
    Alert.alert(
      'Régénérer le token ?',
      "L'ancien token cesse de fonctionner. Tu devras coller le nouveau dans ton Shortcut installé.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Régénérer',
          style: 'destructive',
          onPress: async () => {
            setRegenerating(true);
            try {
              const t = await getSocialService().regenerateShortcutToken();
              setToken(t);
              Alert.alert('Nouveau token', 'Colle-le dans ton Shortcut existant pour le réactiver.');
            } catch (err) {
              console.warn('[ShortcutSetup] regenerate failed', err);
              Alert.alert('Aïe', 'Régénération foirée. Réessaie.');
            } finally {
              setRegenerating(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Nº 07 · Shortcut iOS</Text>
        <Text style={styles.title}>Ajouter un lieu sans ouvrir l'app</Text>
        <Text style={styles.lede}>
          Depuis Photos ou Instagram, tape Partager → "Add to Amble" → une notification t'annonce
          l'ajout. Le Shortcut envoie l.image à Amble avec ton token secret.
        </Text>

        <Text style={styles.sectionEyebrow}>Étape 01 · Ton token</Text>
        <Text style={styles.sectionBody}>
          C'est ton mot de passe personnel pour le Shortcut. Copie-le puis colle-le à la ligne
          "Authorization" du Shortcut. Ne le partage avec personne.
        </Text>

        {loading ? (
          <View style={styles.tokenCard}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : error ? (
          <View style={styles.tokenCard}>
            <Text style={styles.errorLabel}>{error}</Text>
          </View>
        ) : (
          <View style={styles.tokenCard}>
            <Text style={styles.tokenLabel}>Token</Text>
            <Text style={styles.tokenValue} selectable>
              {token}
            </Text>
            <Pressable
              onPress={copyToken}
              style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Copier le token"
            >
              <Text style={styles.copyLabel}>Copier</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionEyebrow}>Étape 02 · Installer</Text>
        <Text style={styles.sectionBody}>
          Ouvre le Shortcut iCloud pré-configuré : il gère l'encodage, l'auth, la notification.
        </Text>
        <Pressable
          onPress={openShortcut}
          style={({ pressed }) => [styles.installBtn, pressed && styles.pressed]}
        >
          <Text style={styles.installLabel}>Installer le Shortcut</Text>
        </Pressable>

        <Text style={styles.sectionEyebrow}>Étape 03 · Utiliser</Text>
        <Text style={styles.sectionBody}>
          Dans Photos (ou Insta), tape Partager, choisis "Add to Amble". Le lieu apparaît dans ta
          liste à la prochaine ouverture.
        </Text>

        <View style={styles.divider} />

        <Pressable
          onPress={regenerate}
          disabled={regenerating || loading || !token}
          style={({ pressed }) => [styles.regenBtn, pressed && styles.pressed]}
        >
          {regenerating ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={styles.regenLabel}>Régénérer le token</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  eyebrow: { ...type.monoSm, color: colors.graphite, marginBottom: spacing.sm },
  title: { ...type.h1, color: colors.ink, marginBottom: spacing.md },
  lede: { ...type.serif, color: colors.graphite, marginBottom: spacing['2xl'] },
  sectionEyebrow: {
    ...type.monoSm,
    color: colors.graphite,
    marginTop: spacing['2xl'],
    marginBottom: spacing.sm,
  },
  sectionBody: { ...type.serif, color: colors.graphite, marginTop: spacing.xs },
  tokenCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  tokenLabel: {
    ...type.monoSm,
    color: colors.graphite,
    marginBottom: spacing.xs,
  },
  tokenValue: {
    ...type.mono,
    // Tighten letter-spacing back down — 2.4em on a 64-char hex blob wraps
    // uselessly. This is the one place we opt out of the mono spec's default.
    letterSpacing: 0.5,
    fontSize: 13,
    color: colors.ink,
    textTransform: 'none',
    marginBottom: spacing.md,
  },
  copyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
  },
  copyLabel: { ...type.mono, color: colors.paper, fontWeight: '700' },
  installBtn: {
    marginTop: spacing.lg,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.catResto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installLabel: { ...type.mono, color: colors.paper, fontWeight: '700' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hair,
    marginVertical: spacing['2xl'],
  },
  regenBtn: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regenLabel: { ...type.mono, color: colors.error, fontWeight: '700' },
  errorLabel: { ...type.serif, color: colors.error },
  pressed: { opacity: 0.7 },
});
