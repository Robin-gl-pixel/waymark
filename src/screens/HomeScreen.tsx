import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, type, radius } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const nav = useNavigation<Nav>();
  const firstName = user?.displayName?.split(' ')[0] ?? 'toi';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.greeting}>Bonjour {firstName}.</Text>
        <Text style={styles.subtitle}>
          Screenshot Instagram, puis pin sur ta carte.
        </Text>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => nav.navigate('Upload')}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed ? colors.accentDim : colors.accent },
          ]}
        >
          <Text style={styles.primaryLabel}>+ Ajouter un lieu</Text>
        </Pressable>

        <Pressable onPress={() => nav.navigate('List')} style={styles.secondaryBtn}>
          <Text style={styles.secondaryLabel}>Voir mes lieux</Text>
        </Pressable>

        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutLabel}>Se déconnecter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
  },
  greeting: { ...type.h1, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: spacing.md },
  primaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  primaryLabel: { ...type.h3, color: colors.text, fontWeight: '600' },
  secondaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  secondaryLabel: { ...type.h3, color: colors.text },
  logoutBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutLabel: { ...type.body, color: colors.textSecondary },
});
