import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { exchangeAuthorizationCode, AppleAuthConfig } from './lib/apple';

const APPLE_TEAM_ID = defineSecret('APPLE_TEAM_ID');
const APPLE_KEY_ID = defineSecret('APPLE_KEY_ID');
const APPLE_CLIENT_ID = defineSecret('APPLE_CLIENT_ID');
const APPLE_PRIVATE_KEY = defineSecret('APPLE_PRIVATE_KEY');

/**
 * Called by the app immediately after Apple sign-in with the `authorizationCode`
 * returned by AppleAuthentication.signInAsync. We exchange it for a refresh token
 * and stash the token in `/appleAuth/{uid}` — a top-level collection that Firestore
 * rules deny to all clients (default-deny), so only Admin SDK / Cloud Functions
 * can read it.
 *
 * This token is used later by `deleteAccount` to call Apple's /auth/revoke and
 * satisfy App Store guideline 5.1.1(v).
 */
export const exchangeAppleCode = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 30,
    secrets: [APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY],
  },
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

    const authorizationCode = request.data?.authorizationCode;
    if (typeof authorizationCode !== 'string' || !authorizationCode) {
      throw new HttpsError('invalid-argument', 'authorizationCode is required.');
    }

    const cfg: AppleAuthConfig = {
      teamId: APPLE_TEAM_ID.value(),
      keyId: APPLE_KEY_ID.value(),
      clientId: APPLE_CLIENT_ID.value(),
      privateKey: APPLE_PRIVATE_KEY.value(),
    };

    let refreshToken: string;
    try {
      ({ refreshToken } = await exchangeAuthorizationCode(cfg, authorizationCode));
    } catch (err) {
      console.error('[exchangeAppleCode] Apple exchange failed', err);
      throw new HttpsError('internal', 'Apple token exchange failed.');
    }

    await getFirestore().doc(`appleAuth/${uid}`).set(
      {
        refreshToken,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return { ok: true };
  },
);
