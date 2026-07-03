import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService, LieuDuplicateError } from '../services/lieuxService';
import { getSocialService } from '../services/socialService';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'LieuDetail'>;
type Rt = RouteProp<RootStackParamList, 'LieuDetail'>;

const CATEGORY_LABEL: Record<LieuCategory, string> = {
  resto: '🍽️ Restaurant',
  bar: '🍸 Bar',
  café: '☕ Café',
  activité: '🎨 Activité',
  musée: '🏛️ Musée',
  hôtel: '🏨 Hôtel',
  autre: '📍 Autre',
};

export default function LieuDetailScreen() {
  const nav = useNavigation<Nav>();
  const { lieuId, ownerUid } = useRoute<Rt>().params;
  const { user } = useAuth();
  // If we're viewing another user's lieu (from the network feed), fetch from
  // that owner's collection. All edit affordances (notes, delete) below are
  // gated behind `isMine`.
  const readUid = ownerUid ?? user?.uid ?? null;
  const isMine = readUid !== null && user?.uid === readUid;
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Owner of the pin I'm viewing when it's not mine — used to power the
  // "Sauver dans ma carte" credit + isCurated badge check.
  const [otherOwner, setOtherOwner] = useState<UserProfile | null>(null);
  // Profile of the saver referenced by `savedFromUserId` on MY pin — used to
  // upgrade "via @X" to a "Waymark Curated" badge when applicable.
  const [savedFromProfile, setSavedFromProfile] = useState<UserProfile | null>(null);
  const [resaving, setResaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!readUid) return;
    try {
      const svc = getLieuxService();
      const fetched = await svc.getLieuById(readUid, lieuId);
      setLieu(fetched);
      setNotes(fetched?.userNotes ?? '');
      if (fetched) {
        // Hero comes from `photos[0]` (parent PRD #34 — the ordered gallery
        // model). Pins with no photos (Insta URL shares that never uploaded
        // an image, curated pins, or pre-migration docs where the read-compat
        // synthesis found no legacy path) fall back to the category-emoji
        // placeholder — same behaviour as before the migration.
        const heroPath = fetched.photos[0]?.storagePath;
        if (heroPath) {
          try {
            setImgUri(await svc.getScreenshotUrl(heroPath));
          } catch {
            setImgUri(null);
          }
        } else {
          setImgUri(null);
        }
        // Resolve the owner profile in two cases:
        //   1. Viewing someone else's pin → we need the owner's username to
        //      pass as `credit` when the user taps "Sauver dans ma carte".
        //   2. Viewing my own pin with a `savedFromUserId` → we need the
        //      saver's `isCurated` flag to decide between "via @X" and the
        //      "Waymark Curated" badge.
        const isViewingOthers = readUid !== user?.uid;
        try {
          if (isViewingOthers) {
            setOtherOwner(await getSocialService().getUserByUid(readUid));
          } else if (fetched.savedFromUserId) {
            setSavedFromProfile(await getSocialService().getUserByUid(fetched.savedFromUserId));
          }
        } catch (err) {
          console.warn('[LieuDetail] profile fetch failed', err);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [readUid, lieuId, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const flushNotes = useCallback(async () => {
    if (!user || !lieu) return;
    const next = (pendingSave.current ?? notes).trim();
    pendingSave.current = null;
    if ((lieu.userNotes ?? '') === next) return;
    setSaving(true);
    try {
      await getLieuxService().updateLieu(user.uid, lieu.id, { userNotes: next || null });
      // Reflect the persisted value locally so subsequent equality checks skip no-op writes.
      setLieu({ ...lieu, userNotes: next || null });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [user, lieu, notes]);

  const onNotesChange = (text: string) => {
    setNotes(text);
    pendingSave.current = text;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // 800 ms is long enough to skip mid-word writes and short enough to feel autosaved.
    saveTimer.current = setTimeout(() => {
      flushNotes().catch(console.error);
    }, 800);
  };

  const onNotesBlur = () => {
    // Blur is a hard flush: cancel the pending timer and write immediately.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    flushNotes().catch(console.error);
  };

  // Guarantee an in-flight edit lands even if the screen unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        flushNotes().catch(console.error);
      }
    };
  }, [flushNotes]);

  const openInMaps = () => {
    if (!lieu) return;
    // maps: scheme opens Apple Maps; Google Maps app hijacks if installed and user set it as default.
    Linking.openURL(`maps://?q=${encodeURIComponent(lieu.name)}&ll=${lieu.lat},${lieu.lng}`);
  };

  const onResaveFromNetwork = async () => {
    if (!lieu || !user || !readUid || !otherOwner) return;
    setResaving(true);
    try {
      const resaved = await getLieuxService().resaveFromNetwork(lieu, {
        uid: readUid,
        username: otherOwner.username,
      });
      // Land the user on the map focused on their new pin — matches the
      // "Voir sur la carte" pattern below and the golden path in #13.
      nav.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: { screen: 'Map', params: { focusLieuId: resaved.id } },
          },
        ],
      });
    } catch (err) {
      if (err instanceof LieuDuplicateError) {
        Alert.alert(
          'Déjà dans ta collection',
          `"${err.duplicate.name}" est déjà enregistré chez toi.`,
          [
            {
              text: 'Voir sur la carte',
              onPress: () =>
                nav.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Main',
                      params: { screen: 'Map', params: { focusLieuId: err.duplicate.id } },
                    },
                  ],
                }),
            },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else {
        console.error('[LieuDetail] resave failed', err);
        Alert.alert('Erreur', "La sauvegarde n'a pas abouti. Réessaie dans un instant.");
      }
    } finally {
      setResaving(false);
    }
  };

  const onTapAttribution = () => {
    if (!lieu?.savedFromUserId) return;
    nav.navigate('UserProfile', { uid: lieu.savedFromUserId });
  };

  // #41 — toggle the pin's status. Tapping the currently-active toggle clears
  // the status back to null (undo without indirection). Tapping any other
  // toggle sets that status. The service takes care of the visitedAt invariant.
  const onToggleStatus = async (target: 'wishlist' | 'visited') => {
    if (!user || !lieu || !isMine) return;
    const next: 'wishlist' | 'visited' | null = lieu.status === target ? null : target;
    // Optimistic update — mirror the immediate feel of userNotes autosave.
    // If the persistent write fails, we log and leave the UI in the last-good
    // state on the next `load()`; not gating the tap on the network keeps the
    // toggle indistinguishable from local state.
    setLieu({ ...lieu, status: next });
    try {
      await getLieuxService().updateLieu(user.uid, lieu.id, { status: next });
    } catch (err) {
      console.error('[LieuDetail] status update failed', err);
      // Roll back the optimistic change so the UI reflects reality.
      setLieu(lieu);
    }
  };

  const confirmDelete = () => {
    if (!lieu || !user) return;
    Alert.alert(
      'Supprimer ce lieu ?',
      `"${lieu.name}" sera retiré de ta collection. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await getLieuxService().deleteLieu(user.uid, lieu.id);
              nav.goBack();
            } catch (err) {
              console.error(err);
              Alert.alert('Erreur', 'Suppression échouée.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing['3xl'] }} />
      </SafeAreaView>
    );
  }

  if (!lieu) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.notFound}>Lieu introuvable.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {imgUri && <Image source={{ uri: imgUri }} style={styles.hero} resizeMode="cover" />}

        <View style={styles.body}>
          <Text style={styles.categoryTag}>{CATEGORY_LABEL[lieu.category]}</Text>
          <Text style={styles.name}>{lieu.name}</Text>
          <Text style={styles.address}>{lieu.address}</Text>

          {/* #41 — owner-only status toggles. Sits directly under the address
              per the design symmetry decision in #39 (badge for followers
              lands in the same spot in the follow-up slice). Tapping the
              active toggle clears status back to null. */}
          {isMine && (
            <View style={styles.statusRow} accessibilityRole="tablist">
              <Pressable
                onPress={() => onToggleStatus('wishlist')}
                accessibilityRole="tab"
                accessibilityState={{ selected: lieu.status === 'wishlist' }}
                accessibilityLabel="Envie"
                style={({ pressed }) => [
                  styles.statusToggle,
                  lieu.status === 'wishlist' && styles.statusToggleActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.statusToggleLabel,
                    lieu.status === 'wishlist' && styles.statusToggleLabelActive,
                  ]}
                >
                  ♡ Envie
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onToggleStatus('visited')}
                accessibilityRole="tab"
                accessibilityState={{ selected: lieu.status === 'visited' }}
                accessibilityLabel="Déjà allé"
                style={({ pressed }) => [
                  styles.statusToggle,
                  lieu.status === 'visited' && styles.statusToggleActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.statusToggleLabel,
                    lieu.status === 'visited' && styles.statusToggleLabelActive,
                  ]}
                >
                  ✓ Déjà allé
                </Text>
              </Pressable>
            </View>
          )}

          {lieu.description && <Text style={styles.description}>{lieu.description}</Text>}

          {lieu.sourceInstagram.author && (
            <Text style={styles.attribution}>Reco de @{lieu.sourceInstagram.author}</Text>
          )}

          {/* "via @X" attribution — only on MY pins that came from a re-save.
              Tap opens the saver's profile. `savedFromProfile.isCurated`
              upgrades the tag to the "Waymark Curated" badge. */}
          {isMine && lieu.savedFromUsername && (
            <Pressable
              onPress={onTapAttribution}
              style={({ pressed }) => [styles.viaRow, pressed && { opacity: 0.6 }]}
            >
              {savedFromProfile?.isCurated ? (
                <View style={styles.curatedBadge}>
                  <Text style={styles.curatedLabel}>Waymark Curated</Text>
                </View>
              ) : (
                <Text style={styles.viaLabel}>via @{lieu.savedFromUsername}</Text>
              )}
            </Pressable>
          )}

          {/* "Sauver dans ma carte" — primary CTA on a network pin (someone
              else's collection). Dedup handled by resaveFromNetwork itself. */}
          {!isMine && otherOwner && user && (
            <Pressable
              onPress={onResaveFromNetwork}
              disabled={resaving}
              style={({ pressed }) => [
                styles.mapsBtn,
                { backgroundColor: pressed ? colors.accentDim : colors.accent },
                resaving && { opacity: 0.6 },
              ]}
            >
              {resaving ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.mapsBtnLabel}>Sauver dans ma carte</Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={openInMaps}
            style={({ pressed }) => [
              !isMine ? styles.secondaryBtn : styles.mapsBtn,
              !isMine
                ? pressed && { opacity: 0.7 }
                : { backgroundColor: pressed ? colors.accentDim : colors.accent },
            ]}
          >
            <Text style={!isMine ? styles.secondaryBtnLabel : styles.mapsBtnLabel}>
              Ouvrir dans Plans
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              nav.navigate('Main', { screen: 'Map', params: { focusLieuId: lieu.id } })
            }
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.secondaryBtnLabel}>Voir sur la carte</Text>
          </Pressable>

          {isMine && (
            <>
              <Text style={styles.label}>Mes notes</Text>
              <TextInput
                value={notes}
                onChangeText={onNotesChange}
                onBlur={onNotesBlur}
                placeholder="Réserver 2 semaines avant, aller le vendredi soir, éviter en été…"
                placeholderTextColor={colors.textTertiary}
                multiline
                style={styles.notesInput}
              />
              {saving && <Text style={styles.saving}>Sauvegarde…</Text>}

              <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnLabel}>Supprimer ce lieu</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing['3xl'] },
  hero: { width: '100%', height: 320, backgroundColor: colors.bgElevated },
  body: { paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl },
  categoryTag: {
    ...type.caption,
    color: colors.accent,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  name: { ...type.h1, color: colors.text, fontWeight: '700' },
  address: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm },
  // #41 — segmented status toggles, owner-only. Sits directly under the address.
  statusRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  statusToggle: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  statusToggleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  statusToggleLabel: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusToggleLabelActive: {
    color: colors.text,
  },
  description: { ...type.body, color: colors.text, marginTop: spacing.lg, lineHeight: 24 },
  attribution: {
    ...type.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  viaRow: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  viaLabel: {
    ...type.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  curatedBadge: {
    backgroundColor: colors.accentDim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  curatedLabel: {
    ...type.caption,
    color: colors.text,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  mapsBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  mapsBtnLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  secondaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  label: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesInput: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  saving: { ...type.micro, color: colors.textTertiary, marginTop: spacing.xs },
  deleteBtn: {
    marginTop: spacing['3xl'],
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: { ...type.h3, color: colors.error, fontWeight: '600' },
  notFound: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing['3xl'] },
});
