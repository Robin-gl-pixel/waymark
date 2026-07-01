import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import UploadScreen from './src/screens/UploadScreen';
import ExtractConfirmScreen from './src/screens/ExtractConfirmScreen';
import ListScreen from './src/screens/ListScreen';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Upload" component={UploadScreen} options={{ title: '' }} />
      <Stack.Screen name="ExtractConfirm" component={ExtractConfirmScreen} options={{ title: '' }} />
      <Stack.Screen name="List" component={ListScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}

export default function App() {
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
});
