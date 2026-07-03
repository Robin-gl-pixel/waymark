import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { extractPlaceFromScreenshot, ExtractedFromVision } from './lib/claude';
import { orchestrateGeocode } from './lib/geocode';
import { normalizeName } from './lib/normalize';

/**
 * Length of a valid Shortcut token in rendered lowercase-hex form.
 * Mirrors `SHORTCUT_TOKEN_HEX_LENGTH` in `src/services/firebaseSocialService.ts`
 * (32 bytes × 2 hex chars = 64) — kept as a local constant so this file has
 * no dependency on the RN codebase.
 */
export const SHORTCUT_TOKEN_HEX_LENGTH = 64;

/** Guard against JSON payloads whose base64 image bloats past ~8MB. */
const MAX_IMAGE_BASE64_LENGTH = 12_000_000;

/**
 * Extract the Bearer token from an `Authorization` header. Returns `null`
 * when the header is missing, malformed, or the token isn't exactly the
 * expected hex length — a hard shape check before we even hit Firestore.
 *
 * Exported for the unit test.
 */
export function parseBearerToken(headerValue: string | undefined | string[]): string | null {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+([a-f0-9]+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (token.length !== SHORTCUT_TOKEN_HEX_LENGTH) return null;
  return token;
}

/**
 * Look up a user by their Shortcut token.
 *
 * Uses `users.where('shortcutToken', '==', token).limit(1)`. Firestore
 * single-field indexes are automatic, so no manual index is required.
 * Returns the owning uid or `null` if no user matches.
 *
 * Split out of the handler so tests can inject a fake Firestore.
 */
export async function findUserByShortcutToken(
  db: admin.firestore.Firestore,
  token: string,
): Promise<string | null> {
  const snap = await db
    .collection('users')
    .where('shortcutToken', '==', token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * HTTPS endpoint powering the iOS Shortcut integration (#7).
 *
 * Contract:
 *   POST /extractFromShortcut
 *   Content-Type: application/json
 *   Authorization: Bearer <64-hex-char shortcut token>
 *   Body: { "imageBase64": "...", "mediaType"?: "image/png" | "image/jpeg" | "image/webp" }
 *   Response 200: { "ok": true, "lieuId": "…", "name": "…" }
 *   Response 401: { "error": "Invalid token" }
 *   Response 400: { "error": "<reason>" }
 *
 * We can't use `onCall` here because iOS Shortcuts can't produce a Firebase
 * ID token — the whole point of the token is to authenticate a caller that
 * never opened the app. Auth is bounce-checked in-line: shape → Firestore
 * lookup → uid attached, then the standard vision + geocode pipeline runs.
 *
 * Unlike `extract`, this endpoint WRITES the Firestore doc itself — no
 * confirmation screen in this flow (AC bullet 3). The lieu lands directly at
 * `/users/{uid}/lieux/{lieuId}`, indistinguishable from a normal upload once
 * the user opens the app.
 *
 * The Shortcut is expected to base64-encode the image before POSTing (the
 * iCloud Shortcut we publish does exactly that via "Base64 Encode" →
 * "Get Contents of URL"). JSON is the primary body shape here rather than
 * multipart because writing a robust binary-safe multipart parser without a
 * dependency is disproportionate to the ergonomic win.
 */
export const extractFromShortcut = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: ['ANTHROPIC_API_KEY', 'MAPBOX_SECRET_TOKEN', 'GOOGLE_PLACES_API_KEY'],
    cors: false,
  },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: 'Missing or malformed Authorization: Bearer <token>.' });
      return;
    }

    const db = admin.firestore();
    const uid = await findUserByShortcutToken(db, token);
    if (!uid) {
      // Deliberately vague on failure — don't leak whether the token shape was
      // valid but unknown vs. valid but revoked. Both look identical.
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }

    const body = (req.body ?? {}) as {
      imageBase64?: unknown;
      mediaType?: unknown;
    };
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : null;
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 is required (base64-encoded image).' });
      return;
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      res.status(400).json({ error: 'Image too large (>8MB base64).' });
      return;
    }
    const rawMediaType = typeof body.mediaType === 'string' ? body.mediaType : 'image/png';
    if (rawMediaType !== 'image/png' && rawMediaType !== 'image/jpeg' && rawMediaType !== 'image/webp') {
      res.status(400).json({ error: 'mediaType must be image/png, image/jpeg, or image/webp.' });
      return;
    }
    const mediaType: 'image/png' | 'image/jpeg' | 'image/webp' = rawMediaType;

    let vision: ExtractedFromVision;
    try {
      vision = await extractPlaceFromScreenshot(imageBase64, mediaType, null);
    } catch (err) {
      console.error('[extractFromShortcut] vision failed', err);
      res.status(500).json({ error: 'Extraction visuelle échouée.' });
      return;
    }

    if (!vision.name) {
      // Same honesty as `extract`: a shot that Claude can't parse yields a null
      // name. We refuse to persist a nameless pin — the Shortcut surfaces the
      // 422 to the user as an iOS notification, so they know why nothing showed
      // up on their map.
      res.status(422).json({
        error: 'Aucun lieu détecté dans cette image.',
        vision,
      });
      return;
    }

    let geo: Awaited<ReturnType<typeof orchestrateGeocode>> = null;
    try {
      geo = await orchestrateGeocode(vision);
    } catch (err) {
      // Fall through: better a lieu without coords than no lieu at all —
      // matches the existing `extract` posture.
      console.error('[extractFromShortcut] geocoding failed', err);
    }

    // Write the pin directly — no confirm screen in this flow. Mirror the
    // shape written by `FirebaseLieuxService.createLieu` so the pin is
    // indistinguishable from one added through the normal upload path.
    const lieuRef = db.collection('users').doc(uid).collection('lieux').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const lieuData = {
      userId: uid,
      name: vision.name,
      nameNormalized: normalizeName(vision.name),
      city: vision.city ?? '',
      country: vision.country ?? '',
      // Prefer the canonical (geocoded) address — verified against Mapbox /
      // Google, typically has street+postcode. Fall back to the vision
      // fragment if we couldn't geocode.
      address: geo?.address ?? vision.address ?? '',
      lat: geo?.lat ?? 0,
      lng: geo?.lng ?? 0,
      category: vision.category ?? 'autre',
      description: vision.description ?? null,
      sourceInstagram: {
        author: vision.sourceAuthor ?? null,
      },
      // No screenshot upload on this path — we could persist the image, but
      // the iOS Shortcut delivery makes it hard to reason about which frame
      // was captured (the user might've screenshot a whole reel). The pin
      // renders with the category-emoji placeholder until the user opens it
      // and adds photos via the gallery UI.
      photos: [],
      userNotes: null,
      status: 'wishlist' as const,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await lieuRef.set(lieuData);
    } catch (err) {
      console.error('[extractFromShortcut] Firestore write failed', err);
      res.status(500).json({ error: 'Failed to save the pin.' });
      return;
    }

    console.info('[extractFromShortcut] saved', {
      uid,
      lieuId: lieuRef.id,
      name: vision.name,
      city: vision.city,
    });

    res.status(200).json({
      ok: true,
      lieuId: lieuRef.id,
      name: vision.name,
      city: vision.city,
    });
  },
);
