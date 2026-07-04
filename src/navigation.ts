import type { NavigatorScreenParams } from '@react-navigation/native';
import { LieuExtracted } from './types/Lieu';

/**
 * Root stack — screens that push on top of the main tabs.
 */
export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Upload: undefined;
  SharedImage: undefined;
  ExtractConfirm: {
    extracted: LieuExtracted;
    screenshotUri: string;
    screenshotMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  };
  LieuDetail: { lieuId: string; ownerUid?: string };
  Onboarding: undefined;
  PickUsername: undefined;
  SeededFollow: undefined;
  EditUsername: undefined;
  MyProfile: undefined;
  UserProfile: { uid: string };
  SearchUsers: undefined;
  Report: { targetUid: string; targetLieuId?: string };
  BlockedUsers: undefined;
  ShortcutSetup: undefined;
  // Settings moved off the tab bar (post-v8 slice D). It's reached via the
  // gear icon at the top-right of MyProfileScreen as a stack push, so it
  // pops back to the Profile tab on close.
  Settings: undefined;
};

/**
 * Bottom tabs under Main — post-v8 slice D order: Carte · Liste · [+] · Réseau · Toi.
 * The central `_Add` slot is a fake tab (button that opens Upload on the root
 * stack, not a screen). Settings was removed from the tab bar; access is now
 * via the gear icon in MyProfileScreen's header.
 */
export type TabParamList = {
  // `showPinAddedToast` / `showShareExtensionTip` are one-shot signals set by
  // `ExtractConfirmScreen.handleConfirm` when it navigates back after a
  // successful save (GitHub #80). The Map consumes them on mount, renders the
  // relevant Toast overlays, and forgets them — the flags are transient UI
  // triggers, not persistent state.
  Map:
    | { focusLieuId?: string; showPinAddedToast?: boolean; showShareExtensionTip?: boolean }
    | undefined;
  List: undefined;
  _Add: undefined; // Fake tab: central prominent + button that opens Upload.
  Network: undefined;
  Profile: undefined;
};
