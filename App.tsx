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
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import MapScreen from './src/screens/MapScreen';
import ListScreen from './src/screens/ListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UploadScreen from './src/screens/UploadScreen';
import ExtractConfirmScreen from './src/screens/ExtractConfirmScreen';
import LieuDetailScreen from './src/screens/LieuDetailScreen';
import SharedImageScreen from './src/screens/SharedImageScreen';
import OnboardingSlidesScreen from './src/screens/OnboardingSlidesScreen';
import PickUsernameScreen from './src/screens/PickUsernameScreen';
import MyProfileScreen from './src/screens/MyProfileScreen';
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

function MainTabs() {
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
        name="_Add"
        component={View as any}
        options={{
          tabBarButton: () => <AddTabButton />,
          tabBarLabel: () => null,
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

function Root() {
  const { user, loading } = useAuth();
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [hasUsername, setHasUsername] = React.useState(false);

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

  React.useEffect(() => {
    setProfileLoading(true);
    refreshProfile();
  }, [refreshProfile]);

  if (loading || (user && profileLoading)) {
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
      {hasUsername ? (
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
          <RootStack.Screen
            name="Onboarding"
            component={OnboardingSlidesScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </>
      ) : (
        <RootStack.Screen
          name="PickUsername"
          options={{ headerShown: false, gestureEnabled: false }}
        >
          {() => <PickUsernameScreen onComplete={refreshProfile} />}
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
