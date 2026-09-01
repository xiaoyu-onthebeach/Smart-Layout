import type { AppState } from '@/store/types';

/**
 * Shared canvas-space layout constants for the view-all canvas — used both by
 * MultiPageCanvas (to draw group container boxes) and by the store (to place
 * new pages with a gap that visually matches the gap between existing pages).
 */
export const PAGE_GAP = 240;

// 24px padding on every side, plus room for whatever sits inside that padding band:
// the group's own title row above, and the right/bottom "+" hotspot zones.
export const GROUP_PAD = 24;
export const GROUP_TITLE_RESERVE = 36; // group title row height + gap before the page's own title starts
export const PRIMARY_LABEL_RESERVE = 120; // "Primary size" label row height + gap, above the primary's own title bar
export const PAGE_TITLE_RESERVE = 28; // matches PageTitleBar's -top-7 offset above each frame
export const HOTSPOT_RESERVE = 64; // matches the w-16/h-16 hotspot zone on the right/bottom edges
export const GROUP_PAD_TOP = GROUP_PAD + GROUP_TITLE_RESERVE + PRIMARY_LABEL_RESERVE + PAGE_TITLE_RESERVE;
export const GROUP_PAD_RIGHT = GROUP_PAD + HOTSPOT_RESERVE;
export const GROUP_PAD_BOTTOM = GROUP_PAD + HOTSPOT_RESERVE;
// The left edge has no hotspot/title to reserve room for, but keeping it visually even with the
// other three sides matters more than the (unused) extra room, so it matches the right side.
export const GROUP_PAD_LEFT = GROUP_PAD_RIGHT;

// Vertical rhythm for a group's "all size variations" section, between the primary frame's
// bottom edge and the packed row of sibling sizes below it — pure canvas-space (zoom-scaled) gaps.
// Separately, MultiPageCanvas adds a *fixed*-screen-pixel clearance on top of these (divided by
// the current zoom) so the primary's and each sibling's title bar — a fixed -28px screen offset
// that doesn't shrink along with zoom — never collides with the label/divider above it, at any
// zoom level, not just the one these constants happen to look right at.
export const SECTION_GAP_TOP = PAGE_GAP;
export const SECTION_HEADER_HEIGHT = 40;
export const SECTION_GAP_BOTTOM = 64;
// Extra buffer (screen px) beyond PAGE_TITLE_RESERVE itself when converting that fixed clearance
// into the current zoom's canvas-space units.
export const TITLE_CLEARANCE_BUFFER = 16;
// Gap between packed sibling boxes — smaller than PAGE_GAP since these read as one related set,
// not independent top-level pages.
export const PACK_GAP = 160;
// Siblings wrap onto a new shelf past this width; floored at the primary's own width so a single
// oversized sibling never has to squeeze narrower than the primary itself. 3450 native px reads as
// 3450 screen px at 100% zoom — wide enough that the sizes named in position-overlay-spec.md all
// fit across a couple of shelves without wrapping too aggressively.
export const MIN_PACK_ROW_WIDTH = 3450;

// A page that's part of a group sits inside a visually padded container box, so its *effective*
// bottom edge (for gap purposes) is further down than its raw frame — otherwise the gap above a
// group would look smaller than the gap between two ordinary sibling pages. GROUP_PAD_BOTTOM is a
// fixed *screen*-pixel reserve that doesn't scale with the view-all camera's zoom, so no canvas-
// space value matches it exactly at every zoom level — the ×4 factor is tuned to look right at the
// zoom levels a page or two of content actually renders at; it can drift at extreme zoom-outs.
/** The y just below every existing top-level page, with `gap` clearance — used to stack new pages. */
export function nextStackY(
  state: Pick<AppState, 'pageOrder' | 'pagePositions' | 'setsById' | 'layoutsById' | 'pageGroupIdByPage'>,
  gap: number,
): number {
  let maxBottom = 0;
  for (const pageId of state.pageOrder) {
    const pageSet = state.setsById[pageId];
    const layout = pageSet ? state.layoutsById[pageSet.sourceLayoutId] : null;
    const p = state.pagePositions[pageId] ?? { x: 0, y: 0 };
    if (!layout) continue;
    const inGroup = Boolean(state.pageGroupIdByPage[pageId]);
    const bottom = p.y + layout.size.height + (inGroup ? GROUP_PAD_BOTTOM * 4 : 0);
    maxBottom = Math.max(maxBottom, bottom);
  }
  return state.pageOrder.length ? maxBottom + gap : 0;
}
