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
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';
import type { LieuCategory } from '../types/Lieu';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ExtractConfirm'>;
type Rt = RouteProp<RootStackParamList, 'ExtractConfirm'>;

const CATEGORIES: LieuCategory[] = ['resto', 'bar', 'café', 'activité', 'musée', 'hôtel', 'autre'];

export default function ExtractConfirmScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { user } = useAuth();
  const { extracted, screenshotBase64, screenshotMediaType } = route.params;

  // Editable fields, seeded from extraction. Nulls become empty strings for the UI.
  const [name, setName] = useState(extracted.name ?? '');
  const [city, setCity] = useState(extracted.city ?? '');
  const [country, setCountry] = useState(extracted.country ?? 'France');
  const [address, setAddress] = useState(extracted.addressCanonical ?? extracted.address ?? '');
  const [category, setCategory] = useState<LieuCategory>(extracted.category ?? 'resto');
  const [description] = useState<string | null>(extracted.description);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && city.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!user) {
      setError('Session expirée.');
      return;
    }
    if (extracted.lat == null || extracted.lng == null) {
      setError('Adresse non géocodée. Modifie le nom ou la ville et réessaie.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await getLieuxService().createLieu(user.uid, {
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        address: address.trim(),
        lat: extracted.lat,
        lng: extracted.lng,
        category,
        description,
        sourceAuthor: extracted.sourceAuthor,
        userNotes: notes.trim() || null,
        screenshotBase64,
        screenshotMediaType,
      });
      // After save, drop back to the tabs — user lands on the currently-focused tab (typically Map or List).
      nav.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err) {
      console.error(err);
      setError("Sauvegarde échouée. Vérifie ta connexion et réessaie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Vérifier le lieu</Text>
          <Text style={styles.subtitle}>Corrige si Claude s'est trompé.</Text>

          <Field label="Nom" value={name} onChange={setName} placeholder="Chez Janou" />
          <Field label="Ville" value={city} onChange={setCity} placeholder="Paris" />
          <Field label="Pays" value={country} onChange={setCountry} placeholder="France" />
          <Field label="Adresse" value={address} onChange={setAddress} placeholder="2 Rue Roger Verlomme, 75003" multiline />

          <Text style={styles.label}>Catégorie</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, category === c && styles.chipLabelActive]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>

          <Field
            label="Tes notes (facultatif)"
            value={notes}
            onChange={setNotes}
            placeholder="Réserver à l'avance, y aller le vendredi soir…"
            multiline
          />

          {extracted.sourceAuthor && (
            <Text style={styles.attribution}>Reco de @{extracted.sourceAuthor}</Text>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: pressed ? colors.accentDim : colors.accent },
              !canSave && { opacity: 0.4 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.saveLabel}>Enregistrer</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  fieldGroup: { marginBottom: spacing.lg },
  label: {
    ...type.caption,
    color: colors.textSecondary,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { ...type.caption, color: colors.textSecondary },
  chipLabelActive: { color: colors.text, fontWeight: '600' },
  attribution: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  error: { ...type.caption, color: colors.error, marginTop: spacing.md, textAlign: 'center' },
  saveBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  saveLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
});
