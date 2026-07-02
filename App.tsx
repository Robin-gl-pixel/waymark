import React from 'react';
import { View, ActivityIndicator, StyleSheet, Pressable, LogBox } from 'react-native';

// react-native-maps + react-native-map-clustering emit noisy Animated updates on iOS
// that have no JS listeners. Harmless — silence to keep the console useful.
LogBox.ignoreLogs(['Sending `onAnimatedValueUpdate` with no listeners registered.']);
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, useNavigation } from '@react-navigation/native';
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
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import MapScreen from './src/screens/MapScreen';
import ListScreen from './src/screens/ListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UploadScreen from './src/screens/UploadScreen';
import ExtractConfirmScreen from './src/screens/ExtractConfirmScreen';
import LieuDetailScreen from './src/screens/LieuDetailScreen';
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

  if (loading) {
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
      <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="Upload" component={UploadScreen} options={{ title: 'Nouveau lieu' }} />
      <RootStack.Screen name="ExtractConfirm" component={ExtractConfirmScreen} options={{ title: 'Vérifier' }} />
      <RootStack.Screen name="LieuDetail" component={LieuDetailScreen} options={{ title: '' }} />
    </RootStack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) {
    // Match the pre-auth splash so the transition is invisible.
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <AuthProvider>
          <StatusBar style="light" />
          <Root />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
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
