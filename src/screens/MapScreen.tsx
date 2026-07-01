import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView from 'react-native-map-clustering';
import RNMapView, { Marker, PROVIDER_DEFAULT, Callout } from 'react-native-maps';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_EMOJI: Record<LieuCategory, string> = {
  resto: '🍽️',
  bar: '🍸',
  café: '☕',
  activité: '🎨',
  musée: '🏛️',
  hôtel: '🏨',
  autre: '📍',
};

// Paris fallback for empty state.
const FALLBACK_REGION = {
  latitude: 48.8566,
  longitude: 2.3522,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

// react-native-map-clustering exposes the inner MapView via a `mapRef` callback
// (not a React `ref`), so we hold onto whatever it hands us.
type MapHandle = { fitToCoordinates: RNMapView['fitToCoordinates'] };

export default function MapScreen() {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const mapRef = useRef<MapHandle | null>(null);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await getLieuxService().getAllLieux(user.uid);
      setLieux(list);
      // Fit map to all pins once loaded.
      if (list.length > 0 && mapRef.current) {
        const coords = list.map((l) => ({ latitude: l.lat, longitude: l.lng }));
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 100, right: 60, bottom: 200, left: 60 },
          animated: false,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing['3xl'] }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        mapRef={(ref) => {
          mapRef.current = ref as unknown as MapHandle | null;
        }}
        // PROVIDER_DEFAULT resolves to Apple Maps on iOS (react-native-maps 1.x
        // no longer exports a PROVIDER_APPLE constant). This matches issue #4's
        // `provider="apple"` intent on the iOS-only build.
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={FALLBACK_REGION}
        showsUserLocation
        userInterfaceStyle="dark"
        clusterColor={colors.accent}
        clusterTextColor={colors.text}
        radius={40}
        minPoints={3}
      >
        {lieux.map((lieu) => (
          <Marker
            key={lieu.id}
            coordinate={{ latitude: lieu.lat, longitude: lieu.lng }}
            title={lieu.name}
            description={lieu.city}
          >
            <View style={styles.pin}>
              <Text style={styles.pinEmoji}>{CATEGORY_EMOJI[lieu.category]}</Text>
            </View>
            <Callout tooltip onPress={() => nav.navigate('LieuDetail', { lieuId: lieu.id })}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{lieu.name}</Text>
                <Text style={styles.calloutMeta}>{lieu.city}</Text>
                <Text style={styles.calloutHint}>Toucher pour ouvrir</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {lieux.length === 0 && (
        <SafeAreaView style={styles.emptyOverlay} edges={['top']} pointerEvents="box-none">
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aucun pin pour l'instant</Text>
            <Text style={styles.emptyBody}>Ajoute ton premier screenshot pour voir la carte se remplir.</Text>
            <Pressable onPress={() => nav.navigate('Upload')} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnLabel}>+ Ajouter un lieu</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  pinEmoji: { fontSize: 22 },
  callout: {
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 160,
  },
  calloutTitle: { ...type.h3, color: colors.text, fontWeight: '600' },
  calloutMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  calloutHint: { ...type.micro, color: colors.accent, marginTop: spacing.sm },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyCard: {
    backgroundColor: colors.bgElevated,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    maxWidth: 320,
  },
  emptyTitle: { ...type.h2, color: colors.text, fontWeight: '700', textAlign: 'center' },
  emptyBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  emptyBtn: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  emptyBtnLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
});
