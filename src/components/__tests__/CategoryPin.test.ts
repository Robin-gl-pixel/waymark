jest.mock('react-native', () => require('./_rnTestUtils').rnMock());

import CategoryPin from '../CategoryPin';
import { categoryColor } from '../../theme';
import type { LieuCategory } from '../../types/Lieu';
import { findFirst, flattenStyle } from './_rnTestUtils';

const render = (props: { category: LieuCategory; size?: number }) =>
  (CategoryPin as unknown as (p: typeof props) => unknown)(props);

const CATEGORIES: LieuCategory[] = ['resto', 'bar', 'café', 'activité', 'musée', 'hôtel', 'autre'];

describe('<CategoryPin />', () => {
  it.each(CATEGORIES)('paints a %s pin in its category color', (category) => {
    const tree = render({ category });
    const view = findFirst(tree, 'View');
    const style = flattenStyle(view.props.style);
    expect(style.backgroundColor).toBe(categoryColor(category));
  });

  it('defaults to a 14px circle', () => {
    const view = findFirst(render({ category: 'resto' }), 'View');
    const style = flattenStyle(view.props.style);
    expect(style.width).toBe(14);
    expect(style.height).toBe(14);
    expect(style.borderRadius).toBe(7);
  });

  it('scales width, height and borderRadius from the size prop', () => {
    const view = findFirst(render({ category: 'bar', size: 24 }), 'View');
    const style = flattenStyle(view.props.style);
    expect(style.width).toBe(24);
    expect(style.height).toBe(24);
    expect(style.borderRadius).toBe(12);
  });

  it('carries a subtle shadow so the dot lifts off paper', () => {
    const view = findFirst(render({ category: 'musée' }), 'View');
    const style = flattenStyle(view.props.style);
    expect(style.shadowOpacity).toBeGreaterThan(0);
    expect(style.shadowOpacity).toBeLessThan(0.5);
  });

  it('renders no text inside the pin', () => {
    const view = findFirst(render({ category: 'hôtel' }), 'View');
    expect(view.props.children).toBeFalsy();
  });
});
