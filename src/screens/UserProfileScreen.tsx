import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getSocialService } from '../services/socialService';
import { colors, spacing, type } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'UserProfile'>;
type Rt = RouteProp<RootStackParamList, 'UserProfile'>;

// TODO(#11): fill out this screen with pins map/list — for now just enough to host the block/report menu

export default function UserProfileScreen() {
  const nav = useNavigation<Nav>();
  const { uid } = useRoute<Rt>().params;

  const openMenu = () => {
    Alert.alert(
      'Actions',
      undefined,
      [
        { text: 'Signaler', onPress: () => nav.navigate('Report', { targetUid: uid }) },
        { text: 'Bloquer', style: 'destructive', onPress: confirmBlock },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const confirmBlock = () => {
    Alert.alert(
      'Bloquer cet utilisateur ?',
      'Vous ne verrez plus ses lieux et il ne pourra plus vous suivre.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            try {
              await getSocialService().block(uid);
              nav.goBack();
            } catch (err) {
              console.error(err);
              Alert.alert('Erreur', 'Blocage échoué. Réessaie.');
            }
          },
        },
      ],
    );
  };

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <Pressable
          onPress={openMenu}
          hitSlop={12}
          accessibilityLabel="Ouvrir le menu d'actions"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, uid]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.body}>
        <Text style={styles.uid}>{uid}</Text>
        <Text style={styles.placeholder}>
          Profil utilisateur — écran à compléter dans #11 (pins map/list, follow, counts).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing['2xl'] },
  uid: { ...type.h2, color: colors.text, fontWeight: '700' },
  placeholder: { ...type.body, color: colors.textSecondary, marginTop: spacing.md },
});
