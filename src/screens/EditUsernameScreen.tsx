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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSocialService } from '../services/socialService';
import {
  RESERVED_USERNAMES,
  USERNAME_CHANGE_COOLDOWN_MS,
  USERNAME_REGEX,
} from '../services/firebaseSocialService';
import { colors, radius, spacing, type } from '../theme';
import type { RootStackParamList } from '../navigation';

type Availability =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'unchanged' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'error'; reason: string };

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Rename flow for an existing account. Behaves like PickUsernameScreen but:
 * - Loads the current username via `getMyProfile()` and pre-fills the input.
 * - If the last rename was within `USERNAME_CHANGE_COOLDOWN_MS`, the input is
 *   locked and we show the earliest allowed next-change date. The cooldown is
 *   ALSO enforced server-side in `upsertProfile` — this UI is just so the user
 *   understands the wait rather than hitting a raw error.
 * - On success, pops back to whatever pushed this screen (Settings).
 */
export default function EditUsernameScreen() {
  const nav = useNavigation<Nav>();
  const [value, setValue] = useState('');
  const [originalUsername, setOriginalUsername] = useState<string>('');
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<Availability>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const normalized = useMemo(() => value.trim().toLowerCase().replace(/^@/, ''), [value]);

  // Load current profile → pre-fill + compute cooldown window.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getSocialService().getMyProfile();
        if (cancelled) return;
        if (me) {
          setOriginalUsername(me.username);
          setValue(me.username);
          if (me.usernameChangedAt) {
            const nextAllowed = me.usernameChangedAt.toMillis() + USERNAME_CHANGE_COOLDOWN_MS;
            if (nextAllowed > Date.now()) setCooldownUntil(new Date(nextAllowed));
          }
        }
      } catch (err) {
        console.warn('[EditUsername] load failed', err);
        setSubmitError('Impossible de charger ton profil.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    // Same as their current username → nothing to check, nothing to submit.
    if (normalized === originalUsername && normalized.length > 0) {
      setAvailability({ kind: 'unchanged' });
      return;
    }
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
        console.warn('[EditUsername] availability check failed', err);
        // Non-blocking — the transaction on submit is the source of truth.
        setAvailability({ kind: 'idle' });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [normalized, originalUsername, validate]);

  const inCooldown = cooldownUntil !== null;

  const canSubmit =
    !submitting &&
    !inCooldown &&
    normalized.length > 0 &&
    normalized !== originalUsername &&
    availability.kind !== 'invalid' &&
    availability.kind !== 'taken' &&
    availability.kind !== 'checking' &&
    availability.kind !== 'unchanged';

  const submit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await getSocialService().upsertProfile({ username: normalized });
      nav.goBack();
    } catch (err) {
      const msg = (err as Error | null)?.message ?? 'Erreur inconnue';
      setSubmitError(mapErrorToFrench(msg));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Changer ton @</Text>
          <Text style={styles.subtitle}>
            Ton nouveau pseudo apparaîtra partout — profil, feed, recherche.
          </Text>
        </View>

        <View style={[styles.inputRow, inCooldown && styles.inputRowDisabled]}>
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
            editable={!submitting && !inCooldown}
            returnKeyType="done"
            onSubmitEditing={() => { if (canSubmit) submit(); }}
          />
        </View>

        {inCooldown ? (
          <Text style={styles.cooldownText}>
            Prochain changement possible le {formatDate(cooldownUntil!)}.
          </Text>
        ) : (
          <StatusLine availability={availability} error={submitError} />
        )}

        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            disabled={!canSubmit}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.ctaLabel}>Enregistrer</Text>
            )}
          </Pressable>
          <Text style={styles.rules}>
            3 à 20 caractères. Lettres, chiffres, . ou _. Changement possible tous les 30 jours.
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
    case 'unchanged':
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

function mapErrorToFrench(msg: string): string {
  if (msg.includes('Username already taken')) return 'Ce pseudo est déjà pris.';
  if (msg.includes('Invalid username format')) return 'Format invalide.';
  if (msg.includes('reserved')) return 'Ce nom est réservé.';
  if (msg.includes('cooldown')) return 'Tu ne peux changer de pseudo que tous les 30 jours.';
  if (msg.includes('Not signed in')) return 'Connexion perdue. Reconnecte-toi.';
  return 'Erreur. Réessaie.';
}

function formatDate(d: Date): string {
  // French locale date, e.g. "12 août 2026".
  try {
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d.toDateString();
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  inputRowDisabled: { opacity: 0.5 },
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
  cooldownText: {
    ...type.caption,
    color: colors.textSecondary,
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
