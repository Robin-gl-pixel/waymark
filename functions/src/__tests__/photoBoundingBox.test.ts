/**
 * Server-side sanity check for the photo bounding box returned by Claude Vision.
 *
 * The extract Cloud Function accepts a bbox from the model but never trusts it
 * blindly — Claude occasionally hallucinates absurd slivers or near-fullscreen
 * boxes that would degrade the hero image on the resulting pin. We enforce two
 * numeric guards (aspect ratio + area) before returning it to the client:
 *
 *   - aspect ratio (w/h) ∈ [0.4, 2.5]
 *   - area (w*h)         ∈ [0.25, 0.9]
 *
 * Anything outside that window, or malformed, returns null → the client skips
 * the crop and uploads the raw screenshot.
 */

import { sanitizePhotoBoundingBox } from '../lib/claude';

describe('sanitizePhotoBoundingBox', () => {
  it('passes a well-formed valid bbox through unchanged', () => {
    // 0.8 * 0.7 = 0.56 area, aspect 0.8/0.7 ≈ 1.14 — well inside both windows.
    const bbox = { x: 0.1, y: 0.15, w: 0.8, h: 0.7 };
    expect(sanitizePhotoBoundingBox(bbox)).toEqual(bbox);
  });

  it('passes a typical 1:1 feed-post bbox (aspect 1, area ~64%)', () => {
    const bbox = { x: 0.1, y: 0.18, w: 0.8, h: 0.8 };
    expect(sanitizePhotoBoundingBox(bbox)).toEqual(bbox);
  });

  it('passes a typical 9:16 reel-screenshot bbox (aspect ~0.56, area ~50%)', () => {
    // 9:16 → w/h = 0.5625 which is above the 0.4 floor.
    const bbox = { x: 0.05, y: 0.1, w: 0.45, h: 0.8 };
    expect(sanitizePhotoBoundingBox(bbox)).toEqual(bbox);
  });

  describe('rejects out-of-range bboxes', () => {
    // Table-driven: each row is [label, bbox]. All rows must return null.
    const cases: Array<[string, unknown]> = [
      // Aspect ratio too low (very tall + narrow)
      // w/h = 0.1/0.5 = 0.2 < 0.4
      ['aspect < 0.4 (narrow sliver)', { x: 0.4, y: 0.25, w: 0.1, h: 0.5 }],
      // Aspect ratio too high (very wide + short)
      // w/h = 0.9/0.3 = 3.0 > 2.5
      ['aspect > 2.5 (letterbox strip)', { x: 0.05, y: 0.4, w: 0.9, h: 0.3 }],
      // Area too small
      // 0.4 * 0.5 = 0.20 < 0.25
      ['area < 25% (tiny box)', { x: 0.1, y: 0.1, w: 0.4, h: 0.5 }],
      // Area too large
      // 0.95 * 0.95 = 0.9025 > 0.9
      ['area > 90% (near-fullscreen)', { x: 0.02, y: 0.02, w: 0.95, h: 0.95 }],
    ];

    it.each(cases)('%s → null', (_label, bbox) => {
      expect(sanitizePhotoBoundingBox(bbox)).toBeNull();
    });
  });

  describe('rejects malformed input', () => {
    const cases: Array<[string, unknown]> = [
      ['null input', null],
      ['undefined input', undefined],
      ['string input', 'not a bbox'],
      ['number input', 42],
      ['array input', [0.1, 0.1, 0.8, 0.8]],
      ['empty object', {}],
      ['missing w', { x: 0.1, y: 0.1, h: 0.8 }],
      ['missing h', { x: 0.1, y: 0.1, w: 0.8 }],
      ['non-numeric field', { x: '0.1', y: 0.1, w: 0.8, h: 0.8 }],
      ['NaN field', { x: NaN, y: 0.1, w: 0.8, h: 0.8 }],
      ['Infinity field', { x: 0.1, y: 0.1, w: Infinity, h: 0.8 }],
      ['negative x', { x: -0.1, y: 0.1, w: 0.8, h: 0.8 }],
      ['zero width', { x: 0.1, y: 0.1, w: 0, h: 0.8 }],
      ['negative height', { x: 0.1, y: 0.1, w: 0.8, h: -0.5 }],
      // x+w > 1 → box overflows the right edge
      ['overflow right edge', { x: 0.4, y: 0.1, w: 0.7, h: 0.5 }],
      // y+h > 1 → box overflows the bottom edge
      ['overflow bottom edge', { x: 0.1, y: 0.5, w: 0.5, h: 0.6 }],
    ];

    it.each(cases)('%s → null', (_label, bbox) => {
      expect(sanitizePhotoBoundingBox(bbox)).toBeNull();
    });
  });

  it('accepts a bbox comfortably inside the aspect-ratio window', () => {
    // Aspect 0.5 (well above the 0.4 floor), area 0.4 (inside 25-90%).
    const bbox = { x: 0.25, y: 0.1, w: 0.4, h: 0.8 };
    expect(sanitizePhotoBoundingBox(bbox)).toEqual(bbox);
  });
});
