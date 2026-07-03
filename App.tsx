import React from 'react';
import { View, ActivityIndicator, StyleSheet, Pressable, LogBox } from 'react-native';

// react-native-maps + react-native-map-clustering emit noisy Animated updates on iOS
// that have no JS listeners. Harmless — silence to keep the console useful.
LogBox.ignoreLogs(['Sending `onAnimatedValueUpdate` with no listeners registered.']);
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
// v8 « atlas numéroté » — tab bar labels adopt the mono three-role type
// system (below). `fonts` is imported alongside `colors` so the tab bar can
// paint its labels in the mono role that the v8 spec calls for.
import AuthScreen from './src/screens/AuthScreen';
import MapScreen from './src/screens/MapScreen';
import ListScreen from './src/screens/ListScreen';
import NetworkFeedScreen from './src/screens/NetworkFeedScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UploadScreen from './src/screens/UploadScreen';
import ExtractConfirmScreen from './src/screens/ExtractConfirmScreen';
import LieuDetailScreen from './src/screens/LieuDetailScreen';
import SharedImageScreen from './src/screens/SharedImageScreen';
import OnboardingSlidesScreen from './src/screens/OnboardingSlidesScreen';
import PickUsernameScreen from './src/screens/PickUsernameScreen';
import SeededFollowScreen from './src/screens/SeededFollowScreen';
import EditUsernameScreen from './src/screens/EditUsernameScreen';
import MyProfileScreen from './src/screens/MyProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import SearchUsersScreen from './src/screens/SearchUsersScreen';
import ReportScreen from './src/screens/ReportScreen';
import BlockedUsersScreen from './src/screens/BlockedUsersScreen';
import ShortcutSetupScreen from './src/screens/ShortcutSetupScreen';
import SocialMigrationModal from './src/components/SocialMigrationModal';
import { getSocialService } from './src/services/socialService';
import {
  hasSeenSocialMigrationModal,
  markSocialMigrationModalSeen,
} from './src/utils/socialMigrationFlag';
import { colors, fonts } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { resolveRootRoute } from './src/screens/rootGate';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    primary: colors.accent,
    border: colors.border,
  },
};

/**
 * Central "+" tab is a fake tab button — tapping it pushes Upload onto the
 * root stack instead of switching tab content. Post-v8 slice D makes the
 * button prominent (cerise/vermillon disc that floats above the bar, Instagram-
 * style) so pin creation is the visual anchor of the tab row.
 */
function AddTabButton() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.addBtnWrap}>
      <Pressable
        onPress={() => nav.navigate('Upload')}
        style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau lieu"
      >
        <Ionicons name="add" size={34} color={colors.paper} />
      </Pressable>
    </View>
  );
}

/**
 * Poll the unread activity count on tab focus so the Profile-tab badge stays
 * fresh without a persistent listener. Cheap at V1 scale (single indexed count
 * query per focus event). Returns 0 when signed out.
 */
function useUnreadActivityBadge(): number | undefined {
  const [count, setCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    try {
      const n = await getSocialService().getUnreadActivityCount();
      setCount(n);
    } catch (err) {
      // A transient read failure shouldn't flash-clear the badge — keep last known.
      console.warn('[MainTabs] unread activity count failed', err);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    // Re-poll on a slow interval to catch new activity while the user idles
    // on another tab — cheap (1 indexed query / 30s).
    const iv = setInterval(refresh, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Bottom-tabs' `tabBarBadge` treats undefined/0 as "no badge". We want the
  // pastille visible whenever there's ≥1 unread — pass the raw count so the
  // tab renders it (React Navigation renders numbers automatically).
  return count > 0 ? count : undefined;
}

function MainTabs() {
  const activityBadge = useUnreadActivityBadge();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // v8 « atlas numéroté » tab bar — paper ground, hair-thin top border,
        // ink text (active) vs graphite (inactive). Mono uppercase labels so
        // « Carte / Liste / Réseau / Toi » read as archival log, not casual UI.
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.hair },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.graphite,
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 9,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          fontWeight: '700',
        },
      }}
    >
      {/*
        Order matters — post-v8 slice D lays this out as Carte · Liste · [+] ·
        Réseau · Toi with the central + button as the visual anchor. Settings
        is no longer a tab; it opens as a stack push from the gear icon in the
        Profile header.
      */}
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: 'Carte',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="List"
        component={ListScreen}
        options={{
          tabBarLabel: 'Liste',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="_Add"
        component={View as any}
        options={{
          tabBarButton: () => <AddTabButton />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Network"
        component={NetworkFeedScreen}
        options={{
          tabBarLabel: 'Réseau',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={MyProfileScreen}
        options={{
          tabBarLabel: 'Toi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
          tabBarBadge: activityBadge,
          tabBarBadgeStyle: { backgroundColor: colors.error, color: colors.text },
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Local AsyncStorage flags that record whether the current install has seen
 * the pitch slides (`@waymark:onboarding_seen_v1`, GitHub #17) and completed
 * the SeededFollow step (`@waymark:seeded_follow_done_v1`). Persisting here —
 * rather than on the user doc — keeps the change client-only for this PR; we
 * accept the tradeoff that reinstalling the app re-shows both screens.
 */
const ONBOARDING_SEEN_STORAGE_KEY = '@waymark:onboarding_seen_v1';
const SEEDED_FOLLOW_STORAGE_KEY = '@waymark:seeded_follow_done_v1';

function Root() {
  const { user, loading } = useAuth();
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [hasUsername, setHasUsername] = React.useState(false);
  const [onboardingLoading, setOnboardingLoading] = React.useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = React.useState(false);
  const [seededFollowLoading, setSeededFollowLoading] = React.useState(true);
  const [hasSeededFollowed, setHasSeededFollowed] = React.useState(false);
  // Migration-modal state (GitHub #43). We hydrate lazily on auth so signed-out
  // users never hit AsyncStorage for a flag that only matters post-auth.
  // `null` means "not checked yet" — we intentionally don't gate the loading
  // spinner on this; the modal simply appears once the read resolves.
  const [socialMigrationSeen, setSocialMigrationSeen] = React.useState<boolean | null>(null);

  const refreshProfile = React.useCallback(async () => {
    if (!user) {
      setHasUsername(false);
      setProfileLoading(false);
      return;
    }
    try {
      const profile = await getSocialService().getMyProfile();
      setHasUsername(Boolean(profile?.username));
    } catch (err) {
      console.warn('[Root] getMyProfile failed', err);
      // Treat a load failure as "no profile yet" so the picker gets a chance —
      // upsertProfile itself will surface the real error if it persists.
      setHasUsername(false);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const refreshOnboarding = React.useCallback(async () => {
    if (!user) {
      setHasSeenOnboarding(false);
      setOnboardingLoading(false);
      return;
    }
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY);
      setHasSeenOnboarding(value === 'true');
    } catch (err) {
      console.warn('[Root] read onboarding flag failed', err);
      // Fail open: if AsyncStorage is broken, don't trap the user on the
      // pitch slides — treat as seen so they reach the picker/app.
      setHasSeenOnboarding(true);
    } finally {
      setOnboardingLoading(false);
    }
  }, [user]);

  const refreshSeededFollow = React.useCallback(async () => {
    if (!user) {
      setHasSeededFollowed(false);
      setSeededFollowLoading(false);
      return;
    }
    try {
      const value = await AsyncStorage.getItem(SEEDED_FOLLOW_STORAGE_KEY);
      setHasSeededFollowed(value === 'true');
    } catch (err) {
      console.warn('[Root] read seededFollow flag failed', err);
      // Fail open: treat as done rather than trapping the user on this screen
      // if AsyncStorage is broken (e.g. wiped storage), so they still reach the app.
      setHasSeededFollowed(true);
    } finally {
      setSeededFollowLoading(false);
    }
  }, [user]);

  const markOnboardingSeen = React.useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, 'true');
    } catch (err) {
      // If persistence fails, we still advance the UI — worst case is the
      // slides re-appear on next launch, which is annoying but not blocking.
      console.warn('[Root] persist onboarding flag failed', err);
    }
    setHasSeenOnboarding(true);
  }, []);

  const markSeededFollowDone = React.useCallback(async () => {
    try {
      await AsyncStorage.setItem(SEEDED_FOLLOW_STORAGE_KEY, 'true');
    } catch (err) {
      // If persistence fails, we still advance the UI — the worst case is the
      // screen re-appears on next launch, which is fine.
      console.warn('[Root] persist seededFollow flag failed', err);
    }
    setHasSeededFollowed(true);
  }, []);

  const refreshSocialMigration = React.useCallback(async () => {
    if (!user) {
      // Reset when signed out so a sign-in re-checks the flag rather than
      // reusing a stale value from a previous session.
      setSocialMigrationSeen(null);
      return;
    }
    const seen = await hasSeenSocialMigrationModal();
    setSocialMigrationSeen(seen);
  }, [user]);

  const acknowledgeSocialMigration = React.useCallback(async () => {
    // Persist BEFORE hiding so a mid-write crash still records the ack; the
    // modal state flips to `true` on completion so the overlay disappears.
    await markSocialMigrationModalSeen();
    setSocialMigrationSeen(true);
  }, []);

  React.useEffect(() => {
    setProfileLoading(true);
    setOnboardingLoading(true);
    setSeededFollowLoading(true);
    refreshProfile();
    refreshOnboarding();
    refreshSeededFollow();
    refreshSocialMigration();
  }, [refreshProfile, refreshOnboarding, refreshSeededFollow, refreshSocialMigration]);

  const route = resolveRootRoute({
    authLoading: loading,
    hasUser: Boolean(user),
    isAnonymous: Boolean(user?.isAnonymous),
    profileLoading,
    hasUsername,
    onboardingLoading,
    hasSeenOnboarding,
    seededFollowLoading,
    hasSeededFollowed,
  });

  if (route === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (route === 'auth') return <AuthScreen />;

  // Anonymous / dev-bypass users skip the whole social onboarding — they can't
  // upsertProfile without hitting Firestore permissions anyway, and the whole
  // point of the "Skip (dev anonymous sign-in)" button is to reach the map
  // fast without setting up a real account. resolveRootRoute() already sends
  // them straight to 'main'; here we reuse the same flag to hide the
  // social-migration modal from them too.
  const bypassSocialOnboarding = Boolean(user?.isAnonymous);

  // Show the social-migration modal ONLY after the user has cleared auth and
  // onboarding (matches acceptance: "not on the auth screen — only after the
  // user is authenticated and past onboarding"). Anonymous dev-bypass users
  // also skip it — the social copy doesn't apply to them.
  const showSocialMigrationModal =
    !bypassSocialOnboarding &&
    hasUsername &&
    hasSeededFollowed &&
    socialMigrationSeen === false;

  return (
    <>
    <RootStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {route === 'main' ? (
        <>
          <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <RootStack.Screen name="Upload" component={UploadScreen} options={{ title: 'Nouveau lieu' }} />
          <RootStack.Screen
            name="SharedImage"
            component={SharedImageScreen}
            options={{ title: 'Ajout depuis Partager', headerBackVisible: false, gestureEnabled: false }}
          />
          <RootStack.Screen name="ExtractConfirm" component={ExtractConfirmScreen} options={{ title: 'Vérifier' }} />
          <RootStack.Screen name="LieuDetail" component={LieuDetailScreen} options={{ title: '' }} />
          <RootStack.Screen name="MyProfile" component={MyProfileScreen} options={{ title: 'Profil' }} />
          <RootStack.Screen name="EditUsername" component={EditUsernameScreen} options={{ title: 'Changer mon @' }} />
          <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Profil' }} />
          <RootStack.Screen name="SearchUsers" component={SearchUsersScreen} options={{ title: 'Rechercher' }} />
          <RootStack.Screen name="Report" component={ReportScreen} options={{ title: 'Signaler' }} />
          <RootStack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ title: 'Comptes bloqués' }} />
          <RootStack.Screen name="ShortcutSetup" component={ShortcutSetupScreen} options={{ title: 'Shortcut iOS' }} />
          {/*
            Settings is a stack push from the gear icon in MyProfileScreen —
            post-v8 slice D removed it from the tab bar so pin creation gets
            the anchor slot. Pushing (rather than swapping tabs) means Back
            drops the user right back on the Profile tab where they came from.
          */}
          <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Réglages' }} />
        </>
      ) : route === 'onboarding' ? (
        <RootStack.Screen
          name="Onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        >
          {() => <OnboardingSlidesScreen onComplete={markOnboardingSeen} />}
        </RootStack.Screen>
      ) : route === 'pick-username' ? (
        <RootStack.Screen
          name="PickUsername"
          options={{ headerShown: false, gestureEnabled: false }}
        >
          {() => <PickUsernameScreen onComplete={refreshProfile} />}
        </RootStack.Screen>
      ) : (
        <RootStack.Screen
          name="SeededFollow"
          options={{ headerShown: false, gestureEnabled: false }}
        >
          {() => <SeededFollowScreen onComplete={markSeededFollowDone} />}
        </RootStack.Screen>
      )}
    </RootStack.Navigator>
    <SocialMigrationModal
      visible={showSocialMigrationModal}
      onAcknowledge={acknowledgeSocialMigration}
    />
    </>
  );
}

type NavRef = ReturnType<typeof useNavigationContainerRef>;

/**
 * When iOS hands us a shared image via the Share Extension, jump to
 * SharedImageScreen once per intent. resetShareIntent() (called from the
 * screen after extract completes) clears hasShareIntent; the ref guards
 * against re-entering the same screen on shareIntent object identity churn.
 */
function ShareIntentRouter({ navRef }: { navRef: NavRef }) {
  const { user } = useAuth();
  const { hasShareIntent, shareIntent } = useShareIntentContext();
  const routedKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!user || !hasShareIntent || !navRef.isReady()) return;
    const key = shareIntent?.files?.[0]?.path ?? shareIntent?.text ?? 'intent';
    if (routedKey.current === key) return;
    routedKey.current = key;
    navRef.reset({ index: 0, routes: [{ name: 'SharedImage' } as never] });
  }, [user, hasShareIntent, shareIntent, navRef]);

  React.useEffect(() => {
    if (!hasShareIntent) routedKey.current = null;
  }, [hasShareIntent]);

  return null;
}

export default function App() {
  // v8 refonte adopts a three-role system-font stack (grotesque black uppercase
  // / italic serif / mono). System-ui, Georgia and SF Mono all ship with iOS —
  // no `useFonts` gate needed at boot.
  const navRef = useNavigationContainerRef();

  return (
    <ShareIntentProvider options={{ scheme: 'waymark' }}>
      <SafeAreaProvider>
        <NavigationContainer theme={theme} ref={navRef}>
          <AuthProvider>
            <StatusBar style="dark" />
            <ShareIntentRouter navRef={navRef} />
            <Root />
          </AuthProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Wrap centers the disc horizontally in the tab-bar slot. The Pressable
  // itself is a fixed-size circle so the touch target stays predictable
  // regardless of the parent's flex sizing.
  addBtnWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent, // = catResto vermillon, per v8 spec
    alignItems: 'center',
    justifyContent: 'center',
    // Float above the tab-bar top edge so the disc reads as an action, not a
    // tab (Instagram-style prominent + button).
    marginTop: -18,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.4,
    elevation: 10,
  },
  addBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
