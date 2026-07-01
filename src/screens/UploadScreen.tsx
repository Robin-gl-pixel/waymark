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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Upload'>;

export default function UploadScreen() {
  const nav = useNavigation<Nav>();
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
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      const mediaType: 'image/png' | 'image/jpeg' | 'image/webp' =
        asset.uri.endsWith('.jpg') || asset.uri.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      const extracted = await getLieuxService().extractFromScreenshot(base64, mediaType);
      nav.navigate('ExtractConfirm', {
        extracted,
        screenshotBase64: base64,
        screenshotMediaType: mediaType,
      });
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
