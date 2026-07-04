jest.mock('react-native', () => {
  const base = require('./_rnTestUtils').rnMock();
  // The tutorial modal wraps its content in <Modal> and scrolls the three
  // slots inside a <ScrollView>. Both are stubbed as tag strings so
  // walk()/findAll() see through them exactly like the mocked View/Text.
  return { ...base, Modal: 'Modal', ScrollView: 'ScrollView' };
});

// Vector icons pull the native font asset at import time — stub the whole
// module to a tag-string factory so the test env stays Node-only.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

import ShareExtensionTutorialModal from '../ShareExtensionTutorialModal';
import { findAll, findFirst, textContent } from './_rnTestUtils';

/**
 * Slice B / issue #79 modal contract:
 *   - three slots (screenshot placeholders) + descriptive text
 *   - one close button that fires `onClose`
 *   - `visible` toggle is passed through to the RN <Modal>
 *
 * Rendered as a plain function (no hooks) — same pattern as the other
 * component tests in this folder.
 */
const render = (overrides: Partial<Parameters<typeof ShareExtensionTutorialModal>[0]> = {}) => {
  const props = {
    visible: true,
    onClose: jest.fn(),
    ...overrides,
  };
  return {
    tree: (ShareExtensionTutorialModal as unknown as (p: typeof props) => unknown)(props),
    props,
  };
};

describe('<ShareExtensionTutorialModal />', () => {
  it('forwards the `visible` prop to the underlying <Modal>', () => {
    // The parent (MapScreen) owns visibility state; the modal must not
    // second-guess it. A regression here would leave the modal permanently
    // open or permanently closed regardless of the tap.
    const { tree } = render({ visible: false });
    const modal = findFirst(tree, 'Modal');
    expect(modal.props.visible).toBe(false);

    const { tree: openTree } = render({ visible: true });
    expect(findFirst(openTree, 'Modal').props.visible).toBe(true);
  });

  it('renders exactly three screenshot slot frames', () => {
    // AC #79 : « La modal contient 3 slots screenshot (placeholders acceptés) ».
    // The count is load-bearing — the three-step Share Extension flow can't
    // collapse to two or grow to four without redoing the copy.
    const { tree } = render();
    const todos = findAll(tree, 'Text').filter((t) =>
      textContent(t.props.children).includes('TODO screenshot'),
    );
    expect(todos).toHaveLength(3);
  });

  it('surfaces the three ordered step captions (Étape 1, 2, 3)', () => {
    // Order is load-bearing: user reads top-to-bottom. A silent shuffle
    // would teach the wrong flow.
    const { tree } = render();
    const eyebrows = findAll(tree, 'Text')
      .map((t) => textContent(t.props.children))
      .filter((s) => /^Étape [123]$/.test(s));
    expect(eyebrows).toEqual(['Étape 1', 'Étape 2', 'Étape 3']);
  });

  it('mentions « Waymark Share » in one of the step captions', () => {
    // The whole point of the modal is to name the Share Extension by its
    // exact iOS share-sheet label so the user recognises it when scrolling.
    const { tree } = render();
    const texts = findAll(tree, 'Text').map((t) => textContent(t.props.children));
    expect(texts.some((t) => t.includes('Waymark Share'))).toBe(true);
  });

  it('renders a close button labelled « Fermer »', () => {
    // AC #79 : « un bouton fermer ». The user must have a way out.
    const { tree } = render();
    const closes = findAll(tree, 'Pressable');
    expect(closes).toHaveLength(1);
    const label = findFirst(closes[0], 'Text');
    expect(label.props.children).toBe('Fermer');
  });

  it('fires onClose when the close button is tapped', () => {
    const spy = jest.fn();
    const { tree } = render({ onClose: spy });
    const [close] = findAll(tree, 'Pressable');
    close.props.onPress();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('routes hardware back / onRequestClose through onClose', () => {
    // iOS-only build has no hardware back, but RN Modal always calls
    // onRequestClose on backdrop-tap-esque events. Wire it to onClose so
    // the modal stays dismissible via any RN-provided path.
    const spy = jest.fn();
    const { tree } = render({ onClose: spy });
    const modal = findFirst(tree, 'Modal');
    modal.props.onRequestClose();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
