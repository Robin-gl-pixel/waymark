import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView from 'react-native-map-clustering';
import RNMapView, {
  Marker,
  PROVIDER_DEFAULT,
  Callout,
  type PoiClickEvent,
  type LongPressEvent,
} from 'react-native-maps';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../auth/AuthContext';
import { getLieuxService } from '../services/lieuxService';
import { colors, spacing, type, fonts } from '../theme';
import CategoryPin from '../components/CategoryPin';
import MapPoiSaveSheet from '../components/MapPoiSaveSheet';
import { createPinPulse } from '../lib/pinPulse';
import type { Lieu, LieuCategory } from '../types/Lieu';
import type { RootStackParamList, TabParamList } from '../navigation';
import { mapPoiToLieuInput, type MapPoiTap } from './mapPoiHelpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MapRt = RouteProp<TabParamList, 'Map'>;

/**
 * Human-readable French label for each `LieuCategory`. Used in the marker
 * callout as the mono meta line under the venue name (replaces the emoji
 * v7 title bar).
 */
const CATEGORY_LABEL: Record<LieuCategory, string> = {
  resto: 'Resto',
  bar: 'Bar',
  café: 'Café',
  activité: 'Activité',
  musée: 'Musée',
  hôtel: 'Hôtel',
  autre: 'Autre',
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

/**
 * Marker + CategoryPin wrapper — one Animated.Value per pin so a selection
 * pulse only scales the tapped marker, not every pin on the map. The scale
 * value is driven by `createPinPulse`, which no-ops under reduced motion.
 */
function PinMarker({
  lieu,
  reducedMotion,
  onCalloutPress,
}: {
  lieu: Lieu;
  reducedMotion: boolean;
  onCalloutPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  // react-native-maps caches the marker as a static image once mounted for
  // performance. We only enable live view tracking during the pulse window so
  // the animation actually renders on-screen — then drop back to the cached
  // snapshot to keep panning smooth with many pins on the map.
  const [tracksView, setTracksView] = useState(false);

  const handlePress = useCallback(() => {
    // Single pulse: 1 → 1.2 → 1 (~250ms round-trip). Skipped when the OS-level
    // reduce-motion preference is on — accessibility gate required by #46 AC.
    const anim = createPinPulse(scale, { reducedMotion });
    if (!anim) return;
    setTracksView(true);
    anim.start(() => setTracksView(false));
  }, [reducedMotion, scale]);

  return (
    <Marker
      coordinate={{ latitude: lieu.lat, longitude: lieu.lng }}
      onPress={handlePress}
      onCalloutPress={onCalloutPress}
      // The pin is a custom colored dot — `anchor` centers it on the coordinate.
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksView}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <CategoryPin category={lieu.category} />
      </Animated.View>
      <Callout tooltip onPress={onCalloutPress}>
        <View style={styles.callout}>
          <Text style={styles.calloutTitle} numberOfLines={1}>
            {lieu.name}
          </Text>
          <Text style={styles.calloutMeta} numberOfLines={1}>
            {CATEGORY_LABEL[lieu.category]} · {lieu.city}
          </Text>
          <Text style={styles.calloutHint}>Voir</Text>
        </View>
      </Callout>
    </Marker>
  );
}

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
  const [reducedMotion, setReducedMotion] = useState(false);
  // POI-tap flow state. `poiTap` holds the tapped POI while the save sheet is
  // open; `savingPoi` guards the async createLieu/updateLieu round-trip so the
  // sheet's CTA can show a spinner and swallow re-taps.
  const [poiTap, setPoiTap] = useState<MapPoiTap | null>(null);
  const [savingPoi, setSavingPoi] = useState(false);

  // Subscribe to the OS-level reduce-motion preference so the selection
  // pulse respects it in real time (user toggles Settings → app foregrounds).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReducedMotion(v);
      })
      .catch(() => {
        // Assume motion allowed if the OS refuses the query.
        if (mounted) setReducedMotion(false);
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReducedMotion(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

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

  // POI tap → open the save sheet with the POI's name + coordinate.
  //
  // WARNING: `onPoiClick` is a Google-Maps-only bridge event. On Apple Maps
  // (PROVIDER_DEFAULT on iOS — what this app ships) Apple captures the POI
  // label gesture natively and never emits it to JS, so this handler is
  // effectively dead code on the current build. It's kept for parity with a
  // future Google Maps switch; the real path today is `handleLongPress`
  // below (see slice C bug fix).
  const handlePoiClick = useCallback((e: PoiClickEvent) => {
    // Skip anonymous POIs — pinning a spot with no name is worse than a
    // dropped pin from the picker.
    if (!e.nativeEvent.name) return;
    setPoiTap({
      name: e.nativeEvent.name,
      coordinate: e.nativeEvent.coordinate,
      source: 'poi',
    });
  }, []);

  // Long-press → open the save sheet with an empty name pre-filled and let
  // the user type it in. This is the Apple-Maps-friendly fallback for the
  // POI-tap flow: `onLongPress` fires reliably on both providers, unlike
  // `onPoiClick` which Apple swallows. The sheet UX is unchanged apart from
  // the editable name field.
  const handleLongPress = useCallback((e: LongPressEvent) => {
    setPoiTap({
      name: '',
      coordinate: e.nativeEvent.coordinate,
      source: 'longpress',
    });
  }, []);

  const handlePoiCancel = useCallback(() => {
    if (savingPoi) return; // don't close mid-save
    setPoiTap(null);
  }, [savingPoi]);

  const handlePoiSave = useCallback(
    async ({
      category,
      status,
      name,
    }: {
      category: LieuCategory;
      status: 'wishlist' | 'visited' | null;
      name: string;
    }) => {
      if (!user || !poiTap) return;
      setSavingPoi(true);
      try {
        const { input } = mapPoiToLieuInput({ poi: poiTap, category, status, name });
        const created = await getLieuxService().createLieu(user.uid, input);
        // createLieu hardcodes status: 'wishlist'. If the user picked
        // « Allé » (or explicitly cleared), flip via updateLieu so the
        // visitedAt invariant is honoured server-side (#41).
        if (status !== 'wishlist') {
          await getLieuxService().updateLieu(user.uid, created.id, { status });
        }
        // Optimistic local update — the freshly saved pin shows up on the
        // map immediately instead of waiting for the next focus reload.
        setLieux((prev) => [{ ...created, status }, ...prev]);
        setPoiTap(null);
        // "Nº <count+1>" — the numbering scheme matches ListScreen's atlas
        // (Nº 001, Nº 002, …). We use prev length + 1 since setLieux is queued.
        const nextNumber = String(lieux.length + 1).padStart(3, '0');
        Alert.alert('Ajouté à ta carte', `Nº ${nextNumber} · ${created.name}`);
      } catch (err) {
        console.error('[MapScreen] POI save failed', err);
        const e = err as { message?: string };
        Alert.alert('Sauvegarde foirée', e?.message ?? 'Réessaie dans une seconde.');
      } finally {
        setSavingPoi(false);
      }
    },
    [poiTap, user, lieux.length],
  );

  // Pin count in mono — zero-padded to three digits so it reads as an archival
  // log ("047 pins" rather than "47 pins"). Cheap memoization to avoid the
  // string rebuild in the header on every render.
  const pinCountLabel = useMemo(() => {
    const n = lieux.length;
    const padded = String(n).padStart(3, '0');
    return `${padded} pins`;
  }, [lieux.length]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={colors.ink} style={{ marginTop: spacing['3xl'] }} />
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
        // v8 paper ground — Apple Maps rendered in its light interface pairs
        // with the ink/paper palette. `dark` would fight the header tokens.
        userInterfaceStyle="light"
        // Clustering color matches the accent (cerise/vermillon). Cluster text
        // is the paper ground so it reads on the cerise disc.
        clusterColor={colors.accent}
        clusterTextColor={colors.paper}
        radius={40}
        minPoints={3}
        onPoiClick={handlePoiClick}
        onLongPress={handleLongPress}
      >
        {lieux.map((lieu) => (
          <PinMarker
            key={lieu.id}
            lieu={lieu}
            reducedMotion={reducedMotion}
            onCalloutPress={() => nav.navigate('LieuDetail', { lieuId: lieu.id })}
          />
        ))}
      </MapView>

      {/* Header — minimal mono pin count chip, right-aligned. The « Ta carte »
          eyebrow + city title were dropped: founder pins worldwide, so the
          hard-coded « Paris » was misleading, and the eyebrow read as chrome.
          Left side carries an « Appuie long » discovery hint so users learn
          the Apple-Maps add-a-lieu gesture (POI tap is inert on Apple). */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.headerRow} pointerEvents="none">
          <View style={styles.hintChip}>
            <Text style={styles.hintLabel}>Appuie long · ajouter</Text>
          </View>
          <View style={styles.pinCountChip}>
            <Text style={styles.pinCount}>{pinCountLabel}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Controls — recenter button in paper/ink tokens. */}
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
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Ionicons name="locate" size={22} color={colors.ink} />
          )}
        </Pressable>
      </SafeAreaView>

      {/* Bottom-sheet save flow — opens when the user taps a POI on the map. */}
      <MapPoiSaveSheet
        poi={poiTap}
        onCancel={handlePoiCancel}
        onSave={handlePoiSave}
        saving={savingPoi}
      />

      {lieux.length === 0 && (
        <SafeAreaView style={styles.emptyOverlay} edges={['top']} pointerEvents="box-none">
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEyebrow}>Aucun pin</Text>
            <Text style={styles.emptyTitle}>Ta carte commence ici</Text>
            <Text style={styles.emptyBody}>
              Ajoute ton premier screenshot — ou appuie long sur la carte pour épingler un lieu à la main.
            </Text>
            <Pressable onPress={() => nav.navigate('Upload')} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnLabel}>Ajouter un lieu</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, backgroundColor: colors.paper },
  callout: {
    backgroundColor: colors.paper,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hair,
    minWidth: 180,
  },
  // Grotesque uppercase venue name — the v8 « Écrans » spec for the callout title.
  calloutTitle: {
    fontFamily: fonts.display,
    fontWeight: '900',
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.3,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  // Mono meta line — category label + city, mirrors the mockup's mono under-line.
  calloutMeta: {
    ...type.mono,
    color: colors.graphite,
    marginTop: 4,
    fontWeight: '600',
  },
  calloutHint: {
    ...type.mono,
    color: colors.accent,
    marginTop: spacing.sm,
    fontWeight: '700',
  },
  // Overlays. `box-none` on the SafeAreaView so map gestures pass through the
  // empty edges; only the actual header/button captures touches.
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'stretch',
    paddingHorizontal: spacing.lg,
  },
  // Row spans the full width so the count sits at the right and the "appuie
  // long" hint sits at the left. Both chips read as archival mono chrome,
  // never fighting the map tiles.
  headerRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Left-side discovery hint — teaches the Apple-Maps add-a-lieu gesture.
  // Half-opacity paper so it fades into the tile texture on busy maps but
  // stays readable on the empty ground.
  hintChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  hintLabel: {
    ...type.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.graphite,
    fontWeight: '700',
  },
  // Small paper chip carrying the count — keeps the count readable over any
  // tile without reintroducing a full-width header bar.
  pinCountChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
  },
  // Mono count — reads as archival log.
  pinCount: {
    ...type.mono,
    fontSize: 11,
    letterSpacing: 1.54, // ~0.14em at 11px
    color: colors.ink,
    fontWeight: '700',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  locateBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
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
    backgroundColor: colors.paper,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.hair,
    alignItems: 'center',
    maxWidth: 320,
  },
  emptyEyebrow: {
    ...type.mono,
    fontSize: 9,
    letterSpacing: 2.16,
    color: colors.graphite,
    fontWeight: '600',
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontWeight: '900',
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 6,
  },
  emptyBody: {
    fontFamily: fonts.bodySerifItalic,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 20,
    color: colors.graphite,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  emptyBtn: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.ink,
  },
  emptyBtnLabel: {
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
  },
});
