import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius, categoryColor } from '../theme';
import type { RootStackParamList } from '../navigation';
import { resolvePostPin } from './postPinCelebration';
import {
  hasShownShareExtensionTip,
  markShareExtensionTipShown,
} from '../utils/shareExtensionTipFlag';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ExtractConfirm'>;
type Rt = RouteProp<RootStackParamList, 'ExtractConfirm'>;

export default function ExtractConfirmScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { user } = useAuth();
  const { extracted, screenshotUri, screenshotMediaType } = route.params;

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation via Mapbox: server-side geocoding already ran in the extract fn.
  // If lat/lng are non-null AND we have a name, we consider this a validated place.
  const validated =
    extracted.name != null &&
    extracted.lat != null &&
    extracted.lng != null;

  const handleConfirm = async () => {
    if (!user || !validated) return;
    setSaving(true);
    setError(null);
    try {
      // Read the pre-save state that feeds the post-pin celebration resolver
      // (GitHub #80). We read BEFORE `createLieu` so the count reflects "how
      // many pins did this user have before this save", which is what
      // `resolvePostPin` is documented to take. A fail here shouldn't block
      // the save itself — degrade to "not the first pin, tip already seen"
      // so we never spam the tip on a broken read.
      let pinsCountBeforeSave = 1;
      let tipAlreadyShown = true;
      try {
        const [existing, alreadyShown] = await Promise.all([
          getLieuxService().getAllLieux(user.uid),
          hasShownShareExtensionTip(),
        ]);
        pinsCountBeforeSave = existing.length;
        tipAlreadyShown = alreadyShown;
      } catch (readErr) {
        console.warn('[ExtractConfirmScreen] post-pin state read failed', readErr);
      }

      const created = await getLieuxService().createLieu(user.uid, {
        name: extracted.name!,
        city: extracted.city ?? '',
        country: extracted.country ?? '',
        address: extracted.addressCanonical ?? extracted.address ?? '',
        lat: extracted.lat!,
        lng: extracted.lng!,
        category: extracted.category ?? 'autre',
        description: extracted.description,
        sourceAuthor: extracted.sourceAuthor,
        userNotes: notes.trim() || null,
        screenshotUri,
        screenshotMediaType,
      });

      const verdict = resolvePostPin({
        pinsCountBeforeSave,
        hasShownShareExtensionTip: tipAlreadyShown,
      });
      // Persist the one-shot flag NOW, before we hand off to the Map — that
      // way even a crash on the Map render can't cause a duplicate tip on the
      // next save. The Map screen still reads the nav param to decide whether
      // to actually render the tip pill for this transition.
      if (verdict.showShareTip) {
        await markShareExtensionTipShown();
      }

      // Land the user on the Map tab with the freshly-created pin in view,
      // and pass the toast/tip flags so the Map can render them non-blocking.
      nav.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: {
              screen: 'Map',
              params: {
                focusLieuId: created.id,
                showPinAddedToast: verdict.showToast,
                showShareExtensionTip: verdict.showShareTip,
              },
            },
          },
        ],
      });
    } catch (err) {
      console.error('[ExtractConfirmScreen] save failed', err);
      const e = err as { message?: string; code?: string };
      setError(`Sauvegarde foirée : ${e?.message || e?.code || 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = () => {
    nav.goBack();
  };

  if (!validated) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.rejectHero}>
            <Ionicons name="alert-circle-outline" size={56} color={colors.error} />
            <Text style={styles.eyebrow}>Nº 000 · impossible</Text>
            <Text style={styles.title}>On voit pas le lieu</Text>
            <Text style={styles.subtitle}>
              {extracted.name == null
                ? "On a pas repéré de reco de lieu là-dedans."
                : `On a pas pu poser "${extracted.name}" sur la carte.`}
            </Text>
            <Text style={styles.subtitle}>
              Essaie un autre screenshot qui montre bien le nom et la ville.
            </Text>
          </View>
          <Pressable style={styles.primaryBtn} onPress={handleReject}>
            <Text style={styles.primaryLabel}>Essayer un autre</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const catColor = categoryColor(extracted.category ?? 'autre');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Nº · lieu identifié</Text>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.catDot, { backgroundColor: catColor }]} />
              {extracted.category && (
                <Text style={[styles.catLabel, { color: catColor }]}>{extracted.category}</Text>
              )}
            </View>
            <Text style={styles.name}>{extracted.name}</Text>
            <View style={styles.row}>
              <Ionicons name="location-outline" size={14} color={colors.graphite} />
              <Text style={styles.rowText}>
                {extracted.addressCanonical ?? extracted.address}
              </Text>
            </View>
            {extracted.city && (
              <View style={styles.row}>
                <Ionicons name="business-outline" size={14} color={colors.graphite} />
                <Text style={styles.rowText}>
                  {[extracted.city, extracted.country].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}
            {extracted.description && (
              <Text style={styles.description}>« {extracted.description} »</Text>
            )}
            {extracted.sourceAuthor && (
              <Text style={styles.attribution}>@{extracted.sourceAuthor}</Text>
            )}
          </View>

          <Text style={styles.label}>Tes notes (facultatif)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Réserver, y aller le vendredi soir, viser la banquette du fond…"
            placeholderTextColor={colors.graphite}
            multiline
            style={[styles.input, styles.inputMultiline]}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={handleReject} disabled={saving}>
              <Text style={styles.secondaryLabel}>Rejeter</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryBtn,
                { flex: 1 },
                { backgroundColor: pressed ? colors.accentDim : colors.catResto },
                saving && { opacity: 0.5 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.paper} />
              ) : (
                <Text style={styles.primaryLabel}>Confirmer</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  eyebrow: {
    ...type.monoSm,
    color: colors.graphite,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.hair,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  catLabel: {
    ...type.monoSm,
    fontWeight: '700',
  },
  name: { ...type.h1, color: colors.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowText: { ...type.mono, color: colors.graphite, flex: 1, textTransform: 'none', letterSpacing: 0.4 },
  description: {
    ...type.serif,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  attribution: {
    ...type.monoSm,
    color: colors.graphite,
    marginTop: spacing.sm,
  },
  label: {
    ...type.monoSm,
    color: colors.graphite,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  inputMultiline: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  primaryBtn: {
    height: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.catResto,
    paddingHorizontal: spacing.xl,
  },
  primaryLabel: { ...type.mono, color: colors.paper, fontWeight: '700' },
  secondaryBtn: {
    height: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  secondaryLabel: { ...type.mono, color: colors.ink, fontWeight: '700' },
  rejectHero: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.lg,
  },
  title: { ...type.h1, color: colors.ink, textAlign: 'center' },
  subtitle: {
    ...type.serif,
    color: colors.graphite,
    textAlign: 'center',
  },
  error: { ...type.caption, color: colors.error, marginTop: spacing.md, textAlign: 'center' },
});
