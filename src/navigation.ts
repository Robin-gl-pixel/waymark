import { LieuExtracted } from './types/Lieu';

/**
 * Root stack — screens that push on top of the main tabs.
 */
export type RootStackParamList = {
  Main: undefined;
  Upload: undefined;
  ExtractConfirm: {
    extracted: LieuExtracted;
    screenshotBase64: string;
    screenshotMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  };
  LieuDetail: { lieuId: string };
};

/**
 * Bottom tabs under Main.
 */
export type TabParamList = {
  Map: undefined;
  List: undefined;
  _Add: undefined; // Fake tab: button that opens Upload in the root stack.
  Settings: undefined;
};
