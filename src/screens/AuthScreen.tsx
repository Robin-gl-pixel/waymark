import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { getAuthService } from '../services/authService';
import { colors, spacing, type, radius } from '../theme';

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleAppleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const rawNonce =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!appleCredential.identityToken) throw new Error('Pas de token Apple');

      const authService = getAuthService();
      const signedIn = await authService.signInWithApple(appleCredential.identityToken, rawNonce);

      // Apple only returns fullName on FIRST sign-in for this user. Persist it now or lose it forever.
      const fullName = appleCredential.fullName;
      if (fullName && (fullName.givenName || fullName.familyName)) {
        const displayName = [fullName.givenName, fullName.familyName]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (displayName && signedIn.displayName !== displayName) {
          await authService.updateDisplayName(displayName);
        }
      }

      // Forward the one-shot authorizationCode to the backend so it can be exchanged
      // for a refresh token stored server-side. Required for App Store guideline
      // 5.1.1(v) — deleteAccount uses that token to revoke the Apple credential.
      // Non-fatal: sign-in still succeeds if this fails; the user just won't have
      // Apple credential revocation on delete (logged for follow-up).
      if (appleCredential.authorizationCode) {
        authService
          .exchangeAppleAuthorizationCode(appleCredential.authorizationCode)
          .catch((err) => console.warn('[AuthScreen] exchangeAppleCode failed', err));
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? '';
      const msg = (err as { message?: string } | null)?.message ?? '';
      // ERR_REQUEST_CANCELED = user tapped Cancel on the Apple sheet; not an error.
      if (code === 'ERR_REQUEST_CANCELED') {
        setLoading(false);
        return;
      }
      console.error('[AuthScreen] Apple sign-in failed', { code, msg, err });
      // Actionable messages for the most common failure modes.
      if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        setError(__DEV__
          ? 'Apple provider non activé. Firebase Console → Authentication → Sign-in method → Apple.'
          : 'Connexion Apple pas dispo. Réessaie plus tard.');
      } else if (code === 'auth/invalid-credential' || msg.includes('invalid')) {
        setError(__DEV__
          ? `Token Apple refusé par Firebase. code=${code}`
          : 'Connexion Apple foirée. Réessaie.');
      } else if (code === 'auth/network-request-failed' || msg.toLowerCase().includes('network')) {
        setError('Pas de réseau. Check ta co et réessaie.');
      } else if (msg.includes('Pas de token Apple')) {
        setError("Apple a rien renvoyé. Réessaie ou check iCloud dans Réglages.");
      } else {
        setError(__DEV__
          ? `Erreur Apple : ${code || msg.slice(0, 80) || 'inconnue'}`
          : 'Connexion Apple foirée. Réessaie.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = async () => {
    setError(null);
    setLoading(true);
    try {
      await getAuthService().signInAnonymouslyDev();
    } catch (err) {
      console.warn('[AuthScreen] dev bypass failed', err);
      setError('Dev bypass foiré — active Anonymous auth dans Firebase Console.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Nº 001</Text>
        <Text style={styles.wordmark}>Waymark</Text>
        <Text style={styles.tagline}>« Tes recos Insta,</Text>
        <Text style={styles.tagline}>sur une carte. »</Text>
      </View>

      <View style={styles.body}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={colors.ink} size="large" />
        ) : (
          <>
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={4}
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
              />
            )}
            {__DEV__ && (
              <Pressable style={styles.devBtn} onPress={handleDevBypass}>
                <Text style={styles.devBtnText}>Skip (dev anonymous sign-in)</Text>
              </Pressable>
            )}
          </>
        )}

        <Text style={styles.legal}>
          En continuant, t'acceptes les CGU et la politique de confidentialité.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.sm,
  },
  eyebrow: {
    ...type.monoSm,
    color: colors.graphite,
    marginBottom: spacing.md,
  },
  wordmark: {
    ...type.displayLg,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  tagline: {
    ...type.serif,
    color: colors.graphite,
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  appleBtn: {
    height: 56,
    width: '100%',
  },
  devBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
  },
  devBtnText: {
    ...type.mono,
    color: colors.ink,
  },
  errorText: {
    ...type.caption,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  legal: {
    ...type.micro,
    color: colors.graphite,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
