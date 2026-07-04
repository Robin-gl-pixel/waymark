import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, type } from '../theme';

/**
 * Share Extension tutorial modal (GitHub #79 / parent #77).
 *
 * Rendered from the Map empty state when the user taps the « Depuis Instagram »
 * card. Teaches the Waymark Share flow in three annotated slots without leaving
 * the app:
 *
 *   1. Instagram post/reel → tape le bouton Partager (avion papier).
 *   2. Share sheet iOS     → choisis « Waymark Share ».
 *   3. Preview Waymark     → confirme le lieu et sauvegarde.
 *
 * NB : c'est la Share Extension iOS, PAS un screenshot. Le média (photo/vidéo)
 * du post arrive directement dans l'app. Le path « screenshot déjà pris » vit
 * dans l'autre card de l'empty state.
 *
 * The three bitmap assets are out of scope for this slice — the PRD explicitly
 * lists them as a follow-up shoot in the simulator. Slots therefore render as
 * neutral paper rectangles with an Ionicon anchor and a « TODO screenshot »
 * mono badge so a designer swap stays a one-file change.
 *
 * No persisted state: the modal opens and closes locally from the empty state
 * and can be reopened at will. Parent owns visibility.
 */

interface Props {
  visible: boolean;
  /** Fired when the user taps « Fermer ». Parent hides the modal. */
  onClose: () => void;
}

interface Slot {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  eyebrow: string;
  body: string;
}

/**
 * Ordered slots — mirrors the three-step Share Extension flow. The order is
 * load-bearing (user reads top-to-bottom), so it lives here as a readonly
 * constant rather than being reassembled in JSX.
 */
const SLOTS: readonly Slot[] = [
  {
    icon: 'logo-instagram',
    eyebrow: 'Étape 1',
    body: 'Sur un post ou un reel Insta, tape le bouton Partager (avion papier).',
  },
  {
    icon: 'share-outline',
    eyebrow: 'Étape 2',
    body: 'Dans la share sheet iOS, choisis « Waymark Share ».',
  },
  {
    icon: 'map-outline',
    eyebrow: 'Étape 3',
    body: 'Waymark reçoit le média, détecte le lieu et l\'épingle sur ta carte.',
  },
] as const;

export default function ShareExtensionTutorialModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View
          style={styles.card}
          accessibilityRole="alert"
          accessibilityLabel="Comment partager depuis Instagram"
        >
          <Text style={styles.eyebrow}>Tuto Waymark Share</Text>
          <Text style={styles.title}>Depuis Instagram</Text>
          <Text style={styles.subtitle}>
            Partage un post ou un reel Insta vers Waymark Share : on détecte le
            lieu et on l'épingle sur ta carte, sans screenshot.
          </Text>

          <ScrollView
            style={styles.slotsScroll}
            contentContainerStyle={styles.slotsContainer}
            showsVerticalScrollIndicator={false}
          >
            {SLOTS.map((slot) => (
              <View key={slot.eyebrow} style={styles.slot}>
                <View style={styles.slotFrame} accessibilityRole="image">
                  <Ionicons name={slot.icon} size={40} color={colors.graphite} />
                  <Text style={styles.slotTodo}>TODO screenshot</Text>
                </View>
                <View style={styles.slotCaption}>
                  <Text style={styles.slotEyebrow}>{slot.eyebrow}</Text>
                  <Text style={styles.slotBody}>{slot.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Text style={styles.closeLabel}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 10, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  // Paper ground card — sits on the darkened backdrop, keeps the v8 palette.
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hair,
    padding: spacing.xl,
  },
  eyebrow: {
    ...type.mono,
    fontSize: 10,
    letterSpacing: 2.2,
    color: colors.graphite,
    fontWeight: '700',
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '900',
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -0.6,
    color: colors.ink,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.bodySerifItalic,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 20,
    color: colors.graphite,
    marginTop: spacing.sm,
  },
  slotsScroll: {
    marginTop: spacing.xl,
  },
  slotsContainer: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  slot: {
    // Row: neutral placeholder frame on the left, caption on the right — so a
    // designer swap (asset → real screenshot) doesn't change the layout.
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  slotFrame: {
    width: 88,
    height: 116,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.hair,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  slotTodo: {
    ...type.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.graphite,
    fontWeight: '700',
  },
  slotCaption: {
    flex: 1,
    gap: 4,
  },
  slotEyebrow: {
    ...type.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.accent,
    fontWeight: '700',
  },
  slotBody: {
    fontFamily: fonts.display,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  closeBtn: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
  },
  pressed: { opacity: 0.7 },
});
