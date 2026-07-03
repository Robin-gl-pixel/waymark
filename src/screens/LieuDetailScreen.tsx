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
import { colors, spacing, type, categoryColor } from '../theme';
import type { Lieu, LieuCategory, LieuStatus } from '../types/Lieu';
import type { UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';
import BadgeText, { type BadgeStatus } from '../components/BadgeText';
import StatusToggle from '../components/StatusToggle';
import { formatCompactDate, formatEntryNumber } from '../utils/lieuNumber';
import { detailQuoteText, formatAddress } from './lieuDetail/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList, 'LieuDetail'>;
type Rt = RouteProp<RootStackParamList, 'LieuDetail'>;

/**
 * Short mono uppercase French category label used inside the category chip.
 * No emoji — the color IS the code (per PRD §12). Removing the emoji is part
 * of the v8 copy sweep.
 */
const CATEGORY_LABEL: Record<LieuCategory, string> = {
  resto: 'Resto',
  bar: 'Bar',
  café: 'Café',
  activité: 'Activité',
  musée: 'Musée',
  hôtel: 'Hôtel',
  autre: 'Autre',
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
  const [showEditor, setShowEditor] = useState(false);
  // Owner of the pin I'm viewing when it's not mine — used to power the
  // "Ajouter à ma carte" credit + isCurated badge check + friend note attribution.
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
        // Pins from Insta URL shares (no local screenshot) have an empty
        // storagePath — skip the signed-URL resolve to avoid a noisy 404.
        if (fetched.sourceInstagram.screenshotStoragePath) {
          try {
            setImgUri(await svc.getScreenshotUrl(fetched.sourceInstagram.screenshotStoragePath));
          } catch {
            setImgUri(null);
          }
        } else {
          setImgUri(null);
        }
        // Resolve the owner profile in two cases:
        //   1. Viewing someone else's pin → we need the owner's username to
        //      pass as `credit` when the user taps "Ajouter à ma carte".
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

  const onStatusChange = useCallback(
    async (next: BadgeStatus) => {
      if (!user || !lieu || !isMine) return;
      // Optimistic — the toggle should feel instant. Rollback on error.
      const prev = lieu.status ?? null;
      const nextStatus: LieuStatus | null = next;
      setLieu({ ...lieu, status: nextStatus });
      try {
        await getLieuxService().updateLieu(user.uid, lieu.id, { status: nextStatus });
      } catch (err) {
        console.error('[LieuDetail] status update failed', err);
        setLieu({ ...lieu, status: prev });
        Alert.alert('Erreur', "La mise à jour n'a pas abouti. Réessaie dans un instant.");
      }
    },
    [user, lieu, isMine],
  );

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
          'Déjà chez toi',
          `« ${err.duplicate.name} » est déjà dans ta carte.`,
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
        Alert.alert('Erreur', 'Ça n’a pas abouti. Réessaie dans un instant.');
      }
    } finally {
      setResaving(false);
    }
  };

  const onTapAttribution = () => {
    if (!lieu?.savedFromUserId) return;
    nav.navigate('UserProfile', { uid: lieu.savedFromUserId });
  };

  const confirmDelete = () => {
    if (!lieu || !user) return;
    Alert.alert(
      'Supprimer ce pin ?',
      `« ${lieu.name} » sera retiré de ta carte. Irréversible.`,
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
              Alert.alert('Erreur', "Ça n'a pas abouti.");
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <NavBar onBack={() => nav.goBack()} />
        <ActivityIndicator color={colors.ink} style={{ marginTop: spacing['3xl'] }} />
      </SafeAreaView>
    );
  }

  if (!lieu) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <NavBar onBack={() => nav.goBack()} />
        <Text style={styles.notFound}>Pin introuvable.</Text>
      </SafeAreaView>
    );
  }

  const catColor = categoryColor(lieu.category);
  const statusForBadge: BadgeStatus = (lieu.status ?? null) as BadgeStatus;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavBar
        onBack={() => nav.goBack()}
        onEdit={isMine ? () => setShowEditor((v) => !v) : undefined}
        onAdd={!isMine && otherOwner && user ? onResaveFromNetwork : undefined}
        addLoading={resaving}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero — full-width, no rotation/tape/border, mono `Nº XXX` in paper. */}
        <View style={styles.hero}>
          {imgUri ? (
            <Image source={{ uri: imgUri }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder, { backgroundColor: catColor }]} />
          )}
          <Text style={styles.heroNum} accessibilityLabel={`Entrée ${formatEntryNumber(lieu)}`}>
            {formatEntryNumber(lieu)}
          </Text>
        </View>

        <View style={styles.body}>
          {/* Title row: grotesque black uppercase + category chip in category color. */}
          <View style={styles.headRow}>
            <Text style={styles.title} numberOfLines={3}>
              {lieu.name}
            </Text>
            <View style={[styles.catChip, { backgroundColor: catColor }]}>
              <View style={styles.catChipDot} />
              <Text style={styles.catChipLabel}>{CATEGORY_LABEL[lieu.category]}</Text>
            </View>
          </View>

          {/* Address block: mono uppercase, graphite. Friend mode: BadgeText
              (wave 1 primitive) renders under the address with the owner's
              status. A mid-dot prefix mirrors the mockup's `· Allé` / `· Envie`
              layout without duplicating the label choice. */}
          <View style={styles.addressBlock}>
            <Text style={styles.address}>{formatAddress(lieu)}</Text>
            {!isMine && statusForBadge !== null && (
              <View style={styles.friendBadgeRow}>
                <Text style={styles.friendBadgeDot}>{'·'}</Text>
                <BadgeText status={statusForBadge} />
              </View>
            )}
          </View>

          {/* Owner: StatusToggle. Friend: hidden — the BadgeText above already shows it. */}
          {isMine && (
            <StatusToggle
              status={statusForBadge}
              onChange={onStatusChange}
              style={styles.statusToggle}
            />
          )}

          {/* Quote: italic serif with French guillemets. Friend mode gets a
              second serif block for the friend's userNotes (with attribution). */}
          {(() => {
            const quoteText = detailQuoteText(lieu, isMine);
            return quoteText ? <Text style={styles.quote}>{quoteText}</Text> : null;
          })()}
          {!isMine && lieu.userNotes && lieu.userNotes.trim().length > 0 && otherOwner && (
            <FriendNote note={lieu.userNotes.trim()} handle={otherOwner.username} />
          )}

          {/* Social proof: `@<author> · REEL` (mono uppercase, small colored bullet). */}
          {lieu.sourceInstagram.author && (
            <View style={styles.socialLine}>
              <View style={[styles.socialDot, { backgroundColor: catColor }]} />
              <Text style={styles.socialLabel}>
                <Text style={styles.socialHandle}>@{lieu.sourceInstagram.author}</Text>
                <Text style={styles.socialLabelSuffix}>{' · reel'}</Text>
              </Text>
            </View>
          )}

          {/* Credit: mono, «Sauvé le DD·MM» + attribution / friend prompt. */}
          <View style={styles.creditLine}>
            {isMine ? (
              <Text style={styles.creditLabel}>{`Sauvé le ${formatCompactDate(lieu.createdAt)}`}</Text>
            ) : otherOwner ? (
              <Pressable
                onPress={onResaveFromNetwork}
                disabled={resaving}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.creditLabel}>
                  {'De la carte de '}
                  <Text style={styles.creditStrong}>@{otherOwner.username}</Text>
                  {' · '}
                  <Text style={styles.creditStrong}>
                    {resaving ? 'Ajout…' : '+ Ajouter à ma carte'}
                  </Text>
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Attribution — "via @X" or the "Waymark Curated" badge for my
              re-saves. Preserved from the previous design, just re-styled. */}
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

          {/* Owner secondary actions: open in maps, view on the map, notes editor, delete. */}
          <Pressable
            onPress={openInMaps}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.secondaryBtnLabel}>Ouvrir dans Plans</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              nav.navigate('Main', { screen: 'Map', params: { focusLieuId: lieu.id } })
            }
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.secondaryBtnLabel}>Voir sur la carte</Text>
          </Pressable>

          {isMine && showEditor && (
            <>
              <Text style={styles.editorLabel}>Tes notes</Text>
              <TextInput
                value={notes}
                onChangeText={onNotesChange}
                onBlur={onNotesBlur}
                placeholder="ce que tu veux dire à ton toi du futur"
                placeholderTextColor={colors.graphite}
                multiline
                style={styles.notesInput}
              />
              {saving && <Text style={styles.saving}>Sauvegarde…</Text>}
              <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnLabel}>Supprimer ce pin</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Sub-components ---------- */

function NavBar({
  onBack,
  onEdit,
  onAdd,
  addLoading,
}: {
  onBack: () => void;
  onEdit?: () => void;
  onAdd?: () => void;
  addLoading?: boolean;
}) {
  return (
    <View style={styles.navBar}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.navBtnGlyph}>←</Text>
      </Pressable>
      {onEdit && (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Modifier"
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.navBtnGlyph}>✎</Text>
        </Pressable>
      )}
      {onAdd && (
        <Pressable
          onPress={onAdd}
          disabled={addLoading}
          accessibilityRole="button"
          accessibilityLabel="Ajouter à ma carte"
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
        >
          {addLoading ? (
            <ActivityIndicator color={colors.ink} size="small" />
          ) : (
            <Text style={styles.navBtnGlyph}>+</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function FriendNote({ note, handle }: { note: string; handle: string }) {
  return (
    <View style={styles.friendNote}>
      <Text style={styles.friendNoteBody}>{`« ${note} »`}</Text>
      <Text style={styles.friendNoteAttrib}>{`— note de @${handle}`}</Text>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: spacing['3xl'] },

  /* ----- Nav bar ----- */
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.paper,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnGlyph: {
    fontSize: 16,
    color: colors.ink,
    lineHeight: 18,
  },

  /* ----- Hero ----- */
  hero: {
    width: '100%',
    height: 320,
    position: 'relative',
    backgroundColor: colors.hair,
  },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { opacity: 0.4 },
  heroNum: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 2,
    // A soft shadow so the label reads on light photos without a chip.
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  /* ----- Body ----- */
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontFamily: 'System',
    fontWeight: '900',
    fontSize: 30,
    lineHeight: 30,
    letterSpacing: -1.2,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  catChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ink,
  },
  catChipLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: colors.ink,
    textTransform: 'uppercase',
  },

  addressBlock: {
    gap: spacing.xs,
  },
  address: {
    fontFamily: 'Courier',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: colors.graphite,
    textTransform: 'uppercase',
  },
  friendBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  friendBadgeDot: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.graphite,
    textTransform: 'uppercase',
  },

  statusToggle: {
    marginTop: spacing.xs,
  },

  quote: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hair,
  },

  friendNote: {
    backgroundColor: 'rgba(20, 16, 10, 0.04)',
    borderLeftWidth: 2,
    borderLeftColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  friendNoteBody: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  friendNoteAttrib: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.graphite,
  },

  socialLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.xs,
  },
  socialDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  socialLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.graphite,
    // Not textTransform:'uppercase' — handles are case-sensitive and the
    // mockup shows the @handle lowercased. The `· REEL` suffix is uppercased
    // per-token instead (see `socialLabelSuffix` below).
  },
  socialHandle: {
    color: colors.ink,
    fontWeight: '700',
  },
  socialLabelSuffix: {
    textTransform: 'uppercase',
  },

  creditLine: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hair,
  },
  creditLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.graphite,
    textTransform: 'uppercase',
  },
  creditStrong: {
    color: colors.catActivite,
    fontWeight: '700',
  },

  viaRow: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  viaLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.catActivite,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  curatedBadge: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  curatedLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: colors.paper,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  secondaryBtn: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryBtnLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.ink,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  editorLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: colors.graphite,
    letterSpacing: 1.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  notesInput: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 15,
    color: colors.ink,
    backgroundColor: 'rgba(20, 16, 10, 0.04)',
    borderWidth: 1,
    borderColor: colors.hair,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  saving: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: colors.graphite,
    marginTop: spacing.xs,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  deleteBtn: {
    marginTop: spacing['2xl'],
    height: 48,
    borderWidth: 1,
    borderColor: colors.catResto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.catResto,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  notFound: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.graphite,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
});
