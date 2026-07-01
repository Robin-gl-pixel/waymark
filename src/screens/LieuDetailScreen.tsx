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
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
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
  const { lieuId } = useRoute<Rt>().params;
  const { user } = useAuth();
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const svc = getLieuxService();
      const fetched = await svc.getLieuById(user.uid, lieuId);
      setLieu(fetched);
      setNotes(fetched?.userNotes ?? '');
      if (fetched) {
        try {
          setImgUri(await svc.getScreenshotUrl(fetched.sourceInstagram.screenshotStoragePath));
        } catch {
          setImgUri(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [user, lieuId]);

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

          {lieu.description && <Text style={styles.description}>{lieu.description}</Text>}

          {lieu.sourceInstagram.author && (
            <Text style={styles.attribution}>Reco de @{lieu.sourceInstagram.author}</Text>
          )}

          <Pressable
            onPress={openInMaps}
            style={({ pressed }) => [
              styles.mapsBtn,
              { backgroundColor: pressed ? colors.accentDim : colors.accent },
            ]}
          >
            <Text style={styles.mapsBtnLabel}>Ouvrir dans Plans</Text>
          </Pressable>

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
  description: { ...type.body, color: colors.text, marginTop: spacing.lg, lineHeight: 24 },
  attribution: {
    ...type.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  mapsBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  mapsBtnLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
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
