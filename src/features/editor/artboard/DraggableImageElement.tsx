import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { useElementDrag, applyElementSnap, MIN_SIZE, ELEMENT_PAN_THRESHOLD, type ResizeHandle } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';
import { ImageBox } from './ImageBox';

// How long the frame-gap grid/expand-button stay hidden after a move or resize finishes, before
// settling into view — long enough that letting go mid-adjustment (to check the result, or pause
// mid-thought) doesn't immediately pop the affordance in.
const FRAME_GAP_REVEAL_DELAY_MS = 300;

/** The banner's image element — draggable to move, with 8 handles to resize when selected. */
export function DraggableImageElement({
  element,
  layoutId,
  layoutWidth,
  layoutHeight,
  scale,
  activeTool,
  selected,
  expanding,
  onExpandClick,
  onExpandToFrameClick,
  isBackgroundImage,
  onSelect,
  onContextMenu,
  onEnterGroup,
}: {
  element: LayoutElement;
  layoutId: string;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  activeTool: Tool;
  selected: boolean;
  expanding?: boolean;
  onExpandClick?: (e: ReactMouseEvent) => void;
  onExpandToFrameClick?: (e: ReactMouseEvent) => void;
  isBackgroundImage?: boolean;
  onSelect: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Set only when this element belongs to a group that isn't currently "entered" — double-click enters it. */
  onEnterGroup?: (e: ReactMouseEvent) => void;
}) {
  const updateElement = useAppStore((s) => s.updateElement);
  const { startResize, startRotate } = useElementDrag(layoutId, element.id, scale);
  const { frame, pendingExpand } = element;
  // Drives SelectionBoundingBox's own idle-vs-expanded look — lifted up here since that overlay is
  // `pointer-events: none` over its own interior (so a click there still falls through to start a
  // move-drag) and so can't detect hover on itself.
  const [hovered, setHovered] = useState(false);
  // The "finish the drag first" affordances (expand button + prompt entry) only make sense once
  // the box has actually settled — showing them mid-drag is just noise following the cursor.
  const [isDraggingExpand, setIsDraggingExpand] = useState(false);
  // Which handle grew the box last — so the expand button/prompt can sit near whichever corner is
  // actually "new" (e.g. dragging the nw handle out should put them top-left, not the fixed
  // bottom-right every direction used to get). Corner handles map directly; a pure edge handle
  // (just 'n'/'e'/'s'/'w') only pins one axis, leaving the other at its default.
  const [expandHandle, setExpandHandle] = useState<ResizeHandle | null>(null);

  // Suppresses the frame-gap grid/expand-button for the duration of a move or resize drag, plus a
  // short settle delay after release — otherwise they'd flicker in and out mid-drag every time the
  // image happens to cross the frame's edge.
  const [isPositioning, setIsPositioning] = useState(false);
  const revealTimeoutRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (revealTimeoutRef.current !== null) window.clearTimeout(revealTimeoutRef.current);
  }, []);
  function beginPositioning() {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    setIsPositioning(true);
  }
  function endPositioning() {
    revealTimeoutRef.current = window.setTimeout(() => {
      setIsPositioning(false);
      revealTimeoutRef.current = null;
    }, FRAME_GAP_REVEAL_DELAY_MS);
  }

  // A plain move shifts the pending-expand box along with the image, so the gap doesn't get left
  // behind at its old spot. Every OTHER currently-selected element in this layout rides along at
  // the same delta too, so a multi-selection moves as one unit (pendingExpand only ever follows
  // the literally-dragged image, not other selected group members).
  function startMove(e: ReactMouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = frame;
    const startPending = pendingExpand;
    const state = useAppStore.getState();
    const groupFrames = state.selectedElements
      .filter((r) => r.layoutId === layoutId && r.elementId !== element.id)
      .map((r) => {
        const el = state.layoutsById[layoutId]?.elements.find((e2) => e2.id === r.elementId);
        return el ? { elementId: r.elementId, frame: el.frame } : null;
      })
      .filter((v): v is { elementId: string; frame: LayoutElement['frame'] } => v !== null);
    const movingIds = [element.id, ...groupFrames.map((g) => g.elementId)];
    beginPositioning();
    function onMove(ev: globalThis.MouseEvent) {
      let dx = (ev.clientX - startX) / scale;
      let dy = (ev.clientY - startY) / scale;
      const candidateFrame = { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy };
      ({ dx, dy } = applyElementSnap(layoutId, movingIds, candidateFrame, dx, dy));
      updateElement(layoutId, element.id, {
        frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy },
        ...(startPending ? { pendingExpand: { ...startPending, x: startPending.x + dx, y: startPending.y + dy } } : {}),
      });
      for (const g of groupFrames) {
        updateElement(layoutId, g.elementId, { frame: { ...g.frame, x: g.frame.x + dx, y: g.frame.y + dy } });
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      useAppStore.getState().setActiveGuides([]);
      endPositioning();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Mirrors useElementDrag's startDragOrDeferredSelect for the hand-rolled image move above — a
  // plain click on one of several already-selected images defers collapsing the selection until
  // it's clear whether this turns into an actual drag (of the whole group) or stays just a click.
  function startMoveOrDeferredSelect(e: ReactMouseEvent) {
    const state = useAppStore.getState();
    const selectionInLayout = state.selectedElements.filter((r) => r.layoutId === layoutId);
    const isMultiSelected = selectionInLayout.length > 1 && selectionInLayout.some((r) => r.elementId === element.id);

    if (e.shiftKey || !isMultiSelected) {
      onSelect(e);
      startMove(e);
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = frame;
    let dragging = false;
    const groupFrames = state.selectedElements
      .filter((r) => r.layoutId === layoutId && r.elementId !== element.id)
      .map((r) => {
        const el = state.layoutsById[layoutId]?.elements.find((e2) => e2.id === r.elementId);
        return el ? { elementId: r.elementId, frame: el.frame } : null;
      })
      .filter((v): v is { elementId: string; frame: LayoutElement['frame'] } => v !== null);
    const movingIds = [element.id, ...groupFrames.map((g) => g.elementId)];

    function onMove(ev: globalThis.MouseEvent) {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dxScreen, dyScreen) < ELEMENT_PAN_THRESHOLD) return;
        dragging = true;
        beginPositioning();
      }
      let dx = dxScreen / scale;
      let dy = dyScreen / scale;
      const candidateFrame = { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy };
      ({ dx, dy } = applyElementSnap(layoutId, movingIds, candidateFrame, dx, dy));
      updateElement(layoutId, element.id, { frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy } });
      for (const g of groupFrames) {
        updateElement(layoutId, g.elementId, { frame: { ...g.frame, x: g.frame.x + dx, y: g.frame.y + dy } });
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      useAppStore.getState().setActiveGuides([]);
      if (dragging) endPositioning();
      else onSelect(e);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Cmd+drag grows a box beyond the image's own frame instead of resizing the image itself — the
  // image stays exactly where it was; the new area is an unfilled, transparent gap. Free to grow
  // past the artboard's own bounds in every direction — ImageBox's expand button/prompt entry
  // clamp their own on-screen position to the frame separately, so this drag itself doesn't need
  // to stop at the frame edge just to keep them reachable.
  function startExpandResize(e: ReactMouseEvent, handle: ResizeHandle) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = pendingExpand ?? frame;
    const minW = Math.max(MIN_SIZE, frame.w);
    const minH = Math.max(MIN_SIZE, frame.h);
    setIsDraggingExpand(true);
    setExpandHandle(handle);
    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let { x, y, w, h } = startBox;
      if (handle.includes('e')) w = Math.max(minW, startBox.w + dx);
      if (handle.includes('s')) h = Math.max(minH, startBox.h + dy);
      if (handle.includes('w')) {
        w = Math.max(minW, startBox.w - dx);
        x = startBox.x + startBox.w - w;
      }
      if (handle.includes('n')) {
        h = Math.max(minH, startBox.h - dy);
        y = startBox.y + startBox.h - h;
      }
      updateElement(layoutId, element.id, { pendingExpand: { x, y, w, h } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setIsDraggingExpand(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <ImageBox
      element={element}
      layoutWidth={layoutWidth}
      layoutHeight={layoutHeight}
      cursor={activeTool === 'select' ? 'move' : undefined}
      scale={scale}
      expanding={expanding}
      isDraggingExpand={isDraggingExpand}
      expandHandle={expandHandle}
      onExpandClick={onExpandClick}
      onExpandToFrameClick={onExpandToFrameClick}
      isBackgroundImage={isBackgroundImage}
      suppressFrameGapAffordance={isPositioning}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={
        onEnterGroup &&
        ((e) => {
          if (activeTool !== 'select') return;
          e.stopPropagation();
          onEnterGroup(e);
        })
      }
      onMouseDown={(e) => {
        // Let a placement tool (text/shape) click straight through to the frame beneath.
        if (activeTool !== 'select') return;
        // This element only renders (as this interactive component, rather than the inert
        // ElementRenderer) once the scene is already active — so this mousedown is always the
        // "scene already selected, now drill into this specific layer" click; a first click on a
        // not-yet-active scene never reaches here at all, it's caught by the frame's own handler.
        // Only a left-click selects the layer (and starts a move drag) — a right-click leaves
        // selection alone, so its own context menu only opens the layer menu when this layer was
        // already selected beforehand; otherwise the right-click falls through to the scene menu.
        if (e.button === 0) startMoveOrDeferredSelect(e);
      }}
    >
      {selected && (
        <SelectionBoundingBox
          hovered={hovered}
          onResizeStart={(handle, e) => {
            if (e.metaKey) {
              startExpandResize(e, handle);
              return;
            }
            beginPositioning();
            startResize(e, handle, frame);
            if (pendingExpand) updateElement(layoutId, element.id, { pendingExpand: undefined });
            function onUp() {
              window.removeEventListener('mouseup', onUp);
              endPositioning();
            }
            window.addEventListener('mouseup', onUp);
          }}
          onRotateStart={(_handle, e) => {
            const boxEl = (e.target as HTMLElement).closest('[data-resize-box]') as HTMLElement | null;
            if (boxEl) startRotate(e, boxEl, element.rotation ?? 0);
          }}
        />
      )}
    </ImageBox>
  );
}
