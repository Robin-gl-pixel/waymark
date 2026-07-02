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
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

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
      // Land the user on the Map tab with the freshly-created pin in view.
      nav.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: { screen: 'Map', params: { focusLieuId: created.id } },
          },
        ],
      });
    } catch (err) {
      console.error('[ExtractConfirmScreen] save failed', err);
      const e = err as { message?: string; code?: string };
      setError(`Sauvegarde échouée: ${e?.message || e?.code || 'unknown'}`);
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
            <Ionicons name="alert-circle" size={64} color={colors.error} />
            <Text style={styles.title}>Impossible d'identifier ce lieu</Text>
            <Text style={styles.subtitle}>
              {extracted.name == null
                ? "On n'a pas reconnu de recommandation de lieu dans ce screenshot."
                : `On n'a pas pu localiser "${extracted.name}" sur la carte.`}
            </Text>
            <Text style={styles.subtitle}>
              Essaie avec un autre screenshot qui montre clairement le nom et la ville.
            </Text>
          </View>
          <Pressable style={styles.primaryBtn} onPress={handleReject}>
            <Text style={styles.primaryLabel}>Essayer un autre screenshot</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Ionicons name="checkmark-circle" size={28} color={colors.accent} />
            <Text style={styles.headerTitle}>Lieu identifié</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.name}>{extracted.name}</Text>
            {extracted.category && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{extracted.category}</Text>
              </View>
            )}
            <View style={styles.row}>
              <Ionicons name="location" size={16} color={colors.textSecondary} />
              <Text style={styles.rowText}>
                {extracted.addressCanonical ?? extracted.address}
              </Text>
            </View>
            {extracted.city && (
              <View style={styles.row}>
                <Ionicons name="business" size={16} color={colors.textSecondary} />
                <Text style={styles.rowText}>
                  {[extracted.city, extracted.country].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}
            {extracted.description && (
              <Text style={styles.description}>{extracted.description}</Text>
            )}
            {extracted.sourceAuthor && (
              <Text style={styles.attribution}>Reco de @{extracted.sourceAuthor}</Text>
            )}
          </View>

          <Text style={styles.label}>Tes notes (facultatif)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Réserver à l'avance, y aller le vendredi soir…"
            placeholderTextColor={colors.textTertiary}
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
                { backgroundColor: pressed ? colors.accentDim : colors.accent },
                saving && { opacity: 0.5 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.text} />
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
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  headerTitle: { ...type.h2, color: colors.text, fontWeight: '700' },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  name: { ...type.h1, color: colors.text, fontWeight: '700' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDim,
  },
  badgeText: { ...type.caption, color: colors.text, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowText: { ...type.body, color: colors.textSecondary, flex: 1 },
  description: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  attribution: {
    ...type.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  label: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  primaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
  },
  primaryLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  secondaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryLabel: { ...type.body, color: colors.textSecondary },
  rejectHero: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.lg,
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: { ...type.caption, color: colors.error, marginTop: spacing.md, textAlign: 'center' },
});
