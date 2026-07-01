import { LieuExtracted } from './types/Lieu';

/**
 * Root stack parameter list — single source of truth for typed navigation.
 * Update this when adding new screens; TS then propagates route names + params.
 */
export type RootStackParamList = {
  Home: undefined;
  Upload: undefined;
  ExtractConfirm: {
    extracted: LieuExtracted;
    screenshotBase64: string;
    screenshotMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  };
  List: undefined;
};
