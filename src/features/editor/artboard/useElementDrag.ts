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

  function startDrag(e: ReactMouseEvent, startFrame: LayoutElement['frame']) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    // If this element is part of a larger selection, every other selected element rides along at
    // the same delta, each starting from its own captured frame so the whole set translates
    // together without drifting apart.
    const groupFrames = collectGroupFrames(layoutId, elementId);
    const movingIds = [elementId, ...groupFrames.map((g) => g.elementId)];

    function onMove(ev: globalThis.MouseEvent) {
      let dx = (ev.clientX - startX) / scale;
      let dy = (ev.clientY - startY) / scale;
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
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(e: ReactMouseEvent, corner: ResizeHandle, startFrame: LayoutElement['frame']) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const isCorner = corner.length === 2;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let { x, y, w, h } = startFrame;

      if (isCorner) {
        // A corner drag scales both axes together (locking the original aspect ratio) instead of
        // resizing them independently — signed so a corner's own "growing" direction (e.g. 'e' on
        // 'se', 'w' on 'sw') always maps to a positive delta regardless of which side it's on.
        const signedDx = corner.includes('w') ? -dx : dx;
        const signedDy = corner.includes('n') ? -dy : dy;
        const scaleW = (startFrame.w + signedDx) / startFrame.w;
        const scaleH = (startFrame.h + signedDy) / startFrame.h;
        // Whichever axis the user is actually dragging further (relatively) wins, so the resize
        // tracks the mouse naturally regardless of which direction they lead with.
        let scale2 = Math.abs(scaleW - 1) > Math.abs(scaleH - 1) ? scaleW : scaleH;
        // Clamping the scale itself (not each dimension separately) keeps the aspect ratio intact
        // even once one axis hits the floor — clamping w/h independently would let a thin/wide
        // shape's short axis hit MIN_SIZE while the long axis kept shrinking, warping the ratio.
        scale2 = Math.max(scale2, MIN_SIZE / startFrame.w, MIN_SIZE / startFrame.h);
        w = startFrame.w * scale2;
        h = startFrame.h * scale2;
      } else {
        if (corner.includes('e')) w = Math.max(MIN_SIZE, startFrame.w + dx);
        if (corner.includes('s')) h = Math.max(MIN_SIZE, startFrame.h + dy);
        if (corner.includes('w')) w = Math.max(MIN_SIZE, startFrame.w - dx);
        if (corner.includes('n')) h = Math.max(MIN_SIZE, startFrame.h - dy);
      }
      if (corner.includes('w')) x = startFrame.x + (startFrame.w - w);
      if (corner.includes('n')) y = startFrame.y + (startFrame.h - h);
      updateElement(layoutId, elementId, { frame: { x, y, w, h } });
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
  // hand-rolls its own equivalent since it also has to carry `pendingExpand` along). Shift-clicks
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

  return { startDrag, startResize, startRotate, startDragOrDeferredSelect };
}
