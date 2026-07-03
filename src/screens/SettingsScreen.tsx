import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView, Share, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { getAuthService } from '../services/authService';
import { getLieuxService } from '../services/lieuxService';
import { getSocialService } from '../services/socialService';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// TODO(Robin): replace with real App Store URL post-submit.
const WAYMARK_APP_STORE_URL = 'https://apps.apple.com/app/waymark';

const INVITE_MESSAGE = `Rejoins-moi sur Waymark, l'app qui transforme tes screenshots Insta en carte : ${WAYMARK_APP_STORE_URL}`;

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const nav = useNavigation<Nav>();
  const [deleting, setDeleting] = useState(false);
  // `isPublic === null` means "unknown yet" — we render the row disabled until
  // getMyProfile resolves so a rushed tap can't toggle a nullish value.
  const [isPublic, setIsPublic] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getSocialService().getMyProfile();
        if (cancelled) return;
        // Match server-side default in `upsertProfile` (isPublic: true).
        setIsPublic(me?.isPublic ?? true);
      } catch (err) {
        console.warn('[Settings] load visibility failed', err);
        if (!cancelled) setIsPublic(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleVisibility = async (next: boolean) => {
    // Optimistic swap so the switch responds instantly; rollback on write error.
    const previous = isPublic;
    setIsPublic(next);
    try {
      await getSocialService().setProfileVisibility(next);
    } catch (err) {
      console.warn('[Settings] setProfileVisibility failed', err);
      setIsPublic(previous);
      Alert.alert('Erreur', 'Impossible de mettre à jour la visibilité. Réessaie.');
    }
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

  const inviteFriend = async () => {
    try {
      await Share.share({
        message: INVITE_MESSAGE,
        url: WAYMARK_APP_STORE_URL,
      });
    } catch (err) {
      console.warn('[Settings] invite share failed', err);
    }
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

        {user?.isAnonymous ? (
          <View style={styles.anonCard}>
            <Text style={styles.anonTitle}>Mode démo (compte anonyme)</Text>
            <Text style={styles.anonBody}>
              Tes lieux ne sont pas sauvegardés côté cloud. Crée un vrai compte avec Apple pour les retrouver + activer la partie sociale (follow, feed, save from network).
            </Text>
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Créer un vrai compte',
                  'Tu vas être déconnecté de la démo. Les lieux ajoutés en mode démo seront perdus. Se reconnecter avec Apple pour créer un vrai compte.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Se déconnecter',
                      style: 'destructive',
                      onPress: () => { logout().catch(console.error); },
                    },
                  ],
                );
              }}
              style={({ pressed }) => [styles.anonBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.anonBtnLabel}>Se connecter avec Apple</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Connecté en tant que</Text>
            <Text style={styles.cardValue}>{user?.displayName ?? user?.email ?? '—'}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Ajout depuis Partager</Text>
        <Text style={styles.sectionBody}>
          Depuis Photos, Instagram ou n'importe quelle app, tape Partager et choisis Waymark dans la
          grille — l'extraction se lance automatiquement, aucune configuration.
        </Text>

        {!user?.isAnonymous && (
          <>
            <View style={styles.actionGroup}>
              <Pressable
                onPress={() => nav.navigate('EditUsername')}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.actionLabel}>Changer mon @username</Text>
                <Text style={styles.actionChevron}>›</Text>
              </Pressable>
              <View style={styles.actionDivider} />
              <Pressable
                onPress={inviteFriend}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.actionLabel}>Inviter un ami</Text>
                <Text style={styles.actionChevron}>›</Text>
              </Pressable>
              <View style={styles.actionDivider} />
              <View style={styles.actionRow}>
                <Text style={styles.actionLabel}>Profil public</Text>
                <Switch
                  value={isPublic ?? true}
                  onValueChange={toggleVisibility}
                  disabled={isPublic === null}
                  trackColor={{ true: colors.accent, false: colors.border }}
                  thumbColor={colors.text}
                  ios_backgroundColor={colors.border}
                />
              </View>
            </View>
            <Text style={styles.visibilityHint}>
              {isPublic === false
                ? 'En privé, tes lieux sont invisibles aux autres.'
                : 'Quand ton profil est public, les autres users voient tes lieux dans leur feed et sur ton profil.'}
            </Text>
          </>
        )}

        <View style={{ flex: 1 }} />

        {/* REMOVE-ME (#17): temporary dev button to preview OnboardingSlidesScreen
            without wiring the auth flow. Delete once the flow lands in #10. */}
        {__DEV__ && (
          <Pressable
            onPress={() => nav.navigate('Onboarding')}
            style={styles.devBtn}
          >
            <Text style={styles.devLabel}>Voir Onboarding (dev)</Text>
          </Pressable>
        )}

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
  anonCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  anonTitle: {
    ...type.h3,
    color: colors.accent,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  anonBody: {
    ...type.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  anonBtn: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anonBtnLabel: {
    ...type.body,
    color: colors.bg,
    fontWeight: '700',
  },
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
  actionGroup: {
    marginTop: spacing['2xl'],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  actionRowPressed: { opacity: 0.7 },
  actionLabel: { ...type.body, color: colors.text, fontWeight: '600' },
  actionChevron: { ...type.h3, color: colors.textTertiary },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  visibilityHint: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  devBtn: {
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  devLabel: { ...type.caption, color: colors.textTertiary },
});
