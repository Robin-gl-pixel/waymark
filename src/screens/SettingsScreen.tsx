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
const AMBLE_APP_STORE_URL = 'https://apps.apple.com/app/pinti';

const INVITE_MESSAGE = `Rejoins-moi sur Pinti, l'app qui transforme tes recos Insta en carte : ${AMBLE_APP_STORE_URL}`;

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
      Alert.alert('Aïe', 'Visibilité pas mise à jour. Réessaie.');
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
        ? `Tes ${pinCount} pin${pinCount > 1 ? 's' : ''} sautent avec. `
        : '';
    Alert.alert(
      'Supprimer ton compte ?',
      `${pinsLine}Toutes tes données (lieux, screenshots, compte) s'envolent définitivement. Zéro retour possible.`,
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
        url: AMBLE_APP_STORE_URL,
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
        'Toutes tes données ont été effacées. À la prochaine.',
        [{ text: 'OK', onPress: () => { logout().catch(console.error); } }],
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Aïe', 'Suppression foirée. Réessaie.');
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>Nº 07</Text>
        <Text style={styles.title}>Réglages</Text>

        {user?.isAnonymous ? (
          <View style={styles.anonCard}>
            <Text style={styles.anonTitle}>Mode démo</Text>
            <Text style={styles.anonBody}>
              Tes lieux ne sont pas sauvegardés côté cloud. Fais un vrai compte Apple pour les retrouver + débloquer la partie sociale (follow, feed, save from network).
            </Text>
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Créer un vrai compte',
                  "T'es déconnecté de la démo. Les lieux ajoutés en mode démo sautent. Reconnecte-toi avec Apple pour ouvrir un vrai compte.",
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

        <Text style={styles.sectionEyebrow}>Nº 01</Text>
        <Text style={styles.sectionTitle}>Ajout depuis Partager</Text>
        <Text style={styles.sectionBody}>
          Photos, Instagram, n'importe quelle app : tape Partager, choisis Pinti dans la grille — l'extraction se lance, tu touches à rien.
        </Text>

        {!user?.isAnonymous && (
          <>
            <Text style={styles.sectionEyebrow}>Nº 02</Text>
            <Text style={styles.sectionTitle}>Compte</Text>
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
                <Text style={styles.actionLabel}>Inviter un pote</Text>
                <Text style={styles.actionChevron}>›</Text>
              </Pressable>
              <View style={styles.actionDivider} />
              <Pressable
                onPress={() => nav.navigate('ShortcutSetup')}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              >
                <Text style={styles.actionLabel}>Configurer le Shortcut</Text>
                <Text style={styles.actionChevron}>›</Text>
              </Pressable>
              <View style={styles.actionDivider} />
              <View style={styles.actionRow}>
                <Text style={styles.actionLabel}>Profil public</Text>
                <Switch
                  value={isPublic ?? true}
                  onValueChange={toggleVisibility}
                  disabled={isPublic === null}
                  trackColor={{ true: colors.catResto, false: colors.hair }}
                  thumbColor={colors.paper}
                  ios_backgroundColor={colors.hair}
                />
              </View>
            </View>
            <Text style={styles.visibilityHint}>
              {isPublic === false
                ? 'En privé, tes lieux sont invisibles pour les autres.'
                : 'Profil public = les autres voient tes lieux dans leur feed et sur ton profil.'}
            </Text>
          </>
        )}

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
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    minHeight: '100%',
  },
  eyebrow: { ...type.monoSm, color: colors.graphite, marginBottom: spacing.sm },
  title: { ...type.h1, color: colors.ink, marginBottom: spacing.md },
  anonCard: {
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.catResto,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  anonTitle: {
    ...type.h3,
    color: colors.catResto,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  anonBody: {
    ...type.serif,
    color: colors.graphite,
    marginBottom: spacing.lg,
  },
  anonBtn: {
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.catResto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anonBtnLabel: {
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
  },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  cardLabel: {
    ...type.monoSm,
    color: colors.graphite,
    marginBottom: spacing.xs,
  },
  cardValue: { ...type.h3, color: colors.ink, textTransform: 'uppercase' },
  sectionEyebrow: {
    ...type.monoSm,
    color: colors.graphite,
    marginTop: spacing['2xl'],
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.h2, color: colors.ink, marginBottom: spacing.sm },
  sectionBody: { ...type.serif, color: colors.graphite, marginTop: spacing.xs },
  logoutBtn: {
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing['3xl'],
    marginBottom: spacing.md,
  },
  logoutLabel: { ...type.mono, color: colors.ink, fontWeight: '700' },
  deleteBtn: {
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: { ...type.mono, color: colors.error, fontWeight: '700' },
  actionGroup: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.paper,
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
  actionLabel: { ...type.body, color: colors.ink, fontWeight: '600' },
  actionChevron: { ...type.h3, color: colors.graphite },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hair,
    marginHorizontal: spacing.lg,
  },
  visibilityHint: {
    ...type.caption,
    color: colors.graphite,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
