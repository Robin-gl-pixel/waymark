import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { applyPhotoCrop } from '../lib/screenshotCrop';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Upload'>;

// Great-circle distance in meters. Used to detect duplicate-location uploads.
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

// Distance below which two coords are considered the same venue. 100m accounts
// for geocoding jitter (Mapbox/Google can differ by 20-50m for the same address)
// without merging genuinely-adjacent-but-distinct venues on the same street.
const DUPLICATE_DISTANCE_M = 100;

export default function UploadScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAndExtract = async () => {
    setError(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Autorise l'accès aux photos pour choisir un screenshot.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      quality: 0.9,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setLoading(true);

    try {
      // Downsample + JPEG re-encode BEFORE sending to Claude. 6MB PNG → ~150KB JPEG.
      // The upload of the raw file dominates wall time (~20s over cellular for 8MB base64),
      // so this alone brings extraction from ~25s to ~4s.
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1568 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const base64 = manipulated.base64!;
      const extracted = await getLieuxService().extractFromScreenshot(base64, 'image/jpeg');

      // If the vision model identified a clean photo region (Instagram chrome
      // excluded), crop the screenshot to that region before upload so the pin
      // hero is just the food/venue photo. Null bbox → upload as-is (URL and
      // video-keyframe paths hit their own ingestion screen and never reach
      // this code, but a null here from a screenshot with no cleanly-detected
      // chrome should also fall back gracefully).
      const cropped = await applyPhotoCrop(
        { uri: manipulated.uri, width: manipulated.width, height: manipulated.height },
        extracted.photoBoundingBox,
        { manipulateAsync: ImageManipulator.manipulateAsync, SaveFormatJPEG: ImageManipulator.SaveFormat.JPEG },
      );

      // Duplicate check: if the extracted coords land within DUPLICATE_DISTANCE_M
      // of an existing lieu, don't create a second one — send the user to the
      // existing pin instead. Skips when the extraction has no coords (Mapbox
      // and Google both failed) — nothing meaningful to compare against.
      if (user && extracted.lat != null && extracted.lng != null) {
        const existing = await getLieuxService().getAllLieux(user.uid);
        const dup = existing.find(
          (l) => haversineMeters(l.lat, l.lng, extracted.lat!, extracted.lng!) < DUPLICATE_DISTANCE_M,
        );
        if (dup) {
          Alert.alert(
            'Déjà dans ta collection',
            `"${dup.name}" a déjà été enregistré.`,
            [
              {
                text: 'Voir sur la carte',
                onPress: () =>
                  nav.reset({
                    index: 0,
                    routes: [
                      {
                        name: 'Main',
                        params: { screen: 'Map', params: { focusLieuId: dup.id } },
                      },
                    ],
                  }),
              },
              { text: 'Annuler', style: 'cancel' },
            ],
          );
          return;
        }
      }

      nav.navigate('ExtractConfirm', {
        extracted,
        screenshotUri: cropped.uri,
        screenshotMediaType: 'image/jpeg',
      });
    } catch (err) {
      console.error('[UploadScreen] extract failed', err);
      const e = err as { code?: string; message?: string; details?: unknown };
      const detail = e?.message || e?.code || 'unknown';
      setError(`Extraction échouée: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Ajouter un lieu</Text>
        <Text style={styles.subtitle}>Depuis un screenshot Instagram.</Text>

        <Pressable
          onPress={pickAndExtract}
          disabled={loading}
          style={({ pressed }) => [
            styles.pickBtn,
            { backgroundColor: pressed ? colors.accentDim : colors.accent },
            loading && { opacity: 0.6 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.pickLabel}>Choisir un screenshot</Text>
          )}
        </Pressable>

        {loading && (
          <Text style={styles.hint}>Extraction en cours (~3-5s) — Claude analyse ton screenshot…</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}

        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  title: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: spacing.sm },
  pickBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
  pickLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  hint: { ...type.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
  error: { ...type.caption, color: colors.error, marginTop: spacing.md, textAlign: 'center' },
  preview: {
    height: 320,
    width: '100%',
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
  },
});
