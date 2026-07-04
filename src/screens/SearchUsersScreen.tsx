import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getSocialService } from '../services/socialService';
import { colors, radius, spacing, type } from '../theme';
import type { UserProfile } from '../types/User';
import type { RootStackParamList } from '../navigation';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { SkeletonRowList } from '../components/SkeletonRow';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SearchUsers'>;

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; results: UserProfile[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

/**
 * Exact-match search on `@username`. V1 has no fuzzy — a partial handle
 * returns no results — because it keeps queries cheap and matches the way
 * users search for their friends by pseudo (Insta / Twitter style).
 */
export default function SearchUsersScreen() {
  const nav = useNavigation<Nav>();
  const [value, setValue] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const normalized = useMemo(
    () => value.trim().toLowerCase().replace(/^@/, ''),
    [value],
  );

  const runSearch = useCallback(async (uname: string) => {
    const mySeq = ++requestSeq.current;
    setState({ kind: 'searching' });
    try {
      const results = await getSocialService().searchUsers(uname);
      if (mySeq !== requestSeq.current) return;
      setState(results.length === 0 ? { kind: 'empty' } : { kind: 'results', results });
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      console.warn('[SearchUsers] search failed', err);
      setState({ kind: 'error', message: 'Recherche échouée. Réessaie.' });
    }
  }, []);

  // Live search debounced at 300 ms — short enough to feel snappy, long enough
  // to skip mid-word Firestore reads.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (normalized.length === 0) {
      setState({ kind: 'idle' });
      requestSeq.current++; // cancel any in-flight result from applying.
      return;
    }
    debounceRef.current = setTimeout(() => {
      runSearch(normalized);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [normalized, runSearch]);

  const clear = () => {
    setValue('');
    setState({ kind: 'idle' });
  };

  const openProfile = (uid: string) => {
    Keyboard.dismiss();
    nav.navigate('UserProfile', { uid });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inputRow}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="@pseudo"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            maxLength={21} // 20 + leading '@'
            value={value}
            onChangeText={setValue}
            returnKeyType="search"
            onSubmitEditing={() => normalized && runSearch(normalized)}
          />
          {value.length > 0 && (
            <Pressable onPress={clear} hitSlop={12} accessibilityLabel="Effacer">
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <Body
          state={state}
          onOpen={openProfile}
          onRetry={() => normalized && runSearch(normalized)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Body({
  state,
  onOpen,
  onRetry,
}: {
  state: State;
  onOpen: (uid: string) => void;
  onRetry: () => void;
}) {
  switch (state.kind) {
    case 'idle':
      return (
        <EmptyState
          icon="search-outline"
          title="Cherche un ami"
          body="Tape son @pseudo exact — la recherche est stricte en V1. Ex : @waymark.paris.cool"
        />
      );
    case 'searching':
      return (
        <View style={styles.list}>
          <SkeletonRowList count={4} />
        </View>
      );
    case 'empty':
      return (
        <EmptyState
          icon="person-remove-outline"
          title="Aucun résultat"
          body="Vérifie l'orthographe — la recherche est exacte en V1."
        />
      );
    case 'error':
      return <ErrorState message={state.message} onRetry={onRetry} />;
    case 'results':
      return (
        <FlatList
          data={state.results}
          keyExtractor={(u) => u.uid}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <UserRow user={item} onPress={() => onOpen(item.uid)} />}
        />
      );
  }
}

function UserRow({ user, onPress }: { user: UserProfile; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      accessibilityLabel={`Ouvrir le profil de ${user.username}`}
    >
      <Avatar username={user.username} size={44} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          @{user.username}
        </Text>
        {user.displayName ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {user.displayName}
          </Text>
        ) : null}
      </View>
      {user.isCurated && (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Amble</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing['2xl'],
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    ...type.body,
    color: colors.text,
    flex: 1,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowBody: { flex: 1 },
  rowTitle: { ...type.h3, color: colors.text, fontWeight: '600' },
  rowMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  badgeLabel: {
    ...type.micro,
    color: colors.bg,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
