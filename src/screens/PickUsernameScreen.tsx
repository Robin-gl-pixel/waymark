import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSocialService } from '../services/socialService';
import { RESERVED_USERNAMES, USERNAME_REGEX } from '../services/firebaseSocialService';
import { colors, radius, spacing, type } from '../theme';

type Availability =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'error'; reason: string };

interface Props {
  onComplete: () => void;
}

export default function PickUsernameScreen({ onComplete }: Props) {
  const [value, setValue] = useState('');
  const [availability, setAvailability] = useState<Availability>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const normalized = useMemo(() => value.trim().toLowerCase().replace(/^@/, ''), [value]);

  const validate = useCallback((uname: string): Availability | null => {
    if (uname.length === 0) return { kind: 'idle' };
    if (!USERNAME_REGEX.test(uname)) {
      return {
        kind: 'invalid',
        reason: '3 à 20 caractères — lettres, chiffres, . ou _',
      };
    }
    if (RESERVED_USERNAMES.has(uname)) {
      return { kind: 'invalid', reason: 'Ce nom est réservé' };
    }
    return null;
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const localFail = validate(normalized);
    if (localFail) {
      setAvailability(localFail);
      return;
    }
    setAvailability({ kind: 'checking' });
    const mySeq = ++requestSeq.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const existing = await getSocialService().getUserByUsername(normalized);
        if (mySeq !== requestSeq.current) return;
        setAvailability(existing ? { kind: 'taken' } : { kind: 'available' });
      } catch (err) {
        if (mySeq !== requestSeq.current) return;
        console.warn('[PickUsername] availability check failed', err);
        // Availability check failure is non-blocking — the transaction on submit
        // is the source of truth. Keep the CTA enabled.
        setAvailability({ kind: 'idle' });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [normalized, validate]);

  const canSubmit =
    !submitting &&
    normalized.length > 0 &&
    availability.kind !== 'invalid' &&
    availability.kind !== 'taken' &&
    availability.kind !== 'checking';

  const submit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await getSocialService().upsertProfile({ username: normalized });
      onComplete();
    } catch (err) {
      // Log the raw error so dev can see the Firebase error code in the console.
      // Without this we'd fall back to the generic "Erreur. Réessaie." for
      // every unmapped case, hiding the real cause (permission-denied is by
      // far the most common — deployment of firestore.rules pending).
      console.error('[PickUsername] upsertProfile failed', err);
      const msg = (err as Error | null)?.message ?? 'Erreur inconnue';
      const code = (err as { code?: string } | null)?.code ?? '';
      setSubmitError(mapErrorToFrench(msg, code));
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Choisis ton @</Text>
          <Text style={styles.subtitle}>
            C'est comme ça que tes amis vont te trouver sur Amble.
          </Text>
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="tonpseudo"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            value={value}
            onChangeText={setValue}
            editable={!submitting}
            returnKeyType="done"
            onSubmitEditing={() => { if (canSubmit) submit(); }}
          />
        </View>

        <StatusLine availability={availability} error={submitError} />

        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            disabled={!canSubmit}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.ctaLabel}>Continuer</Text>
            )}
          </Pressable>
          <Text style={styles.rules}>
            3 à 20 caractères. Lettres, chiffres, . ou _.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatusLine({ availability, error }: { availability: Availability; error: string | null }) {
  if (error) return <Text style={styles.errorText}>{error}</Text>;
  switch (availability.kind) {
    case 'idle':
      return <View style={styles.statusPlaceholder} />;
    case 'checking':
      return <Text style={styles.checkingText}>Vérification…</Text>;
    case 'available':
      return <Text style={styles.availableText}>Disponible</Text>;
    case 'taken':
      return <Text style={styles.errorText}>Déjà pris</Text>;
    case 'invalid':
      return <Text style={styles.errorText}>{availability.reason}</Text>;
    case 'error':
      return <Text style={styles.errorText}>{availability.reason}</Text>;
  }
}

function mapErrorToFrench(msg: string, code: string = ''): string {
  if (msg.includes('Username already taken')) return 'Ce pseudo est déjà pris.';
  if (msg.includes('Invalid username format')) return 'Format invalide.';
  if (msg.includes('reserved')) return 'Ce nom est réservé.';
  if (msg.includes('cooldown')) return 'Tu ne peux pas changer de pseudo aussi souvent.';
  if (msg.includes('Not signed in')) return 'Connexion perdue. Reconnecte-toi.';
  // Firestore permission-denied is the #1 unmapped cause — usually because
  // firestore.rules haven't been deployed yet on a fresh Firebase project.
  if (code === 'permission-denied' || msg.toLowerCase().includes('permission')) {
    return __DEV__
      ? 'Permission Firestore refusée. Déploie les règles : firebase deploy --only firestore:rules'
      : 'Problème de connexion. Réessaie dans un instant.';
  }
  if (msg.toLowerCase().includes('network') || code === 'unavailable') {
    return 'Pas de connexion. Vérifie ta connexion internet.';
  }
  return __DEV__ ? `Erreur : ${msg.slice(0, 100)}` : 'Erreur. Réessaie.';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing['2xl'],
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  at: {
    ...type.h2,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  input: {
    ...type.h2,
    color: colors.text,
    flex: 1,
    padding: 0,
  },
  statusPlaceholder: { height: 20, marginTop: spacing.md, marginHorizontal: spacing['2xl'] },
  checkingText: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginHorizontal: spacing['2xl'],
  },
  availableText: {
    ...type.caption,
    color: colors.accent,
    marginTop: spacing.md,
    marginHorizontal: spacing['2xl'],
  },
  errorText: {
    ...type.caption,
    color: colors.error,
    marginTop: spacing.md,
    marginHorizontal: spacing['2xl'],
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.bgElevated },
  ctaLabel: { ...type.h3, color: colors.bg, fontWeight: '700' },
  rules: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
