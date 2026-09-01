import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { RESIZE_HANDLES, type ResizeHandle } from './useElementDrag';

const CORNER_SIZE = 8;
const EDGE_THICKNESS = 6;
const EDGE_LENGTH = 14;

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

/** Blue outline + 8 resize handles, shared by every selectable element kind (image/text/shape). */
export function SelectionBoundingBox({ onResizeStart }: { onResizeStart: (handle: ResizeHandle, e: ReactMouseEvent) => void }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 outline outline-[1.5px] outline-button-primary" />
      {RESIZE_HANDLES.map((handle) => (
        <div key={handle} style={handleStyle(handle)} onMouseDown={(e) => onResizeStart(handle, e)} />
      ))}
    </>
  );
}
