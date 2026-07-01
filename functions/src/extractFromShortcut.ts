import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { extractPlaceFromScreenshot } from './lib/claude';
import { geocodePlace } from './lib/mapbox';

/**
 * HTTP endpoint for the iOS Shortcut flow.
 *
 * Auth model: `Authorization: Bearer <shortcutToken>`.
 * The token is generated in the app and stored on the user's Firestore doc.
 * Rotated via a "Regenerate token" button in Settings (invalidates the old one).
 *
 * We can't use Firebase ID tokens here — the Shortcut has no way to obtain
 * one without a signed-in webview.
 *
 * Contract:
 *   POST /extractFromShortcut
 *   Header: Authorization: Bearer <token>
 *   Body: { imageBase64: string, mediaType?: 'image/png' | 'image/jpeg' | 'image/webp' }
 *   Response: { ok: true, lieuId: string, name: string } | { error: string }
 *
 * On success the Lieu is written directly to Firestore (no confirm screen) —
 * the Shortcut UX is fire-and-forget.
 */
export const extractFromShortcut = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: ['ANTHROPIC_API_KEY', 'MAPBOX_SECRET_TOKEN'],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.get('authorization') ?? '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    const token = match[1].trim();

    // Look up the user by token. `shortcutToken` is a top-level field on /users/{uid}
    // so we can hit it with an equality query cheaply. Ensure uniqueness at write time.
    const firestore = getFirestore();
    const usersSnap = await firestore
      .collection('users')
      .where('shortcutToken', '==', token)
      .limit(1)
      .get();
    if (usersSnap.empty) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const userDoc = usersSnap.docs[0];
    const uid = userDoc.id;

    const body = req.body as { imageBase64?: string; mediaType?: 'image/png' | 'image/jpeg' | 'image/webp' };
    const imageBase64 = body.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'imageBase64 required' });
      return;
    }
    if (imageBase64.length > 12_000_000) {
      res.status(413).json({ error: 'Image too large' });
      return;
    }
    const mediaType = body.mediaType ?? 'image/png';

    let vision;
    try {
      vision = await extractPlaceFromScreenshot(imageBase64, mediaType);
    } catch (err) {
      console.error('[extractFromShortcut] vision failed', err);
      res.status(500).json({ error: 'Extraction visuelle échouée' });
      return;
    }
    if (!vision.name) {
      res.status(422).json({ error: "Aucun lieu détecté dans le screenshot" });
      return;
    }

    let geo = null;
    try {
      geo = await geocodePlace(vision.name, vision.city, vision.country);
    } catch (err) {
      console.error('[extractFromShortcut] geocoding failed', err);
    }
    if (!geo) {
      res.status(422).json({ error: `Adresse introuvable pour "${vision.name}"` });
      return;
    }

    // Insert Lieu.
    const lieuRef = firestore.collection(`users/${uid}/lieux`).doc();
    const lieuId = lieuRef.id;

    // Upload the screenshot to Storage first.
    const bucket = getStorage().bucket();
    const extFromMime: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    };
    const ext = extFromMime[mediaType] ?? 'png';
    const storagePath = `users/${uid}/screenshots/${lieuId}.${ext}`;
    const bytes = Buffer.from(imageBase64, 'base64');
    await bucket.file(storagePath).save(bytes, { contentType: mediaType });

    await lieuRef.set({
      userId: uid,
      name: vision.name,
      city: vision.city ?? 'Inconnue',
      country: vision.country ?? 'France',
      address: vision.address ?? geo.address,
      lat: geo.lat,
      lng: geo.lng,
      category: vision.category ?? 'autre',
      description: vision.description,
      sourceInstagram: {
        author: vision.sourceAuthor,
        screenshotStoragePath: storagePath,
      },
      userNotes: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({ ok: true, lieuId, name: vision.name });
  },
);
