import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Dimensions,
  Modal,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../auth/AuthContext';
import {
  getLieuxService,
  LieuDuplicateError,
  MAX_PHOTOS_PER_LIEU,
  PhotoCapReachedError,
} from '../services/lieuxService';
import { getSocialService } from '../services/socialService';
import { statusBadgeIcon, statusBadgeLabel } from '../lib/statusBadge';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory, LieuPhoto } from '../types/Lieu';
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

// Android needs this opt-in flag before LayoutAnimation.configureNext works.
// iOS enables it by default. Idempotent — safe to call multiple times.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Resolve every `photos[]` entry to a signed URL, in order. Missing / broken
 * blobs are dropped from the map — callers can render a placeholder for the
 * missing slot. Returned map is keyed by `storagePath`.
 */
async function resolvePhotoUrls(
  photos: LieuPhoto[],
): Promise<Record<string, string>> {
  const svc = getLieuxService();
  const entries = await Promise.all(
    photos.map(async (p) => {
      if (!p.storagePath) return null;
      try {
        const url = await svc.getScreenshotUrl(p.storagePath);
        return [p.storagePath, url] as const;
      } catch {
        return null;
      }
    }),
  );
  const out: Record<string, string> = {};
  for (const e of entries) {
    if (e) out[e[0]] = e[1];
  }
  return out;
}

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
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
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
  // Gallery state — edit mode toggles the reorder/delete affordances; lightbox
  // index null means the lightbox is closed.
  const [editMode, setEditMode] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async () => {
    if (!readUid) return;
    try {
      const svc = getLieuxService();
      const fetched = await svc.getLieuById(readUid, lieuId);
      setLieu(fetched);
      setNotes(fetched?.userNotes ?? '');
      if (fetched) {
        // Resolve every gallery photo's signed URL — the readPhotos synthesis
        // in the seam's hydrator guarantees `photos[]` is populated even for
        // pre-migration docs, so we don't need a fallback to
        // `sourceInstagram.screenshotStoragePath` here.
        setPhotoUrls(await resolvePhotoUrls(fetched.photos));
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

  // Optimistically write `nextPhotos` into local state, then commit. On error,
  // reload from the server to get the source-of-truth ordering back.
  const applyPhotoMutation = useCallback(
    async (nextPhotos: LieuPhoto[], commit: () => Promise<void>) => {
      if (!lieu) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLieu({ ...lieu, photos: nextPhotos });
      try {
        await commit();
      } catch (err) {
        console.error('[LieuDetail] photo mutation failed', err);
        Alert.alert('Erreur', "L'opération n'a pas pu être enregistrée.");
        // Reload to reconcile — the local optimistic state may have drifted.
        load();
      }
    },
    [lieu, load],
  );

  const onDeletePhoto = (photo: LieuPhoto) => {
    if (!lieu || !user) return;
    Alert.alert(
      'Supprimer cette photo ?',
      lieu.photos.length === 1
        ? 'Il ne restera aucune photo — un emoji sera affiché à la place.'
        : 'Cette photo sera retirée de la galerie.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const nextPhotos = lieu.photos.filter(
              (p) => p.storagePath !== photo.storagePath,
            );
            await applyPhotoMutation(nextPhotos, () =>
              getLieuxService().removePhoto(user.uid, lieu.id, photo.storagePath),
            );
          },
        },
      ],
    );
  };

  // Reorder helper — moves the photo at `fromIndex` to `toIndex` and persists.
  // We split "drag reorder" into two discrete affordances (see acceptance
  // criteria in #38): a left arrow (toward index 0) and a right arrow. A
  // photo can be promoted to hero by tapping the arrow that ends at slot 0.
  // This preserves the user outcome ("any position can become hero") without
  // requiring react-native-gesture-handler + reanimated (both would be new
  // dependencies — CLAUDE.md discourages new deps without a real reason).
  const onMovePhoto = useCallback(
    async (fromIndex: number, direction: -1 | 1) => {
      if (!lieu || !user) return;
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= lieu.photos.length) return;
      const nextPhotos = [...lieu.photos];
      const [moved] = nextPhotos.splice(fromIndex, 1);
      nextPhotos.splice(toIndex, 0, moved);
      await applyPhotoMutation(nextPhotos, () =>
        getLieuxService().reorderPhotos(
          user.uid,
          lieu.id,
          nextPhotos.map((p) => p.storagePath),
        ),
      );
    },
    [lieu, user, applyPhotoMutation],
  );

  const onAddPhoto = () => {
    if (!lieu || !user) return;
    if (lieu.photos.length >= MAX_PHOTOS_PER_LIEU) {
      Alert.alert(
        'Galerie pleine',
        `${MAX_PHOTOS_PER_LIEU} photos max par lieu. Supprime-en une pour en ajouter une nouvelle.`,
      );
      return;
    }
    // Ask user: camera or library. Small ActionSheet-style Alert.
    Alert.alert('Ajouter une photo', undefined, [
      {
        text: 'Prendre une photo',
        onPress: () => launchPickerAndAdd('camera'),
      },
      {
        text: "Choisir depuis l'album",
        onPress: () => launchPickerAndAdd('library'),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const launchPickerAndAdd = async (source: 'camera' | 'library') => {
    if (!lieu || !user) return;
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Autorise l'accès à l'appareil photo pour prendre une photo.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.9,
          base64: false,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Autorise l'accès aux photos pour choisir une image.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          allowsMultipleSelection: false,
          selectionLimit: 1,
          quality: 0.9,
          base64: false,
        });
      }
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setUploadingPhoto(true);
      // Resize + JPEG-encode for upload size only — no crop. This is the
      // whole point of `source: 'user'`: their photo, their aesthetic
      // (see #34 US11 + the "skip the crop pipeline" line in #38).
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1568 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );

      const added = await getLieuxService().addPhoto(
        user.uid,
        lieu.id,
        manipulated.uri,
        'user',
      );
      // Merge the new photo into local state + resolve its URL so the strip
      // updates instantly. `LayoutAnimation` gives the append a subtle fade.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const nextPhotos = [...lieu.photos, added];
      setLieu({ ...lieu, photos: nextPhotos });
      try {
        const url = await getLieuxService().getScreenshotUrl(added.storagePath);
        setPhotoUrls((prev) => ({ ...prev, [added.storagePath]: url }));
      } catch (err) {
        console.warn('[LieuDetail] failed to resolve added photo url', err);
      }
    } catch (err) {
      if (err instanceof PhotoCapReachedError) {
        Alert.alert('Galerie pleine', `${MAX_PHOTOS_PER_LIEU} photos max par lieu.`);
      } else {
        console.error('[LieuDetail] add photo failed', err);
        Alert.alert('Erreur', "L'ajout a échoué. Réessaie dans un instant.");
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const canEditPhotos = isMine && !!lieu;

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

  const heroPhoto: LieuPhoto | undefined = lieu.photos[0];
  const heroUri = heroPhoto ? photoUrls[heroPhoto.storagePath] ?? null : null;
  const tailPhotos: LieuPhoto[] = lieu.photos.slice(1);
  const canAddMore = lieu.photos.length < MAX_PHOTOS_PER_LIEU;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero — always renders photos[0]. In edit mode, an overlay lets the
            user delete or demote the hero. Tap opens the lightbox at index 0. */}
        <View style={styles.heroContainer} testID="lieu-hero">
          {heroUri ? (
            <Pressable
              onPress={() => setLightboxIndex(0)}
              style={styles.heroPressable}
              testID="lieu-hero-press"
            >
              <Image source={{ uri: heroUri }} style={styles.hero} resizeMode="cover" />
            </Pressable>
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder]}>
              <Text style={styles.heroPlaceholderEmoji}>
                {CATEGORY_LABEL[lieu.category].split(' ')[0]}
              </Text>
            </View>
          )}
          {/* Edit affordance — pencil in the top-right of the hero. Owner only. */}
          {canEditPhotos && (
            <Pressable
              onPress={() => setEditMode((v) => !v)}
              style={styles.editHeroBtn}
              testID="lieu-edit-toggle"
              accessibilityLabel={editMode ? 'Terminer les modifications' : 'Modifier les photos'}
            >
              <Text style={styles.editHeroBtnLabel}>{editMode ? 'OK' : '✎'}</Text>
            </Pressable>
          )}
          {editMode && heroPhoto && (
            <View style={styles.heroEditOverlay}>
              <Pressable
                onPress={() => onDeletePhoto(heroPhoto)}
                style={styles.heroDeleteBtn}
                testID="lieu-hero-delete"
                accessibilityLabel="Supprimer la photo hero"
              >
                <Text style={styles.deleteX}>×</Text>
              </Pressable>
              {lieu.photos.length > 1 && (
                <Pressable
                  onPress={() => onMovePhoto(0, 1)}
                  style={styles.heroDemoteBtn}
                  testID="lieu-hero-demote"
                  accessibilityLabel="Rétrograder cette photo"
                >
                  <Text style={styles.moveArrow}>→</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.categoryTag}>{CATEGORY_LABEL[lieu.category]}</Text>
          <Text style={styles.name}>{lieu.name}</Text>
          <Text style={styles.address}>{lieu.address}</Text>

          {/* #42 — friend-view badge. Sits in the SAME slot as the owner
              toggles below so the signal reads at the same visual altitude
              whichever side of the follow you're on. Read-only; nothing
              tappable. Absent when status is null / undefined. */}
          {!isMine && (() => {
            const badge = statusBadgeIcon(lieu.status);
            if (badge === null) return null;
            const label = statusBadgeLabel(lieu.status);
            return (
              <View style={styles.friendBadgeRow}>
                <Text
                  style={styles.friendBadgeIcon}
                  accessibilityLabel={label ?? undefined}
                >
                  {badge}
                </Text>
              </View>
            );
          })()}

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

          {/* #42 — owner's personal notes surface to the follower here, under
              the description. Empty / null render nothing (no label, no
              placeholder — the acceptance criterion is explicit). Only shown
              on the friend-view; the owner has their own editable notes UI
              further down. */}
          {!isMine && lieu.userNotes && lieu.userNotes.trim().length > 0 && (
            <Text style={styles.friendNotes}>{lieu.userNotes}</Text>
          )}

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
        </View>

        {/* Gallery strip — photos[1..] as horizontal thumbnails. When in edit
            mode, each tile gets a delete X + move arrows, and a "+ Ajouter"
            tile appears at the tail (hidden at the 10-photo cap). */}
        {(tailPhotos.length > 0 || (editMode && canAddMore)) && (
          <View style={styles.stripSection} testID="lieu-strip">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripContent}
            >
              {tailPhotos.map((photo, tailIndex) => {
                const galleryIndex = tailIndex + 1; // index in lieu.photos
                const url = photoUrls[photo.storagePath] ?? null;
                return (
                  <View
                    key={photo.storagePath}
                    style={styles.tile}
                    testID={`lieu-tile-${galleryIndex}`}
                  >
                    <Pressable
                      onPress={() => setLightboxIndex(galleryIndex)}
                      disabled={editMode}
                      style={styles.tilePressable}
                    >
                      {url ? (
                        <Image
                          source={{ uri: url }}
                          style={styles.tileImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.tileImage, styles.tilePlaceholder]}>
                          <Text style={styles.tilePlaceholderEmoji}>·</Text>
                        </View>
                      )}
                    </Pressable>
                    {editMode && (
                      <>
                        <Pressable
                          onPress={() => onDeletePhoto(photo)}
                          style={styles.tileDeleteBtn}
                          testID={`lieu-tile-delete-${galleryIndex}`}
                        >
                          <Text style={styles.deleteX}>×</Text>
                        </Pressable>
                        <View style={styles.tileArrowsRow}>
                          <Pressable
                            onPress={() => onMovePhoto(galleryIndex, -1)}
                            style={styles.tileArrowBtn}
                            testID={`lieu-tile-up-${galleryIndex}`}
                            accessibilityLabel="Monter cette photo"
                          >
                            <Text style={styles.moveArrow}>←</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => onMovePhoto(galleryIndex, 1)}
                            disabled={galleryIndex === lieu.photos.length - 1}
                            style={[
                              styles.tileArrowBtn,
                              galleryIndex === lieu.photos.length - 1 && styles.tileArrowDisabled,
                            ]}
                            testID={`lieu-tile-down-${galleryIndex}`}
                            accessibilityLabel="Descendre cette photo"
                          >
                            <Text style={styles.moveArrow}>→</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
              {/* "+ Ajouter" tile — only in edit mode, hidden at the cap. */}
              {editMode && canAddMore && (
                <Pressable
                  onPress={onAddPhoto}
                  style={[styles.tile, styles.addTile]}
                  disabled={uploadingPhoto}
                  testID="lieu-add-photo"
                  accessibilityLabel="Ajouter une photo"
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Text style={styles.addTileLabel}>+</Text>
                  )}
                </Pressable>
              )}
            </ScrollView>
          </View>
        )}

        <View style={styles.body}>
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

      <Lightbox
        photos={lieu.photos}
        urls={photoUrls}
        openIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </SafeAreaView>
  );
}

/**
 * Full-screen pager over the pin's gallery. Uses a paged horizontal
 * ScrollView — native swipe left/right, no gesture-handler dependency needed.
 * Rendered inside a Modal so it overlays even the SafeArea insets.
 */
function Lightbox({
  photos,
  urls,
  openIndex,
  onClose,
}: {
  photos: LieuPhoto[];
  urls: Record<string, string>;
  openIndex: number | null;
  onClose: () => void;
}) {
  const width = Dimensions.get('window').width;
  const height = Dimensions.get('window').height;
  const scrollRef = useRef<ScrollView>(null);
  const visible = openIndex !== null;

  // Snap to the requested starting page whenever the lightbox opens.
  useEffect(() => {
    if (visible && openIndex !== null && scrollRef.current) {
      // A short timeout ensures the child ScrollView has laid out at `width`
      // before we ask it to scroll — otherwise the initial `x: 0` would win.
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ x: openIndex * width, y: 0, animated: false });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [visible, openIndex, width]);

  const pages = useMemo(
    () =>
      photos.map((p) => ({
        key: p.storagePath,
        uri: urls[p.storagePath] ?? null,
      })),
    [photos, urls],
  );

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      testID="lieu-lightbox"
    >
      <View style={styles.lightboxRoot}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
        >
          {pages.map((page) => (
            <View
              key={page.key}
              style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
            >
              {page.uri ? (
                <Image
                  source={{ uri: page.uri }}
                  style={{ width, height }}
                  resizeMode="contain"
                />
              ) : (
                <ActivityIndicator color={colors.text} />
              )}
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={styles.lightboxClose}
          testID="lieu-lightbox-close"
          accessibilityLabel="Fermer"
        >
          <Text style={styles.lightboxCloseLabel}>×</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing['3xl'] },
  heroContainer: { width: '100%', height: 320, backgroundColor: colors.bgElevated },
  heroPressable: { width: '100%', height: '100%' },
  hero: { width: '100%', height: 320, backgroundColor: colors.bgElevated },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderEmoji: { fontSize: 72 },
  editHeroBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editHeroBtnLabel: { color: colors.text, fontSize: 18, fontWeight: '700' },
  heroEditOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroDeleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDemoteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing['2xl'], paddingTop: spacing.xl },
  stripSection: { marginTop: spacing.xl },
  stripContent: {
    paddingHorizontal: spacing['2xl'],
    gap: spacing.sm,
  },
  tile: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    overflow: 'visible',
  },
  tilePressable: { width: 80, height: 80, borderRadius: radius.md, overflow: 'hidden' },
  tileImage: { width: 80, height: 80, borderRadius: radius.md },
  tilePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  tilePlaceholderEmoji: { color: colors.textTertiary, fontSize: 24 },
  tileDeleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  deleteX: { color: colors.text, fontSize: 16, lineHeight: 18, fontWeight: '700' },
  tileArrowsRow: {
    position: 'absolute',
    bottom: -6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tileArrowBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileArrowDisabled: { opacity: 0.3 },
  moveArrow: { color: colors.text, fontSize: 14, fontWeight: '700' },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addTileLabel: { color: colors.accent, fontSize: 32, fontWeight: '300' },
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
  // #42 — read-only friend badge. Same vertical slot as the owner toggles
  // (marginTop mirrors statusRow) so the position stays symmetric.
  friendBadgeRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  friendBadgeIcon: {
    ...type.h2,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  // #42 — friend's userNotes paragraph, under the description. Slightly
  // dimmer than the description body so the visual hierarchy stays
  // "description > friend's note".
  friendNotes: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 22,
    fontStyle: 'italic',
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
  lightboxRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  lightboxClose: {
    position: 'absolute',
    top: spacing['3xl'],
    right: spacing.xl,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseLabel: { color: colors.text, fontSize: 24, fontWeight: '700' },
});
