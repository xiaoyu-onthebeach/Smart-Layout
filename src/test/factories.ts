import type { Layout, LayoutElement } from '@/types';

/** A minimal decorative layer for tests — only the fields a test cares about need passing. */
export function el(id: string, frame: LayoutElement['frame'], overrides: Partial<LayoutElement> = {}): LayoutElement {
  return { id, kind: 'shape', slot: null, frame, style: {}, visible: true, ...overrides };
}

/** A minimal banner for tests. */
export function layout(elements: LayoutElement[], size = { width: 600, height: 500 }): Layout {
  return {
    id: 'layout-1',
    setId: 'set-1',
    productId: 'product-1',
    size: { ...size, label: `${size.width}x${size.height}` },
    sizeClass: 'square',
    ruleSetId: 'rules-1',
    elements,
    isSource: true,
    detached: false,
    adaptationNotes: [],
  } as Layout;
}
