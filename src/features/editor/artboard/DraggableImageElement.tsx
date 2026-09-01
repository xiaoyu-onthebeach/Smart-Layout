import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { useElementDrag, MIN_SIZE, type ResizeHandle } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';
import { ImageBox } from './ImageBox';

/** The banner's image element — draggable to move, with 8 handles to resize when selected. */
export function DraggableImageElement({
  element,
  layoutId,
  layoutWidth,
  layoutHeight,
  scale,
  activeTool,
  selected,
  sceneSelected,
  expanding,
  onExpandClick,
  onSelect,
  onContextMenu,
}: {
  element: LayoutElement;
  layoutId: string;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  activeTool: Tool;
  selected: boolean;
  /** Whether the enclosing scene is already selected — gates the first-click-selects-scene behavior below. */
  sceneSelected?: boolean;
  expanding?: boolean;
  onExpandClick?: (e: ReactMouseEvent) => void;
  onSelect: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
}) {
  const updateElement = useAppStore((s) => s.updateElement);
  const { startResize } = useElementDrag(layoutId, element.id, scale);
  const { frame, pendingExpand } = element;
  // The "finish the drag first" affordances (expand button + prompt entry) only make sense once
  // the box has actually settled — showing them mid-drag is just noise following the cursor.
  const [isDraggingExpand, setIsDraggingExpand] = useState(false);
  // Which handle grew the box last — so the expand button/prompt can sit near whichever corner is
  // actually "new" (e.g. dragging the nw handle out should put them top-left, not the fixed
  // bottom-right every direction used to get). Corner handles map directly; a pure edge handle
  // (just 'n'/'e'/'s'/'w') only pins one axis, leaving the other at its default.
  const [expandHandle, setExpandHandle] = useState<ResizeHandle | null>(null);

  // A plain move shifts the pending-expand box along with the image, so the gap doesn't get left
  // behind at its old spot.
  function startMove(e: ReactMouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = frame;
    const startPending = pendingExpand;
    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      updateElement(layoutId, element.id, {
        frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy },
        ...(startPending ? { pendingExpand: { ...startPending, x: startPending.x + dx, y: startPending.y + dy } } : {}),
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
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
      expanding={expanding}
      isDraggingExpand={isDraggingExpand}
      expandHandle={expandHandle}
      onExpandClick={onExpandClick}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => {
        // Let a placement tool (text/shape) click straight through to the frame beneath.
        if (activeTool !== 'select') return;
        // A full-bleed image is visually indistinguishable from "the scene" — its first click
        // (scene not selected yet) just selects the scene, same as clicking empty frame space
        // would, by letting the mousedown bubble up to the frame's own handler. A second click
        // (scene already selected, image still isn't) drills into the image layer itself.
        const fillsFrame = frame.x <= 0 && frame.y <= 0 && frame.x + frame.w >= layoutWidth && frame.y + frame.h >= layoutHeight;
        if (fillsFrame && !selected && !sceneSelected && !e.shiftKey) return;
        onSelect(e);
        // Right-click still selects the layer (so the context menu that follows acts on it) but
        // shouldn't start a drag — there's no real pointer movement to track for a context-menu click.
        if (e.button === 0) startMove(e);
      }}
    >
      {selected && (
        <SelectionBoundingBox
          onResizeStart={(handle, e) => {
            if (e.metaKey) {
              startExpandResize(e, handle);
              return;
            }
            startResize(e, handle, frame);
            if (pendingExpand) updateElement(layoutId, element.id, { pendingExpand: undefined });
          }}
        />
      )}
    </ImageBox>
  );
}
