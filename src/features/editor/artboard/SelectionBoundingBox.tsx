import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { RESIZE_HANDLES, type ResizeHandle } from './useElementDrag';

const CORNER_SIZE = 8;
const EDGE_THICKNESS = 6;
const EDGE_LENGTH = 14;
// Bigger than the corner handle and centered on the same point — the handle (rendered after, so it
// stacks on top) covers the middle, leaving an outer ring exposed for rotation. That ring is what
// actually receives the rotate cursor/drag; the handle itself still wins for anything inside it.
const ROTATE_ZONE_SIZE = 20;
const ROTATE_CURSOR = "url('/icons/Rotation-cursor.svg') 12 12, auto";

/** White square/capsule handle with a blue border — corners resize both axes, edges resize one. */
function handleStyle(handle: ResizeHandle): CSSProperties {
  const isCorner = handle.length === 2;
  const style: CSSProperties = {
    position: 'absolute',
    background: '#ffffff',
    border: '1.5px solid var(--color-button-primary)',
    boxSizing: 'border-box',
    // Explicit, since the overflow-safe rendering path (ImageBox) wraps this in a `pointer-events:
    // none` container so clicking the rest of that wrapper's area falls through to whatever's
    // underneath (e.g. the image itself, to drag it) — the handles need to opt back in individually.
    pointerEvents: 'auto',
  };

  if (isCorner) {
    style.width = CORNER_SIZE;
    style.height = CORNER_SIZE;
    style.borderRadius = 2;
  } else if (handle === 'n' || handle === 's') {
    style.width = EDGE_LENGTH;
    style.height = EDGE_THICKNESS;
    style.borderRadius = 3;
    style.left = '50%';
    style.transform = 'translateX(-50%)';
  } else {
    style.width = EDGE_THICKNESS;
    style.height = EDGE_LENGTH;
    style.borderRadius = 3;
    style.top = '50%';
    style.transform = 'translateY(-50%)';
  }

  const half = isCorner ? CORNER_SIZE / 2 : EDGE_THICKNESS / 2;
  if (handle.includes('n')) style.top = -half;
  if (handle.includes('s')) style.bottom = -half;
  if (handle.includes('w')) style.left = -half;
  if (handle.includes('e')) style.right = -half;

  style.cursor = handle === 'nw' || handle === 'se' ? 'nwse-resize' : handle === 'ne' || handle === 'sw' ? 'nesw-resize' : handle === 'n' || handle === 's' ? 'ns-resize' : 'ew-resize';

  return style;
}

/** Square centered on the same point a corner's own resize handle sits on, just bigger — the ring
 * left exposed around that (smaller, later-painted) handle is where a hover turns into the rotate
 * cursor and a drag rotates the layer instead of resizing it. */
function rotateZoneStyle(handle: ResizeHandle): CSSProperties {
  const half = ROTATE_ZONE_SIZE / 2;
  const style: CSSProperties = { position: 'absolute', width: ROTATE_ZONE_SIZE, height: ROTATE_ZONE_SIZE, cursor: ROTATE_CURSOR, pointerEvents: 'auto' };
  if (handle.includes('n')) style.top = -half;
  if (handle.includes('s')) style.bottom = -half;
  if (handle.includes('w')) style.left = -half;
  if (handle.includes('e')) style.right = -half;
  return style;
}

function lineEndpointHandleStyle(side: 'tail' | 'tip'): CSSProperties {
  const half = CORNER_SIZE / 2;
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    background: '#ffffff',
    border: '1.5px solid var(--color-button-primary)',
    borderRadius: 2,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    // Free-direction, not a 1-axis resize — any cursor would misleadingly imply a constrained drag.
    cursor: 'move',
    ...(side === 'tail' ? { left: -half } : { right: -half }),
  };
}

/** Replaces `SelectionBoundingBox` for a 'line'/'arrow' shape: just its own two end-point handles
 * (the stroke's real tail and tip) joined by a single straight line — no surrounding box, since
 * neither shape has a real second dimension of its own to show a boundary around (their "height" is
 * just the stroke's own thickness). Each handle can be dragged freely in any direction — not a 1-axis
 * resize — repositioning that one end while the other stays put, which changes the shaft's length
 * *and* angle together (see `startEndpointDrag`). */
export function LineEndpointHandles({ onEndpointDragStart }: { onEndpointDragStart: (side: 'tail' | 'tip', e: ReactMouseEvent) => void }) {
  return (
    <>
      <div className="pointer-events-none absolute top-1/2 right-0 left-0 h-[1.5px] -translate-y-1/2 bg-button-primary" />
      <div style={lineEndpointHandleStyle('tail')} onMouseDown={(e) => onEndpointDragStart('tail', e)} />
      <div style={lineEndpointHandleStyle('tip')} onMouseDown={(e) => onEndpointDragStart('tip', e)} />
    </>
  );
}

/** Blue outline + 8 resize handles, shared by every selectable element kind (image/text/shape).
 * Corners also get a slightly larger rotate zone sitting behind (in paint order) their own resize
 * handle — see rotateZoneStyle. `onRotateStart` is optional so callers that don't support rotation
 * yet just skip rendering those zones instead of wiring a no-op. `hiddenHandles` drops specific
 * handles entirely (not just visually — no hit area either) for a shape where dragging that edge
 * alone has nothing sensible to do, e.g. 'line'/'arrow's own 'n'/'s': their "height" is just the
 * shaft's stroke thickness, which only ever changes as a side effect of a proportional corner
 * scale (see `startResize`), never as an independent dimension of its own to grab and drag. */
export function SelectionBoundingBox({
  onResizeStart,
  onRotateStart,
  hiddenHandles,
}: {
  onResizeStart: (handle: ResizeHandle, e: ReactMouseEvent) => void;
  onRotateStart?: (handle: ResizeHandle, e: ReactMouseEvent) => void;
  hiddenHandles?: ResizeHandle[];
}) {
  const handles = hiddenHandles ? RESIZE_HANDLES.filter((h) => !hiddenHandles.includes(h)) : RESIZE_HANDLES;
  return (
    <>
      <div className="pointer-events-none absolute inset-0 outline outline-[1.5px] outline-button-primary" />
      {onRotateStart &&
        handles
          .filter((h) => h.length === 2)
          .map((handle) => <div key={`rotate-${handle}`} style={rotateZoneStyle(handle)} onMouseDown={(e) => onRotateStart(handle, e)} />)}
      {handles.map((handle) => (
        <div key={handle} style={handleStyle(handle)} onMouseDown={(e) => onResizeStart(handle, e)} />
      ))}
    </>
  );
}
