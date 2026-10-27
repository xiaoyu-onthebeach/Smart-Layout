import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { computeSnap } from '@/lib/snap-guides';

export const MIN_SIZE = 24;
// Corners resize both axes; edge midpoints resize a single axis.
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];
// Same threshold MultiPageCanvas uses to tell a still click from a real drag for scenes — shared
// here so clicking one of several already-selected layers only collapses the selection down to
// just that one if the mouse never actually moves; a real drag moves the whole group instead.
export const ELEMENT_PAN_THRESHOLD = 4;

// Shown while Option/Alt is held over a draggable layer, hinting that starting a drag now
// duplicates it instead of moving it (same `url(...) hotspotX hotspotY, fallback` shape as
// SelectionBoundingBox's own ROTATE_CURSOR). The asset's filename has a literal space, which a raw
// `url()` can't parse — percent-encoded here instead of renaming the file on disk.
export const DUPLICATE_CURSOR = "url('/icons/duplicate%2024.svg') 12 12, copy";

/** Every OTHER currently-selected element in this same layout, paired with its own starting frame
 * — a cross-scene match-select can put refs from other layouts into `selectedElements` too, which
 * have no business moving with a same-scene drag, so this filters to just this layout. */
function collectGroupFrames(layoutId: string, elementId: string) {
  const state = useAppStore.getState();
  return state.selectedElements
    .filter((r) => r.layoutId === layoutId && r.elementId !== elementId)
    .map((r) => {
      const el = state.layoutsById[layoutId]?.elements.find((e) => e.id === r.elementId);
      return el ? { elementId: r.elementId, frame: el.frame } : null;
    })
    .filter((v): v is { elementId: string; frame: LayoutElement['frame'] } => v !== null);
}

/** Magnetic alignment snapping for a move-in-progress: `candidateFrame` is the dragged element's
 * unsnapped frame at (dx, dy); `movingIds` is every element moving together this drag (excluded
 * from the "other layers to align against" set, so a group never snaps to its own members). Writes
 * the guide lines to show into the store (the caller clears them separately on drag end) and
 * returns the (dx, dy) actually adjusted for whatever snap applied, if any. */
export function applyElementSnap(layoutId: string, movingIds: string[], candidateFrame: LayoutElement['frame'], dx: number, dy: number): { dx: number; dy: number } {
  const state = useAppStore.getState();
  const layout = state.layoutsById[layoutId];
  if (!layout) return { dx, dy };
  const others = layout.elements.filter((el) => !movingIds.includes(el.id) && el.visible).map((el) => el.frame);
  const { frame: snapped, guides } = computeSnap(candidateFrame, layout.size.width, layout.size.height, others);
  state.setActiveGuides(guides.map((g) => ({ ...g, layoutId })));
  return { dx: dx + (snapped.x - candidateFrame.x), dy: dy + (snapped.y - candidateFrame.y) };
}

/** Pixel-drag move/resize for a single element's frame. `scale` = rendered px per native layout px. */
export function useElementDrag(layoutId: string, elementId: string, scale: number) {
  const updateElement = useAppStore((s) => s.updateElement);

  /** `options.elementId` redirects the drag onto a different element than the one this hook
   * instance is bound to — used for Option-drag-duplicate, where the duplicate (not the original
   * this mousedown actually landed on) is what ends up following the cursor. `options.onDragEnd`
   * fires once, on mouseup, after the guides are cleared — the duplicate-drag caller uses it to
   * stop suppressing the original's bounding box. */
  function startDrag(e: ReactMouseEvent, startFrame: LayoutElement['frame'], options?: { elementId?: string; onDragEnd?: () => void }) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const targetId = options?.elementId ?? elementId;

    // If this element is part of a larger selection, every other selected element rides along at
    // the same delta, each starting from its own captured frame so the whole set translates
    // together without drifting apart.
    const groupFrames = collectGroupFrames(layoutId, targetId);
    const movingIds = [targetId, ...groupFrames.map((g) => g.elementId)];

    function onMove(ev: globalThis.MouseEvent) {
      let dx = (ev.clientX - startX) / scale;
      let dy = (ev.clientY - startY) / scale;
      const candidateFrame = { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy };
      ({ dx, dy } = applyElementSnap(layoutId, movingIds, candidateFrame, dx, dy));
      updateElement(layoutId, targetId, { frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy } });
      for (const g of groupFrames) {
        updateElement(layoutId, g.elementId, { frame: { ...g.frame, x: g.frame.x + dx, y: g.frame.y + dy } });
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      useAppStore.getState().setActiveGuides([]);
      options?.onDragEnd?.();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(e: ReactMouseEvent, corner: ResizeHandle, startFrame: LayoutElement['frame'], startStyle?: LayoutElement['style']) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const isCorner = corner.length === 2;
    const startStrokeWidth = startStyle?.strokeWidth;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let { x, y, w, h } = startFrame;
      let strokeWidth = startStrokeWidth;

      if (isCorner) {
        // A corner drag scales both axes together (locking the original aspect ratio) instead of
        // resizing them independently — signed so a corner's own "growing" direction (e.g. 'e' on
        // 'se', 'w' on 'sw') always maps to a positive delta regardless of which side it's on.
        const signedDx = corner.includes('w') ? -dx : dx;
        const signedDy = corner.includes('n') ? -dy : dy;
        const scaleW = (startFrame.w + signedDx) / startFrame.w;
        const scaleH = (startFrame.h + signedDy) / startFrame.h;
        // Whichever axis the cursor actually moved further in absolute terms wins — NOT whichever
        // axis changed more as a *percentage* of its own starting size. A `line` shape starts at
        // h≈1, so even a few px of vertical slack would be a massive relative change there and
        // always win under a percentage comparison, making the resize balloon wildly off a drag
        // that barely moved — a tiny absolute dy driving a huge scale2 that then multiplies w too.
        let scale2 = Math.abs(signedDx) > Math.abs(signedDy) ? scaleW : scaleH;
        // Floors scale2 so neither axis shrinks below MIN_SIZE — but only for an axis that started
        // at/above MIN_SIZE already; one that starts below it on purpose (a `line`'s own h≈1) has
        // nothing to "protect" and would otherwise force scale2 up to whatever absurd ratio closes
        // that gap, even on a drag that barely moved. Clamping the scale itself (not w/h separately)
        // keeps the aspect ratio intact once the protected axis does hit its floor.
        if (startFrame.w >= MIN_SIZE) scale2 = Math.max(scale2, MIN_SIZE / startFrame.w);
        if (startFrame.h >= MIN_SIZE) scale2 = Math.max(scale2, MIN_SIZE / startFrame.h);
        w = startFrame.w * scale2;
        h = startFrame.h * scale2;
        // A proportional (corner) scale carries the stroke weight along with it, same as Figma's own
        // "Scale" resize — an edge-only drag (the branch below) stays a pure 1-axis stretch, so the
        // stroke stays exactly as drawn.
        if (startStrokeWidth !== undefined) strokeWidth = Math.max(0, startStrokeWidth * scale2);
      } else {
        if (corner.includes('e')) w = Math.max(MIN_SIZE, startFrame.w + dx);
        if (corner.includes('s')) h = Math.max(MIN_SIZE, startFrame.h + dy);
        if (corner.includes('w')) w = Math.max(MIN_SIZE, startFrame.w - dx);
        if (corner.includes('n')) h = Math.max(MIN_SIZE, startFrame.h - dy);
      }
      if (corner.includes('w')) x = startFrame.x + (startFrame.w - w);
      if (corner.includes('n')) y = startFrame.y + (startFrame.h - h);
      const patch: Partial<LayoutElement> = { frame: { x, y, w, h } };
      if (strokeWidth !== undefined) patch.style = { ...startStyle, strokeWidth };
      updateElement(layoutId, elementId, patch);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /** A 'line'/'arrow' endpoint handle (see `LineEndpointHandles`) isn't a resize at all — dragging
   * it freely repositions that one end anywhere on the canvas while the OTHER end stays exactly
   * where it was, which simultaneously changes the shaft's length *and* its angle (`rotation`) in
   * one continuous gesture, the way a real line/arrow tool works. `startResize`'s own 'w'/'e' handles
   * only ever stretch along the frame's existing local x-axis, with no way to change its angle.
   *
   * Converts both endpoints to world space using the frame's current rotation (rotation pivots
   * around the frame's own center — same convention `transform: rotate()`/`startRotate` already
   * use), keeps the other endpoint's world position fixed as the anchor, and re-derives the frame +
   * rotation a cursor delta away from the dragged endpoint's own starting world position. */
  function startEndpointDrag(e: ReactMouseEvent, side: 'tail' | 'tip', startFrame: LayoutElement['frame'], startRotation: number) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    const rad = (startRotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const center = { x: startFrame.x + startFrame.w / 2, y: startFrame.y + startFrame.h / 2 };
    // Half the shaft's own local length, rotated into world space — the vector from center out to
    // the tip; the tail is the same vector negated.
    const halfVec = { x: (startFrame.w / 2) * cos, y: (startFrame.w / 2) * sin };
    const tipStart = { x: center.x + halfVec.x, y: center.y + halfVec.y };
    const tailStart = { x: center.x - halfVec.x, y: center.y - halfVec.y };
    const anchor = side === 'tip' ? tailStart : tipStart; // the end NOT being dragged — stays fixed
    const draggedStart = side === 'tip' ? tipStart : tailStart;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const dragged = { x: draggedStart.x + dx, y: draggedStart.y + dy };
      const newCenter = { x: (anchor.x + dragged.x) / 2, y: (anchor.y + dragged.y) / 2 };
      // Tail→tip direction either way, so `rotation` always means the same thing regardless of
      // which end is the one actually being dragged right now.
      const tailToTip = side === 'tip' ? { x: dragged.x - anchor.x, y: dragged.y - anchor.y } : { x: anchor.x - dragged.x, y: anchor.y - dragged.y };
      const newW = Math.max(1, Math.hypot(tailToTip.x, tailToTip.y));
      const newRotation = (Math.atan2(tailToTip.y, tailToTip.x) * 180) / Math.PI;
      updateElement(layoutId, elementId, {
        frame: { x: newCenter.x - newW / 2, y: newCenter.y - startFrame.h / 2, w: newW, h: startFrame.h },
        rotation: newRotation,
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /** Drag-to-rotate from just outside a corner handle — pivots around `boxEl`'s own current
   * on-screen center (valid regardless of any rotation already applied, since rotating around the
   * center never moves the center itself). Hold Shift to snap to 15° increments. */
  function startRotate(e: ReactMouseEvent, boxEl: HTMLElement, startRotation: number) {
    e.stopPropagation();
    e.preventDefault();
    const rect = boxEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI;

    function onMove(ev: globalThis.MouseEvent) {
      const angle = (Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180) / Math.PI;
      let rotation = startRotation + (angle - startAngle);
      if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
      updateElement(layoutId, elementId, { rotation });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Entry point for a plain mousedown on a selectable element (text/shape today — the image layer
  // hand-rolls its own equivalent, since it also drives a group move for every other selected
  // element in the layout). Shift-clicks
  // and clicks on anything not already part of a multi-selection behave exactly as before: select
  // immediately, then drag. But a plain click landing on one of *several* already-selected
  // elements defers the actual selection change — dragging past the threshold moves the whole
  // group as-is (selection untouched); releasing without ever exceeding it commits the plain click
  // (collapsing the selection down to just this element), same "still click vs. real drag" split
  // MultiPageCanvas already uses for scenes.
  function startDragOrDeferredSelect(e: ReactMouseEvent, startFrame: LayoutElement['frame'], onSelect: (e: ReactMouseEvent) => void) {
    const state = useAppStore.getState();
    const selectionInLayout = state.selectedElements.filter((r) => r.layoutId === layoutId);
    const isMultiSelected = selectionInLayout.length > 1 && selectionInLayout.some((r) => r.elementId === elementId);

    if (e.shiftKey || !isMultiSelected) {
      onSelect(e);
      startDrag(e, startFrame);
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const groupFrames = collectGroupFrames(layoutId, elementId);
    const movingIds = [elementId, ...groupFrames.map((g) => g.elementId)];

    function onMove(ev: globalThis.MouseEvent) {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dxScreen, dyScreen) < ELEMENT_PAN_THRESHOLD) return;
        dragging = true;
      }
      let dx = dxScreen / scale;
      let dy = dyScreen / scale;
      const candidateFrame = { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy };
      ({ dx, dy } = applyElementSnap(layoutId, movingIds, candidateFrame, dx, dy));
      updateElement(layoutId, elementId, { frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy } });
      for (const g of groupFrames) {
        updateElement(layoutId, g.elementId, { frame: { ...g.frame, x: g.frame.x + dx, y: g.frame.y + dy } });
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      useAppStore.getState().setActiveGuides([]);
      if (!dragging) onSelect(e);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { startDrag, startResize, startRotate, startEndpointDrag, startDragOrDeferredSelect };
}
