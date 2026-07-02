import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { getAuthService } from '../services/authService';
import { colors, spacing, type } from '../theme';

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
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setError('Connexion Apple échouée. Réessayez.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <Text style={styles.wordmark}>Waymark</Text>
        <Text style={styles.tagline}>Vos recos Insta,</Text>
        <Text style={styles.tagline}>sur une carte.</Text>
      </View>

      <View style={styles.body}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={28}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          )
        )}

        <Text style={styles.legal}>
          En continuant, tu acceptes les conditions d'utilisation et la politique de confidentialité.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  wordmark: {
    ...type.display,
    color: colors.text,
    fontWeight: '800',
    marginBottom: spacing.xl,
  },
  tagline: {
    ...type.h2,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  body: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  appleBtn: {
    height: 56,
    width: '100%',
  },
  errorText: {
    ...type.caption,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  legal: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
