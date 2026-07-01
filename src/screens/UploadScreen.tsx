import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getLieuxService } from '../services/lieuxService';
import { LieuExtracted } from '../types/Lieu';
import { colors, spacing, type, radius } from '../theme';

export default function UploadScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<LieuExtracted | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAndExtract = async () => {
    setError(null);
    setExtracted(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Autorise l\'accès aux photos pour choisir un screenshot.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setLoading(true);

    try {
      // Read as base64 (expo-image-picker's inline base64 option balloons memory on big screenshots).
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });
      const mediaType = asset.uri.endsWith('.jpg') || asset.uri.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
      const data = await getLieuxService().extractFromScreenshot(base64, mediaType);
      setExtracted(data);
    } catch (err) {
      console.error(err);
      setError('Extraction échouée. Réessaie ou change de screenshot.');
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

        {error && <Text style={styles.error}>{error}</Text>}

        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
        )}

        {extracted && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Résultat de l'extraction</Text>
            <Text style={styles.json}>{JSON.stringify(extracted, null, 2)}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
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
  error: { ...type.caption, color: colors.error, marginTop: spacing.md, textAlign: 'center' },
  preview: {
    height: 320,
    width: '100%',
    marginTop: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
  },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...type.h3, color: colors.text, marginBottom: spacing.md },
  json: {
    ...type.caption,
    color: colors.textSecondary,
    fontFamily: 'Menlo',
  },
});
