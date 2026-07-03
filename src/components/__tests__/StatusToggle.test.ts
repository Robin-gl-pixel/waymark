jest.mock('react-native', () => require('./_rnTestUtils').rnMock());

import StatusToggle from '../StatusToggle';
import type { BadgeStatus } from '../BadgeText';
import { colors } from '../../theme';
import { findAll, flattenStyle, textContent, walk } from './_rnTestUtils';

const render = (status: BadgeStatus, onChange: (next: BadgeStatus) => void = () => {}) =>
  (StatusToggle as unknown as (p: { status: BadgeStatus; onChange: (n: BadgeStatus) => void }) => unknown)({ status, onChange });

/** Grab the two Pressable buttons in the order Envie, Allé. */
function buttons(tree: unknown) {
  const all = findAll(tree, 'Pressable');
  expect(all).toHaveLength(2);
  const [envie, alle] = all;
  return { envie, alle };
}

/** Read the label text out of a Pressable subtree. */
function labelOf(pressable: { props: any }): string {
  const [text] = findAll(pressable, 'Text');
  return textContent(text.props.children);
}

describe('<StatusToggle />', () => {
  it('renders both buttons with the correct French labels', () => {
    const { envie, alle } = buttons(render(null));
    expect(labelOf(envie)).toBe('Envie');
    expect(labelOf(alle)).toBe('Allé');
  });

  describe('active state fill (solid ink + paper label)', () => {
    it('paints Envie active + Allé inactive when status is wishlist', () => {
      const { envie, alle } = buttons(render('wishlist'));
      const envieBg = flattenStyle(
        typeof envie.props.style === 'function' ? envie.props.style({ pressed: false }) : envie.props.style,
      ).backgroundColor;
      const alleBg = flattenStyle(
        typeof alle.props.style === 'function' ? alle.props.style({ pressed: false }) : alle.props.style,
      ).backgroundColor;
      expect(envieBg).toBe(colors.ink);
      expect(alleBg).toBe('transparent');

      // Labels flip too — active is paper, inactive is ink.
      const envieLabel = findAll(envie, 'Text')[0];
      const alleLabel = findAll(alle, 'Text')[0];
      expect(flattenStyle(envieLabel.props.style).color).toBe(colors.paper);
      expect(flattenStyle(alleLabel.props.style).color).toBe(colors.ink);
    });

    it('paints Allé active + Envie inactive when status is visited', () => {
      const { envie, alle } = buttons(render('visited'));
      const envieBg = flattenStyle(
        typeof envie.props.style === 'function' ? envie.props.style({ pressed: false }) : envie.props.style,
      ).backgroundColor;
      const alleBg = flattenStyle(
        typeof alle.props.style === 'function' ? alle.props.style({ pressed: false }) : alle.props.style,
      ).backgroundColor;
      expect(envieBg).toBe('transparent');
      expect(alleBg).toBe(colors.ink);
    });

    it('paints both inactive when status is null', () => {
      const { envie, alle } = buttons(render(null));
      const envieBg = flattenStyle(
        typeof envie.props.style === 'function' ? envie.props.style({ pressed: false }) : envie.props.style,
      ).backgroundColor;
      const alleBg = flattenStyle(
        typeof alle.props.style === 'function' ? alle.props.style({ pressed: false }) : alle.props.style,
      ).backgroundColor;
      expect(envieBg).toBe('transparent');
      expect(alleBg).toBe('transparent');
    });
  });

  describe('onChange contract', () => {
    it('tapping Envie from null sets wishlist', () => {
      const spy = jest.fn();
      const { envie } = buttons(render(null, spy));
      envie.props.onPress();
      expect(spy).toHaveBeenCalledWith('wishlist');
    });

    it('tapping Allé from null sets visited', () => {
      const spy = jest.fn();
      const { alle } = buttons(render(null, spy));
      alle.props.onPress();
      expect(spy).toHaveBeenCalledWith('visited');
    });

    it('tapping the currently-active button clears status (calls onChange(null))', () => {
      const spy = jest.fn();
      const { envie } = buttons(render('wishlist', spy));
      envie.props.onPress();
      expect(spy).toHaveBeenCalledWith(null);
    });

    it('tapping the currently-active Allé also clears status', () => {
      const spy = jest.fn();
      const { alle } = buttons(render('visited', spy));
      alle.props.onPress();
      expect(spy).toHaveBeenCalledWith(null);
    });

    it('tapping the inactive button while the other is active switches status', () => {
      const spy = jest.fn();
      const { alle } = buttons(render('wishlist', spy));
      alle.props.onPress();
      expect(spy).toHaveBeenCalledWith('visited');
    });
  });

  it('accessibilityState.selected mirrors the active button', () => {
    const { envie, alle } = buttons(render('wishlist'));
    expect(envie.props.accessibilityState?.selected).toBe(true);
    expect(alle.props.accessibilityState?.selected).toBe(false);
  });

  // Sanity — the whole tree only wraps two Pressables in a row.
  it('renders exactly two Pressables', () => {
    expect(walk(render('wishlist')).filter((n) => (n as any)?.type === 'Pressable')).toHaveLength(2);
  });
});
