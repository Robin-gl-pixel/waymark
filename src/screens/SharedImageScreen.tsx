import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useShareIntentContext } from 'expo-share-intent';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { applyPhotoCrop } from '../lib/screenshotCrop';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SharedImage'>;

// Match the duplicate-detection threshold used by UploadScreen.
const DUPLICATE_DISTANCE_M = 100;

// Fallback duration (ms) when the share intent didn't give us the video length.
// Instagram reels are typically 15-90s; grabbing frame at 5s is a safe middle
// that usually lands inside the clip and away from the intro splash.
const FALLBACK_KEYFRAME_MS = 5_000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Detect whether a shared file is a video. Prefer the mimeType hint but fall
 * back to the file extension (Instagram sometimes hands us a mimeType of
 * `public.movie` or an empty string on older iOS).
 */
function isVideoFile(file: { mimeType?: string | null; path?: string | null }): boolean {
  const mime = (file.mimeType ?? '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  if (mime === 'public.movie' || mime === 'public.video') return true;
  const path = (file.path ?? '').toLowerCase();
  return /\.(mp4|mov|m4v|webm|avi|3gp)(\?.*)?$/.test(path);
}

function isImageFile(file: { mimeType?: string | null; path?: string | null }): boolean {
  const mime = (file.mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const path = (file.path ?? '').toLowerCase();
  return /\.(png|jpg|jpeg|webp|heic|heif)(\?.*)?$/.test(path);
}

export default function SharedImageScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const [error, setError] = useState<string | null>(null);
  const consumed = useRef(false);

  // Accept both images AND videos. Preserve the previous "first image" priority
  // so an accidental mixed share (image + video) still behaves like before.
  const firstFile =
    shareIntent?.files?.find((f) => isImageFile(f) || isVideoFile(f)) ?? null;
  const isVideo = !!firstFile && isVideoFile(firstFile) && !isImageFile(firstFile);
  const previewUri = firstFile?.path ?? null;

  // When Instagram shares a reel/post, it typically hands us a URL — not a
  // file. Detect the URL-only case so we can show an actionable error instead
  // of hanging on an infinite spinner.
  const hasShareableUrl = !!(
    shareIntent?.webUrl ||
    (shareIntent?.text && /^https?:\/\//i.test(shareIntent.text.trim()))
  );
  const isUrlOnly = !firstFile && hasShareableUrl;

  useEffect(() => {
    if (!user || consumed.current) return;

    // URL-only share (Instagram reel URL, no video file) → server-side path
    // that fetches OG metadata (og:image + og:description) and runs the same
    // vision pipeline.
    if (isUrlOnly) {
      consumed.current = true;
      (async () => {
        try {
          const url = (shareIntent?.webUrl || shareIntent?.text?.trim()) ?? '';
          const extracted = await getLieuxService().extractFromInstagramUrl(url);

          if (extracted.lat != null && extracted.lng != null) {
            const existing = await getLieuxService().getAllLieux(user.uid);
            const dup = existing.find(
              (l) =>
                haversineMeters(l.lat, l.lng, extracted.lat!, extracted.lng!) < DUPLICATE_DISTANCE_M,
            );
            if (dup) {
              resetShareIntent();
              nav.reset({
                index: 0,
                routes: [
                  {
                    name: 'Main',
                    params: { screen: 'Map', params: { focusLieuId: dup.id } },
                  },
                ],
              });
              return;
            }
          }

          resetShareIntent();
          nav.reset({
            index: 1,
            routes: [
              { name: 'Main' },
              {
                name: 'ExtractConfirm',
                params: {
                  extracted,
                  // No local screenshot from an Insta URL share — use a placeholder path.
                  // The confirm screen doesn't require a physical file for save; the
                  // storage upload path would need a real image, which the URL doesn't
                  // provide. TODO(v1.1): fetch og:image client-side to have a local
                  // preview + Storage upload.
                  screenshotUri: '',
                  screenshotMediaType: 'image/jpeg',
                },
              },
            ],
          });
        } catch (err) {
          console.error('[SharedImageScreen] Instagram URL extract failed', err);
          const e = err as { code?: string; message?: string };
          setError(
            `Extraction depuis Instagram échouée: ${e?.message || e?.code || 'unknown'}. Astuce : screenshot le reel puis partage la photo.`,
          );
        }
      })();
      return;
    }

    if (!firstFile) return;
    consumed.current = true;

    (async () => {
      try {
        // Step 1: get an image URI we can feed the extraction pipeline.
        //   - image share → the file itself
        //   - video share → a keyframe at ~50% of the clip's duration
        let sourceImageUri = firstFile.path;
        if (isVideo) {
          // Prefer the reported duration (ms in expo-share-intent's file object);
          // fall back to a fixed offset when unknown. Cap the offset at the
          // reported duration minus a safety margin so we never overshoot.
          const durationMs = typeof firstFile.duration === 'number' ? firstFile.duration : null;
          const targetMs =
            durationMs && durationMs > 0
              ? Math.max(0, Math.floor(durationMs / 2))
              : FALLBACK_KEYFRAME_MS;
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(firstFile.path, {
            time: targetMs,
            quality: 0.8,
          });
          sourceImageUri = thumbUri;
        }

        // Step 2: downsample + JPEG-encode for the vision pipeline (same shape
        // as the screenshot flow — bounded 1568px longest edge, ~200KB output).
        const manipulated = await ImageManipulator.manipulateAsync(
          sourceImageUri,
          [{ resize: { width: 1568 } }],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );

        // Step 3: bonus context — if the Share Sheet handed us the Instagram
        // caption alongside the media, pass it through to Claude. Instagram
        // reels often bundle the caption text; posts sometimes don't.
        const caption = shareIntent?.text?.trim() ? shareIntent.text.trim() : undefined;

        const extracted = await getLieuxService().extractFromScreenshot(
          manipulated.base64!,
          'image/jpeg',
          caption,
        );

        // Auto-crop Instagram chrome for IMAGE-share only. Video keyframes
        // are already clean by construction (they show the reel content, not
        // the IG UI overlay) — extract will typically return `photoBoundingBox:
        // null` for them, and even if it returns a bbox we ignore it here.
        const uploadImage = isVideo
          ? { uri: manipulated.uri, width: manipulated.width, height: manipulated.height, cropped: false }
          : await applyPhotoCrop(
              { uri: manipulated.uri, width: manipulated.width, height: manipulated.height },
              extracted.photoBoundingBox,
              { manipulateAsync: ImageManipulator.manipulateAsync, SaveFormatJPEG: ImageManipulator.SaveFormat.JPEG },
            );

        if (extracted.lat != null && extracted.lng != null) {
          const existing = await getLieuxService().getAllLieux(user.uid);
          const dup = existing.find(
            (l) =>
              haversineMeters(l.lat, l.lng, extracted.lat!, extracted.lng!) < DUPLICATE_DISTANCE_M,
          );
          if (dup) {
            resetShareIntent();
            nav.reset({
              index: 0,
              routes: [
                {
                  name: 'Main',
                  params: { screen: 'Map', params: { focusLieuId: dup.id } },
                },
              ],
            });
            return;
          }
        }

        resetShareIntent();
        nav.reset({
          index: 1,
          routes: [
            { name: 'Main' },
            {
              name: 'ExtractConfirm',
              params: {
                extracted,
                screenshotUri: uploadImage.uri,
                screenshotMediaType: 'image/jpeg',
              },
            },
          ],
        });
      } catch (err) {
        console.error('[SharedImageScreen] extract failed', err);
        const e = err as { code?: string; message?: string };
        setError(`Extraction échouée: ${e?.message || e?.code || 'unknown'}`);
      }
    })();
  }, [user, firstFile, isVideo, isUrlOnly, shareIntent?.text, nav, resetShareIntent]);

  const cancel = () => {
    resetShareIntent();
    nav.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {/* Only preview images — RN <Image> can't render a video file, and
            grabbing a still for the preview would slow the happy path. */}
        {previewUri && !isVideo && (
          <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
        )}
        {!error ? (
          <>
            <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: spacing.xl }} />
            <Text style={styles.hint}>
              {isVideo ? 'Analyse de la vidéo…' : 'Extraction du lieu…'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.btn} onPress={cancel}>
              <Text style={styles.btnLabel}>Retour</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  preview: {
    width: '80%',
    height: 320,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
  },
  hint: { ...type.body, color: colors.textSecondary, marginTop: spacing.md },
  error: { ...type.body, color: colors.error, textAlign: 'center', marginTop: spacing.xl },
  btn: {
    height: 56,
    marginTop: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
});
