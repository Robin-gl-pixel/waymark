import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, type, radius } from '../theme';
import UploadScreen from './UploadScreen';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const firstName = user?.displayName?.split(' ')[0] ?? 'toi';

  if (showUpload) {
    return (
      <View style={{ flex: 1 }}>
        <UploadScreen />
        <Pressable onPress={() => setShowUpload(false)} style={styles.closeUpload}>
          <Text style={styles.closeUploadLabel}>← Retour</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.greeting}>Bonjour {firstName}.</Text>
        <Text style={styles.subtitle}>
          Prêt à ajouter ton premier lieu ?
        </Text>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => setShowUpload(true)}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed ? colors.accentDim : colors.accent },
          ]}
        >
          <Text style={styles.primaryLabel}>+ Ajouter un lieu</Text>
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
  logoutBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutLabel: { ...type.h3, color: colors.text },
  closeUpload: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    padding: spacing.md,
  },
  closeUploadLabel: {
    ...type.body,
    color: colors.accent,
    fontWeight: '600',
  },
});
