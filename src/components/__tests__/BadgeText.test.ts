jest.mock('react-native', () => require('./_rnTestUtils').rnMock());

import BadgeText, { type BadgeStatus } from '../BadgeText';
import { colors } from '../../theme';
import { findAll, findFirst, flattenStyle } from './_rnTestUtils';

// Functional component with no hooks → safe to invoke as a plain function.
const render = (status: BadgeStatus) => (BadgeText as unknown as (p: { status: BadgeStatus }) => unknown)({ status });

describe('<BadgeText />', () => {
  it('returns null when status is null', () => {
    expect(render(null)).toBeNull();
  });

  it('renders « Envie » in catCafe for wishlist', () => {
    const tree = render('wishlist');
    const text = findFirst(tree, 'Text');
    expect(text.props.children).toBe('Envie');
    const style = flattenStyle(text.props.style);
    expect(style.color).toBe(colors.catCafe);
  });

  it('renders « Allé » in catBar for visited', () => {
    const tree = render('visited');
    const text = findFirst(tree, 'Text');
    expect(text.props.children).toBe('Allé');
    const style = flattenStyle(text.props.style);
    expect(style.color).toBe(colors.catBar);
  });

  it('uses mono uppercase styling with wide letter-spacing (~0.2em)', () => {
    for (const status of ['wishlist', 'visited'] as const) {
      const tree = render(status);
      const text = findFirst(tree, 'Text');
      const style = flattenStyle(text.props.style);
      expect(style.textTransform).toBe('uppercase');
      // 0.2em at 12px = 2.4px — the token uses letterSpacing 2.4.
      expect(style.letterSpacing).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('produces at most one Text element per render', () => {
    expect(findAll(render('wishlist'), 'Text')).toHaveLength(1);
    expect(findAll(render('visited'), 'Text')).toHaveLength(1);
  });
});
