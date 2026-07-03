import { applyPhotoCrop, ManipulatorLike } from '../screenshotCrop';
import { PhotoBoundingBox } from '../../types/Lieu';

/**
 * Build a spy manipulator that records every manipulateAsync call and returns
 * a stable result whose dimensions echo the crop it received. Lets tests assert
 * both the crop rectangle passed in AND the resulting CropResult shape.
 */
type CropAction = { crop: { originX: number; originY: number; width: number; height: number } };
function isCropAction(a: unknown): a is CropAction {
  return typeof a === 'object' && a !== null && 'crop' in a;
}

function makeManipulator() {
  const calls: Array<{
    uri: string;
    actions: unknown[];
    saveOptions: unknown;
  }> = [];
  const impl: ManipulatorLike = {
    manipulateAsync: jest.fn(async (uri, actions, saveOptions) => {
      calls.push({ uri, actions, saveOptions });
      const cropAction = actions.find(isCropAction);
      if (!cropAction) {
        return { uri: `${uri}#unchanged`, width: 100, height: 100 };
      }
      return {
        uri: `${uri}#cropped`,
        width: cropAction.crop.width,
        height: cropAction.crop.height,
      };
    }),
    SaveFormatJPEG: 'jpeg',
  };
  return { impl, calls };
}

describe('applyPhotoCrop', () => {
  const source = { uri: 'file:///tmp/original.jpg', width: 1000, height: 2000 };

  describe('bbox is null (URL / video / no-crop paths)', () => {
    it('returns the source unchanged with cropped=false', async () => {
      const { impl, calls } = makeManipulator();

      const result = await applyPhotoCrop(source, null, impl);

      expect(result).toEqual({
        uri: source.uri,
        width: source.width,
        height: source.height,
        cropped: false,
      });
      // Critical: never call the native crop when the server returned null,
      // otherwise URL-share and video-keyframe paths would waste a JPEG cycle
      // and change the uploaded file for no reason.
      expect(calls).toHaveLength(0);
    });
  });

  describe('bbox is non-null (screenshot-share happy path)', () => {
    it('crops with pixel coords derived from normalized bbox * source dims', async () => {
      const { impl, calls } = makeManipulator();
      // 10% inset on left, 15% on top, 80% wide × 70% tall.
      const bbox: PhotoBoundingBox = { x: 0.1, y: 0.15, w: 0.8, h: 0.7 };

      const result = await applyPhotoCrop(source, bbox, impl);

      expect(calls).toHaveLength(1);
      expect(calls[0].uri).toBe(source.uri);
      expect(calls[0].actions).toEqual([
        {
          crop: {
            originX: 100, //  0.1 * 1000
            originY: 300, // 0.15 * 2000
            width: 800, //   0.8 * 1000
            height: 1400, // 0.7 * 2000
          },
        },
      ]);
      // Result dims match the crop rectangle — this is exactly the assertion
      // the issue's acceptance criteria calls for ("createLieu receives an image
      // whose dimensions match the bbox crop").
      expect(result).toEqual({
        uri: `${source.uri}#cropped`,
        width: 800,
        height: 1400,
        cropped: true,
      });
    });

    it('passes JPEG format + 0.82 compress to the manipulator', async () => {
      const { impl, calls } = makeManipulator();

      await applyPhotoCrop(source, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, impl);

      expect(calls[0].saveOptions).toEqual({ compress: 0.82, format: 'jpeg' });
    });

    it('handles a 1:1 feed-post bbox (aspect 1, area ~64%)', async () => {
      const { impl } = makeManipulator();
      const square = { uri: 'file:///s.jpg', width: 1200, height: 1600 };

      const result = await applyPhotoCrop(
        square,
        { x: 0.1, y: 0.2, w: 0.8, h: 0.6 },
        impl,
      );

      // 0.8 * 1200 = 960 wide, 0.6 * 1600 = 960 tall → 1:1 as expected.
      expect(result.width).toBe(960);
      expect(result.height).toBe(960);
      expect(result.cropped).toBe(true);
    });

    it('handles a 9:16 reel bbox (aspect ~0.56, area ~50%)', async () => {
      const { impl } = makeManipulator();
      const portrait = { uri: 'file:///p.jpg', width: 900, height: 1600 };

      const result = await applyPhotoCrop(
        portrait,
        { x: 0.05, y: 0.1, w: 0.45, h: 0.8 },
        impl,
      );

      // 0.45 * 900 = 405 wide, 0.8 * 1600 = 1280 tall.
      expect(result.width).toBe(405);
      expect(result.height).toBe(1280);
      // Aspect ~0.32 (portrait 9:16-ish given the crop).
      expect(result.cropped).toBe(true);
    });

    it('clamps a bbox that overflows the source by floating-point drift', async () => {
      const { impl, calls } = makeManipulator();
      // Simulates 0.999999... rounding to 1 in normalized coords — happens
      // occasionally after JSON round-trip through the Cloud Function.
      const bbox: PhotoBoundingBox = { x: 0.5, y: 0.5, w: 0.5000000001, h: 0.5000000001 };

      await applyPhotoCrop(source, bbox, impl);

      const action = calls[0].actions[0];
      if (!isCropAction(action)) throw new Error('expected crop action');
      // originX + width must not exceed source width, same for height.
      expect(action.crop.originX + action.crop.width).toBeLessThanOrEqual(source.width);
      expect(action.crop.originY + action.crop.height).toBeLessThanOrEqual(source.height);
    });
  });
});
