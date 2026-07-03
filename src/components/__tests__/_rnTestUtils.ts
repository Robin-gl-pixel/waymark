// Shared React-Native mock helpers for component tests.
//
// The seam-style test env is plain Node — importing react-native crashes
// on its Flow-typed entry point. Each component test file `jest.mock`s
// 'react-native' up-front (the mock is hoisted), then imports these helpers
// to walk the returned React element tree.

/**
 * Manual mock factory for 'react-native'. Call from `jest.mock('react-native', rnMock)`.
 * Primitives become string tag names so they show up in `.type` for filtering.
 */
export function rnMock() {
  const StyleSheet = {
    create: <T,>(s: T): T => s,
    flatten: (s: unknown): Record<string, unknown> => {
      if (s == null || s === false) return {};
      if (Array.isArray(s)) {
        return Object.assign(
          {},
          ...s.flat(Infinity).filter((v: unknown) => v && typeof v === 'object'),
        );
      }
      return typeof s === 'object' ? (s as Record<string, unknown>) : {};
    },
    absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  };
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    StyleSheet,
  };
}

/**
 * Recursively walk a React element tree and return every element + primitive
 * child as a flat array. Non-elements (booleans, null, undefined) are skipped.
 *
 * Nested functional components (e.g. inline helpers like `Stat` or
 * `ToggleButton`) are invoked with their props so their subtree is expanded —
 * without this, `findAll(tree, 'Text')` would miss anything inside an FC. Only
 * safe for hook-free FCs, which is our contract for the shared components.
 */
export function walk(node: unknown): unknown[] {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node !== 'object') return [node];
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (typeof el.type === 'function') {
    const rendered = (el.type as (p: unknown) => unknown)(el.props ?? {});
    return [node, ...walk(rendered)];
  }
  const out: unknown[] = [node];
  const children = el.props?.children;
  if (children != null) out.push(...walk(children));
  return out;
}

/** Predicate helper — "is React element with type X". */
export function isElement(node: unknown, type: string): node is { type: string; props: any } {
  return (
    typeof node === 'object' && node !== null && (node as { type?: unknown }).type === type
  );
}

/** Filter walk() results down to elements of the given tag. */
export function findAll(root: unknown, type: string): Array<{ type: string; props: any }> {
  return walk(root).filter((n): n is { type: string; props: any } => isElement(n, type));
}

/** Convenience — first match. Throws if not found so tests fail loudly. */
export function findFirst(root: unknown, type: string): { type: string; props: any } {
  const [first] = findAll(root, type);
  if (!first) throw new Error(`Expected to find a <${type}> in the tree`);
  return first;
}

/**
 * Serialize a React children prop (which may be a single value, an array, or a
 * mix of strings/numbers) into a flat string. Handles the case where JSX like
 * `<Text>@{name}</Text>` compiles into two positional children.
 */
export function textContent(children: unknown): string {
  if (children == null || typeof children === 'boolean') return '';
  if (Array.isArray(children)) return children.map(textContent).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (typeof children === 'object') {
    const el = children as { props?: { children?: unknown } };
    return textContent(el.props?.children);
  }
  return '';
}

/** Flatten a RN-style style prop (array/nested/false-guarded) into a single object. */
export function flattenStyle(style: unknown): Record<string, unknown> {
  if (style == null || style === false) return {};
  if (Array.isArray(style)) {
    return Object.assign(
      {},
      ...style.flat(Infinity).map((s) => flattenStyle(s)),
    );
  }
  return typeof style === 'object' ? (style as Record<string, unknown>) : {};
}
