import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, type, radius } from '../theme';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] ?? 'toi';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.greeting}>Bonjour {firstName}.</Text>
        <Text style={styles.subtitle}>
          L'app est en cours de construction. Prochaine étape : ajouter ton premier lieu.
        </Text>

        <View style={{ flex: 1 }} />

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
  },
  greeting: {
    ...type.h1,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  logoutBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutLabel: {
    ...type.h3,
    color: colors.text,
  },
});
