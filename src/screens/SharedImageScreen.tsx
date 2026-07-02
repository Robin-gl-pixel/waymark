import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImageManipulator from 'expo-image-manipulator';
import { useShareIntentContext } from 'expo-share-intent';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SharedImage'>;

// Match the duplicate-detection threshold used by UploadScreen.
const DUPLICATE_DISTANCE_M = 100;

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

export default function SharedImageScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const [error, setError] = useState<string | null>(null);
  const consumed = useRef(false);

  const firstImage = shareIntent?.files?.find((f) => f.mimeType?.startsWith('image/'));

  useEffect(() => {
    if (!user || !firstImage || consumed.current) return;
    consumed.current = true;

    (async () => {
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          firstImage.path,
          [{ resize: { width: 1568 } }],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        const extracted = await getLieuxService().extractFromScreenshot(
          manipulated.base64!,
          'image/jpeg',
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
                screenshotUri: manipulated.uri,
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
  }, [user, firstImage, nav, resetShareIntent]);

  const cancel = () => {
    resetShareIntent();
    nav.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {firstImage && (
          <Image source={{ uri: firstImage.path }} style={styles.preview} resizeMode="contain" />
        )}
        {!error ? (
          <>
            <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: spacing.xl }} />
            <Text style={styles.hint}>Extraction du lieu…</Text>
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
