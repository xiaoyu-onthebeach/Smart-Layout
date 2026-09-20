import { PACK_GAP, SECTION_GAP_TOP } from './canvas-layout';

export type SizeBox = { id: string; width: number; height: number };
export type PositionedBox = { id: string; x: number; y: number; width: number; height: number };

/**
 * Stacks boxes, in the given order, into a single left-aligned vertical column — one per row,
 * regardless of width. Order is the caller's to control — MultiPageCanvas sorts a freshly
 * generated batch tallest-first before appending it to a group's member order, but once sizes
 * exist, dragging one to reorder the group re-packs in whatever order that produces.
 */
function packColumn(boxes: SizeBox[]): { items: PositionedBox[]; width: number; height: number } {
  const items: PositionedBox[] = [];
  let y = 0;
  let width = 0;
  for (const box of boxes) {
    items.push({ id: box.id, x: 0, y, width: box.width, height: box.height });
    width = Math.max(width, box.width);
    y += box.height + PACK_GAP;
  }
  return { items, width, height: Math.max(y - PACK_GAP, 0) };
}

export type GroupLayout = {
  /** Everything below is in canvas-space units, relative to the primary's own stored (x, y) position. */
  primaryLabelY: number;
  headerY: number;
  dividerWidth: number;
  contentWidth: number;
  contentHeight: number;
  /** The packed siblings' own width (their widest single item, since they stack in one column) —
   * narrower than `contentWidth` whenever the primary is the wider of the two. The caller uses this
   * (alongside `contentWidth` and the primary's own width) to center the primary card and the
   * sibling pack against each other, rather than both merely left-aligning to the group's origin. */
  siblingsWidth: number;
  siblings: PositionedBox[];
};

/** Lays out a group's "primary size" label, "all size variations" header, and packed siblings
 * below it — siblings stack in a single left-aligned vertical column, one per row. */
export function computeGroupLayout(primary: { width: number; height: number }, siblings: SizeBox[]): GroupLayout {
  const packed = siblings.length > 0 ? packColumn(siblings) : { items: [], width: 0, height: 0 };
  const contentWidth = Math.max(primary.width, packed.width);

  const headerY = primary.height + SECTION_GAP_TOP;
  // Sits right on the divider line itself (`headerY`) — the actual gap down to each sibling's own
  // title bar (PRIMARY_LABEL_RESERVE's sibling-side counterpart, SECTION_GAP_BOTTOM) is entirely
  // MultiPageCanvas's fixed-screen-pixel clearance (see its own `siblingClearance`), not a
  // canvas-space offset here — a canvas-space (zoom-scaled) gap would otherwise visually shrink or
  // grow relative to the fixed-size title bar/divider as the view zooms, instead of staying put.
  const siblingsY = headerY;

  return {
    // Sits right at the primary's own top edge (y=0) — same reasoning as `siblingsY` above:
    // MultiPageCanvas's fixed-screen-pixel clearance supplies the entire visual gap up to the
    // primary's title bar, so this stays zoom-invariant instead of drifting with zoom.
    primaryLabelY: 0,
    headerY,
    dividerWidth: contentWidth,
    contentWidth,
    siblingsWidth: packed.width,
    contentHeight: siblings.length > 0 ? siblingsY + packed.height : primary.height,
    siblings: packed.items.map((item) => ({ ...item, y: item.y + siblingsY })),
  };
}
