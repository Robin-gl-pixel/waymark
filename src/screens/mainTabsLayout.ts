/**
 * Bottom-tabs layout — post-v8 slice D order pin.
 *
 * The founder tested v8 on device and asked for a five-slot layout with a
 * prominent central "+" button:
 *
 *   Carte · Liste · [+] · Réseau · Toi
 *
 * Settings was removed from the tab bar entirely — access is now via the gear
 * icon at the top-right of MyProfileScreen (pushed on the root stack, not a
 * tab swap, so Back drops the user right back on the Profile tab).
 *
 * This module is a pure data seam so the ordering can be pinned by a unit
 * test — App.tsx reads it visually, and this file provides the source of
 * truth used by the test.
 */
export type MainTabKind = 'screen' | 'action';

export interface MainTabSpec {
  /** Route name — must match the `<Tab.Screen name>` in App.tsx. */
  name: 'Map' | 'List' | '_Add' | 'Network' | 'Profile';
  /** French label rendered under the tab icon (or null for the fake `+` slot). */
  label: string | null;
  /** `screen` renders a real screen; `action` is a fake tab that opens Upload. */
  kind: MainTabKind;
}

/**
 * The canonical order. Any tab-bar test must import this list — do not
 * duplicate the ordering elsewhere.
 */
export const MAIN_TABS: readonly MainTabSpec[] = [
  { name: 'Map', label: 'Carte', kind: 'screen' },
  { name: 'List', label: 'Liste', kind: 'screen' },
  { name: '_Add', label: null, kind: 'action' },
  { name: 'Network', label: 'Réseau', kind: 'screen' },
  { name: 'Profile', label: 'Toi', kind: 'screen' },
] as const;

/**
 * Index of the central action slot — the "+" button. Anything else being at
 * position 2 in a 5-slot layout is a regression against the founder's spec.
 */
export const CENTRAL_ACTION_INDEX = 2;
