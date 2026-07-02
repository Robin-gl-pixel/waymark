import React from 'react';
import { View, ActivityIndicator, StyleSheet, Pressable, LogBox } from 'react-native';

// react-native-maps + react-native-map-clustering emit noisy Animated updates on iOS
// that have no JS listeners. Harmless — silence to keep the console useful.
LogBox.ignoreLogs(['Sending `onAnimatedValueUpdate` with no listeners registered.']);
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DarkTheme,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
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
import { getSocialService } from './src/services/socialService';
import { colors } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/navigation';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    primary: colors.accent,
    border: colors.border,
  },
};

/**
 * "Add" tab is a fake tab button — tapping it pushes Upload onto the root stack
 * instead of switching tab content. Common pattern for prominent action buttons.
 */
function AddTabButton() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable onPress={() => nav.navigate('Upload')} style={styles.addBtn}>
      <Ionicons name="add" size={30} color={colors.text} />
    </Pressable>
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
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="List"
        component={ListScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
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
        name="_Add"
        component={View as any}
        options={{
          tabBarButton: () => <AddTabButton />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={MyProfileScreen}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
          tabBarBadge: activityBadge,
          tabBarBadgeStyle: { backgroundColor: colors.error, color: colors.text },
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Local AsyncStorage flag that records whether the current install has
 * completed the SeededFollow step (GitHub #17). Persisting here — rather than
 * on the user doc — keeps the change client-only for this PR; we accept the
 * tradeoff that reinstalling the app re-shows the screen.
 */
const SEEDED_FOLLOW_STORAGE_KEY = '@waymark:seeded_follow_done_v1';

function Root() {
  const { user, loading } = useAuth();
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [hasUsername, setHasUsername] = React.useState(false);
  const [seededFollowLoading, setSeededFollowLoading] = React.useState(true);
  const [hasSeededFollowed, setHasSeededFollowed] = React.useState(false);

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

  React.useEffect(() => {
    setProfileLoading(true);
    setSeededFollowLoading(true);
    refreshProfile();
    refreshSeededFollow();
  }, [refreshProfile, refreshSeededFollow]);

  if (loading || (user && (profileLoading || seededFollowLoading))) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <RootStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {hasUsername && hasSeededFollowed ? (
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
          <RootStack.Screen
            name="Onboarding"
            component={OnboardingSlidesScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </>
      ) : !hasUsername ? (
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
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const navRef = useNavigationContainerRef();

  if (!fontsLoaded) {
    // Match the pre-auth splash so the transition is invisible.
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ShareIntentProvider>
      <SafeAreaProvider>
        <NavigationContainer theme={theme} ref={navRef}>
          <AuthProvider>
            <StatusBar style="light" />
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
  addBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.4,
    elevation: 8,
  },
});
