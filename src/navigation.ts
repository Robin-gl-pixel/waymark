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
};

/**
 * Bottom tabs under Main.
 */
export type TabParamList = {
  Map: { focusLieuId?: string } | undefined;
  List: undefined;
  Network: undefined;
  _Add: undefined; // Fake tab: button that opens Upload in the root stack.
  Settings: undefined;
};
