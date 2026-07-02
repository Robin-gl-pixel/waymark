import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSocialService } from '../services/socialService';
import { REPORT_FREETEXT_MAX_LENGTH } from '../services/firebaseSocialService';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';
import type { ReportReason } from '../types/User';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Report'>;
type Rt = RouteProp<RootStackParamList, 'Report'>;

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: 'spam', label: 'Spam', hint: 'Publicités, contenu répétitif, faux comptes' },
  { value: 'offensif', label: 'Offensif', hint: 'Haine, harcèlement, contenu explicite' },
  { value: 'faux', label: 'Faux', hint: 'Lieu inexistant, informations trompeuses' },
];

export default function ReportScreen() {
  const nav = useNavigation<Nav>();
  const { targetUid, targetLieuId } = useRoute<Rt>().params;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) {
      Alert.alert('Choisis une raison', 'Sélectionne une des trois options avant d\'envoyer.');
      return;
    }
    setSubmitting(true);
    try {
      await getSocialService().report({
        targetUid,
        targetLieuId,
        reason,
        freeText: freeText.trim() || undefined,
      });
      Alert.alert(
        'Merci',
        'Ton signalement a été transmis. Un membre de l\'équipe le review.',
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Envoi échoué. Réessaie.');
      setSubmitting(false);
    }
  };

  const remaining = REPORT_FREETEXT_MAX_LENGTH - freeText.length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Signaler</Text>
        <Text style={styles.subtitle}>Choisis la raison qui décrit le mieux le problème.</Text>

        <View style={styles.options}>
          {REASONS.map((r) => {
            const selected = reason === r.value;
            return (
              <Pressable
                key={r.value}
                onPress={() => setReason(r.value)}
                style={[styles.option, selected && styles.optionSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Détails (optionnel)</Text>
        <TextInput
          value={freeText}
          onChangeText={(t) => setFreeText(t.slice(0, REPORT_FREETEXT_MAX_LENGTH))}
          placeholder="Ajoute du contexte pour aider le review…"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={REPORT_FREETEXT_MAX_LENGTH}
          style={styles.textArea}
        />
        <Text style={styles.counter}>{remaining} caractères restants</Text>

        <Pressable
          onPress={submit}
          disabled={submitting || !reason}
          style={({ pressed }) => [
            styles.submitBtn,
            (!reason || submitting) && styles.submitBtnDisabled,
            pressed && !submitting && reason && { backgroundColor: colors.accentDim },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.submitLabel}>Envoyer le signalement</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing['2xl'] },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm },
  options: { marginTop: spacing.xl, gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.accent },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.accent },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  optionText: { flex: 1 },
  optionLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  optionHint: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xs },
  label: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing['2xl'],
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textArea: {
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
  counter: {
    ...type.micro,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  submitBtn: {
    marginTop: spacing['2xl'],
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.bgElevated },
  submitLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
});
