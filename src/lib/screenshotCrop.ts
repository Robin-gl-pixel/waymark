import { PhotoBoundingBox } from '../types/Lieu';

/**
 * Result of `applyPhotoCrop`. `cropped` is false when the input bbox was null
 * (the caller should upload the source image as-is); true when a crop action
 * actually ran. `uri`, `width`, `height` always describe the image the caller
 * should now upload — cropped or not.
 */
export interface CropResult {
  uri: string;
  width: number;
  height: number;
  cropped: boolean;
}

/**
 * Minimal subset of the `expo-image-manipulator` API we depend on. Injected as
 * a param so we can unit-test the crop math without pulling in the native
 * module (which requires a Metro/Expo runtime and can't load in Jest).
 *
 * We use `unknown[]` for the actions parameter rather than a narrower type so
 * the real `ImageManipulator.manipulateAsync` (whose actions is a discriminated
 * union) satisfies this signature without a cast at the call site.
 */
export interface ManipulatorLike {
  manipulateAsync: (
    uri: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveOptions: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ uri: string; width: number; height: number } & Record<string, any>>;
  SaveFormatJPEG: unknown;
}

/**
 * Apply the photo bbox returned by the extract Cloud Function to the client-side
 * screenshot before upload.
 *
 * - `bbox === null` → no crop, returns the source image unchanged and
 *   `cropped: false`. This is the URL-share path AND the video-keyframe path
 *   (both of those upload a clean image by construction, so extract returns
 *   `photoBoundingBox: null` and this helper is either not called or short-
 *   circuits here).
 * - `bbox !== null` → runs a single `crop` action on the source URI with
 *   pixel coordinates derived from the normalized bbox * source dimensions.
 *
 * Note on quality: the source image passed in has already been resize+JPEG-
 * encoded upstream (client-side downsampling before the extract call). Cropping
 * from that already-compressed source is cheaper than round-tripping to the
 * original — and the visible quality delta is negligible at the 1568px working
 * size used for Instagram screenshots.
 */
export async function applyPhotoCrop(
  source: { uri: string; width: number; height: number },
  bbox: PhotoBoundingBox | null,
  manipulator: ManipulatorLike,
): Promise<CropResult> {
  if (!bbox) {
    return { uri: source.uri, width: source.width, height: source.height, cropped: false };
  }

  // Clamp the crop rectangle into the source image bounds. The server-side
  // sanity check already rejects overflow, but a defensive clamp here keeps
  // the ImageManipulator call from throwing on floating-point edge cases
  // (e.g. bbox.x + bbox.w = 1.0000000002 after JSON round-trip).
  const originX = Math.max(0, Math.min(source.width - 1, Math.round(bbox.x * source.width)));
  const originY = Math.max(0, Math.min(source.height - 1, Math.round(bbox.y * source.height)));
  const width = Math.max(
    1,
    Math.min(source.width - originX, Math.round(bbox.w * source.width)),
  );
  const height = Math.max(
    1,
    Math.min(source.height - originY, Math.round(bbox.h * source.height)),
  );

  const result = await manipulator.manipulateAsync(
    source.uri,
    [{ crop: { originX, originY, width, height } }],
    // Keep the compression identical to the upstream resize step — one more
    // JPEG round-trip at the same quality is imperceptible; changing the
    // quality here would show up as a visible seam between cropped and
    // uncropped pins.
    { compress: 0.82, format: manipulator.SaveFormatJPEG },
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    cropped: true,
  };
}
