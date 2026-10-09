import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { useElementDrag, applyElementSnap, DUPLICATE_CURSOR, ELEMENT_PAN_THRESHOLD } from './useElementDrag';
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
  altKeyDown,
  expanding,
  onExpandToFrameClick,
  isBackgroundImage,
  sceneHasBackgroundColor,
  onSelect,
  onContextMenu,
  onEnterGroup,
  onStartAltDuplicate,
}: {
  element: LayoutElement;
  layoutId: string;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  activeTool: Tool;
  selected: boolean;
  /** Option/Alt is currently held — swaps the hover cursor to the duplicate hint. */
  altKeyDown: boolean;
  expanding?: boolean;
  onExpandToFrameClick?: (e: ReactMouseEvent) => void;
  isBackgroundImage?: boolean;
  sceneHasBackgroundColor?: boolean;
  onSelect: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Set only when this element belongs to a group that isn't currently "entered" — double-click enters it. */
  onEnterGroup?: (e: ReactMouseEvent) => void;
  /** Option-drag-duplicate: clones this element, selects the clone, and returns its id plus a
   * callback to fire once the drag ends — see ArtboardFrame's own `startAltDuplicate`. */
  onStartAltDuplicate: (element: LayoutElement) => { newId: string; onDragEnd: () => void };
}) {
  const updateElement = useAppStore((s) => s.updateElement);
  const { startResize, startRotate } = useElementDrag(layoutId, element.id, scale);
  const { frame } = element;

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

  // Every OTHER currently-selected element in this layout rides along at the same delta too, so a
  // multi-selection moves as one unit.
  function startMove(e: ReactMouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = frame;
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
      updateElement(layoutId, element.id, { frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy } });
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

  // Option-drag-duplicate: a plain move, like startMove above, but targeting the freshly-cloned
  // element's own id (already selected and positioned at this element's frame by the caller) — the
  // original this mousedown actually landed on stays put, so it never joins movingIds here.
  function startAltDuplicateMove(e: ReactMouseEvent, newElementId: string, onDragEnd: () => void) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = frame;
    beginPositioning();
    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const candidateFrame = { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy };
      const snapped = applyElementSnap(layoutId, [newElementId], candidateFrame, dx, dy);
      updateElement(layoutId, newElementId, { frame: { ...startFrame, x: startFrame.x + snapped.dx, y: startFrame.y + snapped.dy } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      useAppStore.getState().setActiveGuides([]);
      endPositioning();
      onDragEnd();
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

  return (
    <ImageBox
      element={element}
      layoutWidth={layoutWidth}
      layoutHeight={layoutHeight}
      // Only hints "this drag will duplicate" over the layer that's actually selected — hovering
      // some other, unselected layer with Option held still shows a plain move cursor.
      cursor={activeTool === 'select' ? (altKeyDown && selected ? DUPLICATE_CURSOR : 'move') : undefined}
      scale={scale}
      expanding={expanding}
      selected={selected}
      onExpandToFrameClick={onExpandToFrameClick}
      isBackgroundImage={isBackgroundImage}
      sceneHasBackgroundColor={sceneHasBackgroundColor}
      suppressFrameGapAffordance={isPositioning}
      onContextMenu={onContextMenu}
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
        if (e.button !== 0) return;
        if (e.altKey) {
          const { newId, onDragEnd } = onStartAltDuplicate(element);
          startAltDuplicateMove(e, newId, onDragEnd);
          return;
        }
        startMoveOrDeferredSelect(e);
      }}
    >
      {selected && (
        <SelectionBoundingBox
          onResizeStart={(handle, e) => {
            beginPositioning();
            startResize(e, handle, frame);
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
