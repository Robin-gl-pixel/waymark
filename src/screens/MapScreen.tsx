import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView from 'react-native-map-clustering';
import RNMapView, { Marker, PROVIDER_DEFAULT, Callout } from 'react-native-maps';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, radius } from '../theme';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { RootStackParamList, TabParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MapRt = RouteProp<TabParamList, 'Map'>;

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
type MapHandle = {
  fitToCoordinates: RNMapView['fitToCoordinates'];
  animateToRegion: RNMapView['animateToRegion'];
};

export default function MapScreen() {
  const { user } = useAuth();
  const nav = useNavigation<Nav>();
  const route = useRoute<MapRt>();
  const focusLieuId = route.params?.focusLieuId;
  const mapRef = useRef<MapHandle | null>(null);
  const focusedLieuIdRef = useRef<string | null>(null);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  const recenterOnMe = useCallback(async () => {
    if (!mapRef.current || locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Localisation refusée',
          "Active la localisation dans Réglages pour recentrer la carte sur ta position.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500,
      );
    } catch (err) {
      console.warn('[MapScreen] recenter failed', err);
    } finally {
      setLocating(false);
    }
  }, [locating]);

  const hasFitRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await getLieuxService().getAllLieux(user.uid);
      setLieux(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Center on the first lieu once loaded. animateToRegion needs a non-zero duration
  // to reliably fire on iOS, and a small delay lets react-native-map-clustering
  // finish invoking the mapRef callback if it's still racing with our load().
  useEffect(() => {
    if (hasFitRef.current || loading || lieux.length === 0) return;
    if (focusLieuId) return;
    hasFitRef.current = true;
    const first = lieux[0];
    const t = setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: first.lat,
          longitude: first.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        500,
      );
    }, 200);
    return () => clearTimeout(t);
  }, [loading, lieux, focusLieuId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // When we land on the tab with a focusLieuId (e.g. "Voir sur la carte" from detail),
  // animate to that pin once lieux are loaded. Ref-guarded so a re-render doesn't re-focus.
  useEffect(() => {
    if (!focusLieuId || loading) return;
    if (focusedLieuIdRef.current === focusLieuId) return;
    const target = lieux.find((l) => l.id === focusLieuId);
    if (!target) return;
    focusedLieuIdRef.current = focusLieuId;
    const t = setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: target.lat,
          longitude: target.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500,
      );
    }, 200);
    return () => clearTimeout(t);
  }, [focusLieuId, loading, lieux]);

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
            description={`${CATEGORY_EMOJI[lieu.category]} ${lieu.city}`}
            pinColor="tomato"
            onCalloutPress={() => nav.navigate('LieuDetail', { lieuId: lieu.id })}
          />
        ))}
      </MapView>

      <SafeAreaView style={styles.controlsOverlay} edges={['top']} pointerEvents="box-none">
        <Pressable
          onPress={recenterOnMe}
          disabled={locating}
          style={({ pressed }) => [
            styles.locateBtn,
            pressed && { opacity: 0.7 },
            locating && { opacity: 0.5 },
          ]}
          accessibilityLabel="Recentrer sur ma position"
          hitSlop={8}
        >
          {locating ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name="locate" size={22} color={colors.text} />
          )}
        </Pressable>
      </SafeAreaView>

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
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    padding: spacing.lg,
  },
  locateBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
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
