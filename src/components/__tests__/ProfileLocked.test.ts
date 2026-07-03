jest.mock('react-native', () => require('./_rnTestUtils').rnMock());

import ProfileLocked, { type ProfileStats } from '../ProfileLocked';
import { colors } from '../../theme';
import { findAll, findFirst, flattenStyle, textContent, walk } from './_rnTestUtils';

const STATS: ProfileStats = { saves: 48, followers: 312, following: 96 };

const render = (overrides: Partial<Parameters<typeof ProfileLocked>[0]> = {}) => {
  const props = {
    handle: 'lerougegorge',
    stats: STATS,
    bio: 'la carte est courte, ils te haïssent pas si tu commandes un verre',
    onFollow: jest.fn(),
    ...overrides,
  };
  return {
    tree: (ProfileLocked as unknown as (p: typeof props) => unknown)(props),
    props,
  };
};

describe('<ProfileLocked />', () => {
  it('surfaces the handle in grotesque black uppercase', () => {
    const { tree } = render({ handle: 'lerougegorge' });
    const texts = findAll(tree, 'Text').map((t) => textContent(t.props.children));
    // Uppercased with @-prefix
    expect(texts.some((t) => t.includes('@LEROUGEGORGE'))).toBe(true);
  });

  it('renders the three stats (saves, followers, following)', () => {
    const { tree } = render();
    const texts = findAll(tree, 'Text').map((t) => textContent(t.props.children));
    expect(texts).toEqual(expect.arrayContaining(['48', '312', '96']));
    expect(texts).toEqual(expect.arrayContaining(['saves', 'followers', 'following']));
  });

  it('renders the bio in italic serif with French quotation marks', () => {
    const bio = 'un petit spot confidentiel';
    const { tree } = render({ bio });
    const texts = findAll(tree, 'Text');
    const bioText = texts.find((t) => textContent(t.props.children).includes(bio));
    expect(bioText).toBeDefined();
    // Quotation marks appear in the wrapper text.
    expect(textContent(bioText!.props.children)).toMatch(/«.*»/);
    const style = flattenStyle(bioText!.props.style);
    expect(style.fontStyle).toBe('italic');
  });

  it('omits the bio block when no bio is provided', () => {
    const { tree } = render({ bio: null });
    const texts = findAll(tree, 'Text').map((t) => textContent(t.props.children));
    // With no bio, the only italic-serif Text left is the locked-map message.
    // Bios are wrapped in guillemets — a filter for them should return nothing.
    const bios = texts.filter((t) => t.includes('«') && !t.includes('réservée'));
    expect(bios).toHaveLength(0);
  });

  it('renders the cerise « Suivre » CTA', () => {
    const { tree } = render();
    const pressables = findAll(tree, 'Pressable');
    expect(pressables.length).toBeGreaterThanOrEqual(1);
    const cta = pressables[0];
    const style = flattenStyle(
      typeof cta.props.style === 'function' ? cta.props.style({ pressed: false }) : cta.props.style,
    );
    expect(style.backgroundColor).toBe(colors.accent);
    const label = findFirst(cta, 'Text');
    expect(label.props.children).toBe('Suivre');
  });

  it('invokes onFollow when the CTA is tapped', () => {
    const spy = jest.fn();
    const { tree } = render({ onFollow: spy });
    const cta = findAll(tree, 'Pressable')[0];
    cta.props.onPress();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('surfaces the locked-map message « Sa carte est réservée à ses followers »', () => {
    const { tree } = render();
    const texts = walk(tree).filter((n): n is { type: string; props: { children?: unknown } } => (n as any)?.type === 'Text');
    const messages = texts.map((t) => textContent(t.props.children));
    expect(messages.some((m) => m.includes('réservée à ses followers'))).toBe(true);
  });

  it('paints the wrapper on the paper ground', () => {
    const { tree } = render();
    const view = findFirst(tree, 'View');
    const style = flattenStyle(view.props.style);
    expect(style.backgroundColor).toBe(colors.paper);
  });

  it('falls back to an initial when no avatar is provided', () => {
    const { tree } = render({ handle: 'kelly', avatar: null });
    const texts = findAll(tree, 'Text').map((t) => textContent(t.props.children));
    expect(texts).toEqual(expect.arrayContaining(['K']));
  });
});
