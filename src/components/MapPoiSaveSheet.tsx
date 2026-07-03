import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, type, fonts, categoryColor } from '../theme';
import type { LieuCategory } from '../types/Lieu';
import type { BadgeStatus } from './BadgeText';
import StatusToggle from './StatusToggle';
import {
  MAP_POI_CATEGORY_LABEL,
  MAP_POI_CATEGORY_ORDER,
  type MapPoiTap,
} from '../screens/mapPoiHelpers';

interface Props {
  /** The tapped POI to save, or null when the sheet is closed. */
  poi: MapPoiTap | null;
  /**
   * Called when the user hits « Sauvegarder ». The sheet stays open (with a
   * spinner) until the parent flips `saving` back to false — the parent owns
   * the async createLieu + updateLieu calls.
   */
  onSave: (choice: { category: LieuCategory; status: BadgeStatus }) => void;
  /** Called when the user cancels via backdrop tap or « Annuler ». */
  onCancel: () => void;
  /** Parent-controlled save-in-flight flag — disables buttons + shows spinner. */
  saving?: boolean;
}

/**
 * Bottom-sheet-style modal that opens when the user taps a POI on the Apple
 * map. Presents a picker for category (7 chips, default resto) and status
 * (Envie / Allé, default Envie), plus a cerise « Sauvegarder » CTA and an
 * ink-outlined « Annuler » button.
 *
 * The sheet slides up from the bottom on iOS; when the OS-level reduce-motion
 * preference is on, it fades in instead (see `animationType` below).
 *
 * The parent controls saving state so it can call `LieuxService.createLieu`
 * outside of this component — the sheet is a pure picker.
 */
export default function MapPoiSaveSheet({ poi, onSave, onCancel, saving }: Props) {
  const [category, setCategory] = useState<LieuCategory>('resto');
  const [status, setStatus] = useState<BadgeStatus>('wishlist');
  const [reducedMotion, setReducedMotion] = useState(false);

  // Reset selection every time the sheet opens against a new POI — otherwise
  // a user who last saved « bar / visited » would see those pre-selected on
  // the next tap, which reads as a stuck UI. `poi.name` + coordinate together
  // uniquely identify the tap.
  useEffect(() => {
    if (poi) {
      setCategory('resto');
      setStatus('wishlist');
    }
  }, [poi?.name, poi?.coordinate.latitude, poi?.coordinate.longitude]);

  // Subscribe to reduce-motion so we can swap slide→fade at open time.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReducedMotion(v);
      })
      .catch(() => {
        if (mounted) setReducedMotion(false);
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReducedMotion(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const visible = poi !== null;

  return (
    <Modal
      visible={visible}
      transparent
      // Slide from bottom on iOS = the "bottom sheet" feel. Reduce-motion
      // downgrades to a fade so the OS preference is honoured.
      animationType={reducedMotion ? 'fade' : 'slide'}
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      {/* Tap-outside dismiss lives on the backdrop Pressable. */}
      <Pressable
        style={styles.backdrop}
        onPress={saving ? undefined : onCancel}
        accessibilityLabel="Fermer la fiche"
      >
        {/* Inner Pressable eats touches so tapping the sheet body itself
            doesn't dismiss it. */}
        <Pressable style={styles.sheet} onPress={() => {}} accessibilityViewIsModal>
          {poi && (
            <ScrollView
              contentContainerStyle={styles.sheetInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.eyebrow}>Lieu repéré</Text>
              <Text style={styles.name} numberOfLines={2}>
                {poi.name}
              </Text>

              <Text style={styles.sectionLabel}>Catégorie</Text>
              <View style={styles.chipRow}>
                {MAP_POI_CATEGORY_ORDER.map((cat) => (
                  <CategoryChip
                    key={cat}
                    category={cat}
                    label={MAP_POI_CATEGORY_LABEL[cat]}
                    selected={category === cat}
                    onPress={() => setCategory(cat)}
                    disabled={saving}
                  />
                ))}
              </View>

              <Text style={styles.sectionLabel}>Ton statut</Text>
              <StatusToggle
                status={status}
                onChange={setStatus}
                style={styles.statusRow}
              />

              <View style={styles.actions}>
                <Pressable
                  onPress={onCancel}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    pressed && { opacity: 0.7 },
                    saving && { opacity: 0.5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler"
                >
                  <Text style={styles.cancelLabel}>Annuler</Text>
                </Pressable>
                <Pressable
                  onPress={() => onSave({ category, status })}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    pressed && { backgroundColor: colors.accentDim },
                    saving && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Sauvegarder"
                >
                  {saving ? (
                    <ActivityIndicator color={colors.paper} />
                  ) : (
                    <Text style={styles.saveLabel}>Sauvegarder</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CategoryChip({
  category,
  label,
  selected,
  onPress,
  disabled,
}: {
  category: LieuCategory;
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const color = categoryColor(category);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Catégorie ${category}`}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color, borderColor: color },
        !selected && { borderColor: colors.hair },
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? colors.paper : color },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 10, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
    // Content-fit height with a safe upper bound. iOS home indicator +
    // paddingBottom below cover the notch.
    maxHeight: '85%',
  },
  sheetInner: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  eyebrow: {
    ...type.mono,
    fontSize: 9,
    letterSpacing: 2.16,
    color: colors.graphite,
    fontWeight: '600',
  },
  // Grotesque black uppercase venue name — matches the map header title spec.
  name: {
    fontFamily: fonts.display,
    fontWeight: '900',
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.9,
    color: colors.ink,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...type.monoSm,
    color: colors.graphite,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    ...type.mono,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.6,
  },
  statusRow: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    ...type.mono,
    color: colors.ink,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1.4,
    minHeight: 52,
    backgroundColor: colors.catResto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    ...type.mono,
    color: colors.paper,
    fontWeight: '700',
  },
});
