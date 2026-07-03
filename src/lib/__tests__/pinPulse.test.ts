// react-native imports crash under jest's node env — mock the module with
// a minimal Animated surface that mirrors the real API's shape enough for
// `createPinPulse` to build (and for us to inspect) a composite animation.
jest.mock('react-native', () => {
  const timingCalls: Array<{ value: unknown; config: Record<string, unknown> }> = [];
  const Animated = {
    Value: class {
      _v: number;
      constructor(v: number) {
        this._v = v;
      }
    },
    timing: (value: unknown, config: Record<string, unknown>) => {
      timingCalls.push({ value, config });
      return { __kind: 'timing', value, config };
    },
    sequence: (steps: unknown[]) => ({ __kind: 'sequence', steps }),
    __timingCalls: timingCalls,
  };
  return { Animated };
});

import { Animated } from 'react-native';
import { createPinPulse, PIN_PULSE_HALF_DURATION_MS, PIN_PULSE_TARGET_SCALE } from '../pinPulse';

type MockAnimated = typeof Animated & {
  __timingCalls: Array<{ value: unknown; config: Record<string, unknown> }>;
};
const mocked = Animated as MockAnimated;

describe('createPinPulse', () => {
  beforeEach(() => {
    mocked.__timingCalls.length = 0;
  });

  it('returns null when reduced motion is enabled (accessibility gate)', () => {
    const value = new Animated.Value(1);
    const anim = createPinPulse(value, { reducedMotion: true });
    expect(anim).toBeNull();
    expect(mocked.__timingCalls).toHaveLength(0);
  });

  it('builds a sequence of two timings when motion is allowed', () => {
    const value = new Animated.Value(1);
    const anim = createPinPulse(value, { reducedMotion: false }) as {
      __kind: string;
      steps: Array<{ __kind: string }>;
    } | null;

    expect(anim).not.toBeNull();
    expect(anim!.__kind).toBe('sequence');
    expect(anim!.steps).toHaveLength(2);
    expect(anim!.steps[0].__kind).toBe('timing');
    expect(anim!.steps[1].__kind).toBe('timing');
  });

  it('pulses to the target scale then returns to 1', () => {
    const value = new Animated.Value(1);
    createPinPulse(value, { reducedMotion: false });

    expect(mocked.__timingCalls).toHaveLength(2);
    expect(mocked.__timingCalls[0].config.toValue).toBe(PIN_PULSE_TARGET_SCALE);
    expect(mocked.__timingCalls[1].config.toValue).toBe(1);
  });

  it('uses the same half-duration for up and down legs (250ms round-trip default)', () => {
    const value = new Animated.Value(1);
    createPinPulse(value, { reducedMotion: false });

    expect(mocked.__timingCalls[0].config.duration).toBe(PIN_PULSE_HALF_DURATION_MS);
    expect(mocked.__timingCalls[1].config.duration).toBe(PIN_PULSE_HALF_DURATION_MS);
  });

  it('honors custom targetScale and halfDurationMs overrides', () => {
    const value = new Animated.Value(1);
    createPinPulse(value, { reducedMotion: false, targetScale: 1.5, halfDurationMs: 40 });

    expect(mocked.__timingCalls[0].config.toValue).toBe(1.5);
    expect(mocked.__timingCalls[0].config.duration).toBe(40);
    expect(mocked.__timingCalls[1].config.duration).toBe(40);
  });

  it('drives the same Animated.Value across both legs (single pin, one node)', () => {
    const value = new Animated.Value(1);
    createPinPulse(value, { reducedMotion: false });

    expect(mocked.__timingCalls[0].value).toBe(value);
    expect(mocked.__timingCalls[1].value).toBe(value);
  });
});
