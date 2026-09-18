import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
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

const STROKE_THICKNESS = 6;
// `min(28px, 35%)` rather than a flat px value — a flat 28px arm would already exceed half the
// width/height of a small element, making the "expanded" 50% state *smaller* than the resting one.
const STROKE_ARM_LENGTH = 'min(28px, 35%)';
const STROKE_TRANSITION = 'width 200ms ease, height 200ms ease';
// Same soft white glow in both states — since it's on each stroke segment individually rather than
// the selection as a whole, it automatically traces whatever shape is currently visible (corners
// only, or the full border) with no separate logic needed for the two.
const STROKE_GLOW = '0 0 8px rgba(255,255,255,0.25)';
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;

/**
 * One of the 8 stroke segments making up the selection outline — 2 per corner (one running along
 * the top/bottom edge, one along the left/right edge), each anchored at its own corner. At rest
 * each is a short arm (`STROKE_ARM_LENGTH`); expanded, it grows to exactly half the container's own
 * width/height, meeting the matching arm growing in from the neighboring corner right at the
 * midpoint — the two together read as one continuous border, animated via a plain CSS transition on
 * `width`/`height` rather than anything JS-driven.
 */
function StrokeSegment({ axis, corner, expanded }: { axis: 'h' | 'v'; corner: (typeof CORNERS)[number]; expanded: boolean }) {
  const style: CSSProperties = {
    position: 'absolute',
    background: '#ffffff',
    boxShadow: STROKE_GLOW,
    transition: STROKE_TRANSITION,
    borderRadius: STROKE_THICKNESS / 2,
    top: corner.includes('n') ? -STROKE_THICKNESS / 2 : undefined,
    bottom: corner.includes('s') ? -STROKE_THICKNESS / 2 : undefined,
    left: corner.includes('w') ? -STROKE_THICKNESS / 2 : undefined,
    right: corner.includes('e') ? -STROKE_THICKNESS / 2 : undefined,
    width: axis === 'h' ? (expanded ? '50%' : STROKE_ARM_LENGTH) : STROKE_THICKNESS,
    height: axis === 'v' ? (expanded ? '50%' : STROKE_ARM_LENGTH) : STROKE_THICKNESS,
  };
  return <div style={style} />;
}

/**
 * 4-corner-bracket outline + 8 resize handles, shared by every selectable element kind (image/text/
 * shape). Idle, only the 4 corners show (a short stroke arm on each side of the corner); hovering
 * the element — or actively dragging one of its handles — grows all 8 arms out to the midpoint of
 * their own edge, closing into a full border. Releasing a drag always snaps back to the corners-
 * only state even if the cursor is still sitting on the element, matching a deliberate "just
 * finished, not just idly hovering" cue rather than the ordinary hover behavior resuming instantly.
 *
 * Corners also get a slightly larger rotate zone sitting behind (in paint order) their own resize
 * handle — see rotateZoneStyle. `onRotateStart` is optional so callers that don't support rotation
 * yet just skip rendering those zones instead of wiring a no-op.
 */
export function SelectionBoundingBox({
  onResizeStart,
  onRotateStart,
  hovered = false,
}: {
  onResizeStart: (handle: ResizeHandle, e: ReactMouseEvent) => void;
  onRotateStart?: (handle: ResizeHandle, e: ReactMouseEvent) => void;
  /** Whether the pointer is over the selected element's own real content (image/text/shape) —
   * lifted from the parent, since this component's own overlay is `pointer-events: none` over its
   * interior (so clicks there still fall through to start a move-drag) and can't detect hover on
   * itself without also stealing those clicks. */
  hovered?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  // Forces the collapsed (corners-only) look for as long as the cursor hasn't actually left the
  // element since the last drag ended — without this, `expanded` would fall straight back to
  // `hovered` (still true, since the mouse never left) and the release would have no visible effect.
  const [suppressHover, setSuppressHover] = useState(false);
  useEffect(() => {
    if (!hovered) setSuppressHover(false);
  }, [hovered]);
  const expanded = dragging || (hovered && !suppressHover);

  function trackDrag(fn: (handle: ResizeHandle, e: ReactMouseEvent) => void) {
    return (handle: ResizeHandle, e: ReactMouseEvent) => {
      setDragging(true);
      fn(handle, e);
      function onUp() {
        window.removeEventListener('mouseup', onUp);
        setDragging(false);
        setSuppressHover(true);
      }
      window.addEventListener('mouseup', onUp);
    };
  }

  const handleResize = trackDrag(onResizeStart);
  const handleRotate = onRotateStart && trackDrag(onRotateStart);

  return (
    <>
      <div className="pointer-events-none absolute inset-0">
        {CORNERS.map((corner) => (
          <div key={corner}>
            <StrokeSegment axis="h" corner={corner} expanded={expanded} />
            <StrokeSegment axis="v" corner={corner} expanded={expanded} />
          </div>
        ))}
      </div>
      {handleRotate &&
        RESIZE_HANDLES.filter((h) => h.length === 2).map((handle) => (
          <div key={`rotate-${handle}`} style={rotateZoneStyle(handle)} onMouseDown={(e) => handleRotate(handle, e)} />
        ))}
      {RESIZE_HANDLES.map((handle) => (
        <div key={handle} style={handleStyle(handle)} onMouseDown={(e) => handleResize(handle, e)} />
      ))}
    </>
  );
}
