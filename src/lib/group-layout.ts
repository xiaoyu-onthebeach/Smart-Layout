import { MIN_PACK_ROW_WIDTH, PACK_GAP, PRIMARY_LABEL_RESERVE, SECTION_GAP_BOTTOM, SECTION_GAP_TOP, SECTION_HEADER_HEIGHT } from './canvas-layout';

export type SizeBox = { id: string; width: number; height: number };
export type PositionedBox = { id: string; x: number; y: number; width: number; height: number };

/**
 * Shelf-packs boxes, in the given order, into rows no wider than `maxRowWidth`, top-aligned per
 * row. Order is the caller's to control — MultiPageCanvas sorts a freshly generated batch
 * tallest-first before appending it to a group's member order, but once sizes exist, dragging one
 * to reorder the group re-packs in whatever order that produces, not by height again.
 */
function packShelves(boxes: SizeBox[], maxRowWidth: number): { items: PositionedBox[]; width: number; height: number } {
  const rows: SizeBox[][] = [];
  let row: SizeBox[] = [];
  let rowWidth = 0;

  for (const box of boxes) {
    const addedWidth = row.length ? PACK_GAP + box.width : box.width;
    if (row.length && rowWidth + addedWidth > maxRowWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(box);
    rowWidth += row.length > 1 ? PACK_GAP + box.width : box.width;
  }
  if (row.length) rows.push(row);

  const items: PositionedBox[] = [];
  let y = 0;
  let width = 0;
  for (const r of rows) {
    let x = 0;
    const rowHeight = Math.max(...r.map((b) => b.height));
    for (const box of r) {
      items.push({ id: box.id, x, y, width: box.width, height: box.height });
      x += box.width + PACK_GAP;
    }
    width = Math.max(width, x - PACK_GAP);
    y += rowHeight + PACK_GAP;
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
  siblings: PositionedBox[];
};

/** Lays out a group's "primary size" label, "all size variations" header, and packed siblings below it. */
export function computeGroupLayout(primary: { width: number; height: number }, siblings: SizeBox[]): GroupLayout {
  const maxRowWidth = Math.max(primary.width, MIN_PACK_ROW_WIDTH);
  const packed = siblings.length > 0 ? packShelves(siblings, maxRowWidth) : { items: [], width: 0, height: 0 };
  const contentWidth = Math.max(primary.width, packed.width);

  const headerY = primary.height + SECTION_GAP_TOP;
  const siblingsY = headerY + SECTION_HEADER_HEIGHT + SECTION_GAP_BOTTOM;

  return {
    // Purely the native-space visual gap — MultiPageCanvas adds further fixed-screen-pixel
    // clearance on top of this for the primary's title bar, independent of zoom.
    primaryLabelY: -PRIMARY_LABEL_RESERVE,
    headerY,
    dividerWidth: contentWidth,
    contentWidth,
    contentHeight: siblings.length > 0 ? siblingsY + packed.height : primary.height,
    siblings: packed.items.map((item) => ({ ...item, y: item.y + siblingsY })),
  };
}
