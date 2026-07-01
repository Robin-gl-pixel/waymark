import jwt from 'jsonwebtoken';

/**
 * Apple Sign In server-to-server helpers.
 *
 * Ref: https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 *
 * Required config (all set as Firebase secrets — bound to callers via `secrets: [...]`):
 *   APPLE_TEAM_ID      — 10-char team ID from developer.apple.com
 *   APPLE_KEY_ID       — 10-char key ID of the Sign In With Apple key
 *   APPLE_CLIENT_ID    — the app's bundle identifier (native app flow)
 *   APPLE_PRIVATE_KEY  — full contents of the .p8 file, including BEGIN/END lines
 *
 * The private key must be an ES256 key issued by Apple for the Sign In With Apple capability.
 */

export interface AppleAuthConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
}

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const CLIENT_SECRET_TTL_SECONDS = 60 * 5;

/**
 * Sign the JWT that Apple accepts as `client_secret` on token/revoke endpoints.
 * Short-lived (5 min) — generated fresh per request so we never persist it.
 */
export function makeClientSecret(cfg: AppleAuthConfig): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: cfg.teamId,
      iat: now,
      exp: now + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: cfg.clientId,
    },
    cfg.privateKey,
    { algorithm: 'ES256', keyid: cfg.keyId },
  );
}

interface AppleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * Exchange a one-time `authorizationCode` (returned by AppleAuthentication.signInAsync
 * on the client) for a long-lived refresh token. The code is single-use and expires
 * in ~5 minutes, so this MUST be called immediately after sign-in.
 */
export async function exchangeAuthorizationCode(
  cfg: AppleAuthConfig,
  authorizationCode: string,
): Promise<{ refreshToken: string }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: makeClientSecret(cfg),
    code: authorizationCode,
    grant_type: 'authorization_code',
  });
  const res = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await res.json()) as AppleTokenResponse;
  if (!res.ok || !data.refresh_token) {
    throw new Error(
      `Apple token exchange failed (${res.status}): ${data.error ?? 'unknown'} ${data.error_description ?? ''}`.trim(),
    );
  }
  return { refreshToken: data.refresh_token };
}

/**
 * Revoke a previously-issued refresh token. This is the call Apple guideline 5.1.1(v)
 * mandates on account deletion — it invalidates the Sign In With Apple credential so
 * the user isn't silently kept in Apple's "apps using your Apple ID" list.
 *
 * We swallow non-2xx here on purpose (the caller logs and continues to delete):
 * if Apple already invalidated the token (e.g. user hit "Stop using Apple ID" first),
 * we shouldn't block the account deletion the user just asked for.
 */
export async function revokeRefreshToken(
  cfg: AppleAuthConfig,
  refreshToken: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: makeClientSecret(cfg),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  const res = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (res.ok) return { ok: true, status: res.status };
  let error: string | undefined;
  try {
    const data = (await res.json()) as AppleTokenResponse;
    error = data.error_description ?? data.error;
  } catch {
    // ignore — Apple sometimes returns empty bodies on revoke
  }
  return { ok: false, status: res.status, error };
}
