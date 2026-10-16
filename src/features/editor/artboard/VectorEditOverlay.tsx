import { useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement, VectorPath } from '@/types';
import {
  ACCENT_COLOR,
  HIGHLIGHT_STROKE,
  insertMidpointJoint,
  JOINT_HOVER_ICON,
  JOINT_ICON,
  JOINT_SELECTED_ICON,
  MIDPOINT_ICON,
  midpoint as segmentMidpoint,
  NEUTRAL_OUTLINE_COLOR,
  OUTLINE_STROKE,
  PEN_ADD_CURSOR,
  rebaseVectorFrame,
  segments,
} from '@/lib/vector-path';

// Screen px of slop around the shape's own frame where a marquee-select drag can still start — see
// the outer wrapper div's own comment in the render below for why a plain inset-0 box isn't enough.
const MARQUEE_MARGIN = 24;

/** A fixed-size icon, its own true circle re-centered (via `-center.x`/`-center.y`, not 50%/50%) on
 * a local path-space point (`left`/`top`, both already percentages of the frame) — the icon renders
 * at its own natural intrinsic size, which stays constant on screen at any zoom for the same reason
 * `SelectionBoundingBox`'s plain-pixel resize handles do (this whole app scales a scene by resizing
 * its actual CSS box, never via a `transform: scale`, so an un-scaled pixel value here already is a
 * screen pixel value). */
function JointIcon({
  icon,
  x,
  y,
  cursor,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
}: {
  icon: { src: string; w: number; h: number; center: { x: number; y: number } };
  x: number;
  y: number;
  cursor?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseDown?: (e: ReactMouseEvent) => void;
}) {
  return (
    <img
      src={icon.src}
      alt=""
      draggable={false}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: icon.w,
        height: icon.h,
        transform: `translate(${-icon.center.x}px, ${-icon.center.y}px)`,
        cursor: cursor ?? (onMouseDown ? 'default' : undefined),
        pointerEvents: 'auto',
        // Belt-and-suspenders alongside `draggable={false}` — without this, Chrome/Safari's own
        // native "drag this image out" affordance can still flash a system drag cursor/ghost for the
        // first few px of a real mouse drag, which is exactly the cursor change plain SVG editors
        // (Illustrator/Figma) never show while dragging an anchor.
        WebkitUserDrag: 'none',
        userSelect: 'none',
      } as CSSProperties}
    />
  );
}

/**
 * The "Editing" state from the SVG import & edit spec's Part 2 — replaces the normal bounding
 * box/resize handles while active (rendered instead of `SelectionBoundingBox` by
 * `SelectableVectorElement`): a neutral gray outline, joints at every vertex (default/hover/
 * selected), and segment-hover + midpoint-insert for adding new ones. Pen-tool drawing (Part 3) is
 * separate, later work — this only edits an existing path's joints.
 */
export function VectorEditOverlay({ layoutId, element }: { layoutId: string; element: LayoutElement }) {
  const updateElement = useAppStore((s) => s.updateElement);
  const path = element.path;
  const [hoveredJoint, setHoveredJoint] = useState<number | null>(null);
  // Multiple joints at once — shift-click toggles one in/out, a marquee drag replaces (or, held with
  // shift, adds to) the set with everything inside the dragged box. Dragging any member moves the
  // whole set together; a plain click on a joint not already in a multi-selection still just selects
  // that one, same as before.
  const [selectedJoints, setSelectedJoints] = useState<Set<number>>(new Set());
  const selectedJointsRef = useRef(selectedJoints);
  selectedJointsRef.current = selectedJoints;
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [hoveredMidpoint, setHoveredMidpoint] = useState<number | null>(null);
  // Frame-local (0..frame.w, 0..frame.h) rectangle while marquee-selecting, null otherwise.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  if (!path) return null;
  const { frame } = element;
  const segs = segments(path);

  function patchPath(nextPath: VectorPath) {
    const { frame: nextFrame, path: rebased } = rebaseVectorFrame(frame, nextPath);
    updateElement(layoutId, element.id, { frame: nextFrame, path: rebased });
  }

  function startJointDrag(e: ReactMouseEvent, index: number, startPointOverride?: { x: number; y: number }) {
    e.stopPropagation();
    e.preventDefault();

    let dragIndices: number[];
    if (e.shiftKey) {
      const next = new Set(selectedJointsRef.current);
      if (next.has(index)) {
        // Shift-click on an already-selected joint just removes it — nothing to drag from this click.
        next.delete(index);
        setSelectedJoints(next);
        return;
      }
      next.add(index);
      setSelectedJoints(next);
      dragIndices = [...next];
    } else if (selectedJointsRef.current.has(index) && selectedJointsRef.current.size > 1) {
      // Clicking a joint that's already part of a multi-selection drags the whole group together,
      // keeping the selection intact (doesn't collapse it down to just this one).
      dragIndices = [...selectedJointsRef.current];
    } else {
      const next = new Set([index]);
      setSelectedJoints(next);
      dragIndices = [index];
    }

    const startX = e.clientX;
    const startY = e.clientY;
    // `startPointOverride` matters right after an insert (see handleInsertJoint): the just-inserted
    // point doesn't exist in this render's own `path` prop yet (that update hasn't re-rendered this
    // component), so reading `path!.points[index]` here would silently grab whatever point used to
    // sit at that array index pre-insert — the dragged joint then jumps there instead of staying
    // where it was actually placed.
    const startPoints = new Map<number, { x: number; y: number }>();
    for (const i of dragIndices) startPoints.set(i, i === index && startPointOverride ? startPointOverride : path!.points[i]);
    // Pinned for the whole drag regardless of which element the pointer passes over mid-move (the
    // path's own fill, empty canvas, another joint) — plain SVG editors never change the cursor while
    // dragging an anchor, and without this a fast drag can flash whatever that element's own cursor
    // happens to be for a frame or two.
    document.body.style.cursor = 'default';
    // `scale` isn't threaded down to this overlay (it only ever needs the element's own frame, not
    // the live render scale) — derive it the same way useElementDrag's callers already have it:
    // rendered box px per native px, read straight off the DOM, since frame.w is the native size.
    function onMove(ev: globalThis.MouseEvent) {
      const current = useAppStore.getState().layoutsById[layoutId]?.elements.find((el) => el.id === element.id);
      const currentPath = current?.path ?? path!;
      const currentFrame = current?.frame ?? frame;
      const boxEl = document.querySelector(`[data-vector-edit="${element.id}"]`) as HTMLElement | null;
      const renderedW = boxEl?.getBoundingClientRect().width ?? currentFrame.w;
      const liveScale = renderedW / currentFrame.w;
      const dx = (ev.clientX - startX) / liveScale;
      const dy = (ev.clientY - startY) / liveScale;
      const nextPoints = currentPath.points.map((p, i) => {
        const start = startPoints.get(i);
        return start ? { x: start.x + dx, y: start.y + dy } : p;
      });
      updateElement(layoutId, element.id, { path: { ...currentPath, points: nextPoints } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      // Recompute bounds once, after the drag — not on every move — so the shape doesn't fight
      // itself: rebasing mid-drag would change frame.w/h under the same mouse delta used above.
      const current = useAppStore.getState().layoutsById[layoutId]?.elements.find((el) => el.id === element.id);
      if (current?.path) patchPath(current.path);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /** Mousedown on empty space inside the edit box — a plain click clears the selection (unless shift
   * is held, in which case it's a no-op), same as before; a real drag instead draws a marquee and
   * selects (or, with shift, adds) every real anchor whose point ends up inside it. */
  function startMarquee(e: ReactMouseEvent) {
    const boxEl = document.querySelector(`[data-vector-edit="${element.id}"]`) as HTMLElement | null;
    const rect = boxEl?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const shiftKey = e.shiftKey;
    const toLocal = (clientX: number, clientY: number) => ({ x: ((clientX - rect.left) / rect.width) * frame.w, y: ((clientY - rect.top) / rect.height) * frame.h });
    const start = toLocal(e.clientX, e.clientY);
    let moved = false;
    function onMove(ev: globalThis.MouseEvent) {
      const cur = toLocal(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(cur.x - start.x, cur.y - start.y) > 2) moved = true;
      if (moved) setMarquee({ x1: start.x, y1: start.y, x2: cur.x, y2: cur.y });
    }
    function onUp(ev: globalThis.MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarquee(null);
      if (!moved) {
        if (!shiftKey) setSelectedJoints(new Set());
        return;
      }
      const cur = toLocal(ev.clientX, ev.clientY);
      const minX = Math.min(start.x, cur.x);
      const maxX = Math.max(start.x, cur.x);
      const minY = Math.min(start.y, cur.y);
      const maxY = Math.max(start.y, cur.y);
      const hit = new Set<number>(shiftKey ? selectedJointsRef.current : []);
      path!.points.forEach((p, i) => {
        if (path!.anchors && !path!.anchors[i]) return; // only real, visible anchors are selectable
        if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) hit.add(i);
      });
      setSelectedJoints(hit);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleInsertJoint(e: ReactMouseEvent, segmentIndex: number) {
    e.stopPropagation();
    e.preventDefault();
    const { path: nextPath, insertedIndex } = insertMidpointJoint(path!, segmentIndex);
    const insertedPoint = nextPath.points[insertedIndex];
    patchPath(nextPath);
    setHoveredSegment(null);
    setHoveredMidpoint(null);
    // "click on the midpoint inserts the joint and starts moving the cursor" — chain straight into
    // a drag of the newly-inserted joint so the same mousedown both inserts and starts moving it.
    // Pass its real position explicitly (see startJointDrag's own comment on why).
    startJointDrag(e, insertedIndex, insertedPoint);
  }

  return (
    // Not pointer-events-none: this covers exactly the shape's own frame, and anything within it
    // that isn't a joint/midpoint (which stop propagation in their own handlers first) either clears
    // the joint selection on a plain click, or drags out a marquee to select several at once — see
    // `startMarquee`. Wrapped in an outer div `MARQUEE_MARGIN` px bigger on every side: a plain rect/
    // polygon's corner joints sit exactly on the frame's own edge, so a marquee that could only start
    // from strictly *inside* that edge could never enclose every corner in one drag (there'd be no
    // interior starting point outside all of them at once) — the margin gives a lasso-sized sliver of
    // slop to start from just outside the shape. A click further out still reaches the frame's own
    // mousedown and deselects/exits normally.
    <div className="absolute" style={{ inset: -MARQUEE_MARGIN }} onMouseDown={(e) => { e.stopPropagation(); startMarquee(e); }}>
      <div data-vector-edit={element.id} className="absolute" style={{ inset: MARQUEE_MARGIN }}>
      <svg viewBox={`0 0 ${frame.w} ${frame.h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <polyline
          points={path.points.map((p) => `${p.x},${p.y}`).join(' ') + (path.closed ? ` ${path.points[0].x},${path.points[0].y}` : '')}
          fill="none"
          stroke={NEUTRAL_OUTLINE_COLOR}
          strokeWidth={OUTLINE_STROKE}
          vectorEffect="non-scaling-stroke"
        />
        {segs.map((seg, i) => {
          // A straight run is just its two endpoints; a curved run (hidden flattening samples
          // between two real anchors — see `VectorPath.anchors`) traces every one of them, so the
          // hover highlight/hit-area covers the whole curve instead of one tiny flattening step.
          const runPoints = seg.pointIndices.map((idx) => path.points[idx]).map((p) => `${p.x},${p.y}`).join(' ');
          const isHovered = hoveredSegment === i;
          return (
            <g key={i}>
              {/* Generous invisible hit area — constant ~12 screen px regardless of zoom, same
                  `non-scaling-stroke` trick as the visible outline above. */}
              <polyline
                points={runPoints}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'stroke', cursor: 'default' }}
                onMouseEnter={() => setHoveredSegment(i)}
                onMouseLeave={() => setHoveredSegment((cur) => (cur === i ? null : cur))}
              />
              {isHovered && hoveredMidpoint !== i && (
                <polyline points={runPoints} fill="none" stroke={ACCENT_COLOR} strokeWidth={HIGHLIGHT_STROKE} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
              )}
            </g>
          );
        })}
        {marquee && (
          <rect
            x={Math.min(marquee.x1, marquee.x2)}
            y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)}
            height={Math.abs(marquee.y2 - marquee.y1)}
            fill={ACCENT_COLOR}
            fillOpacity={0.15}
            stroke={ACCENT_COLOR}
            strokeWidth={OUTLINE_STROKE}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {segs.map((_, i) => {
        if (hoveredSegment !== i && hoveredMidpoint !== i) return null;
        const mid = segmentMidpoint(path, i);
        const enlarged = hoveredMidpoint === i;
        return (
          <JointIcon
            key={`mid-${i}`}
            icon={enlarged ? JOINT_SELECTED_ICON : MIDPOINT_ICON}
            x={(mid.x / frame.w) * 100}
            y={(mid.y / frame.h) * 100}
            cursor={PEN_ADD_CURSOR}
            onMouseEnter={() => {
              setHoveredMidpoint(i);
              setHoveredSegment(i);
            }}
            onMouseLeave={() => setHoveredMidpoint((cur) => (cur === i ? null : cur))}
            onMouseDown={(e) => handleInsertJoint(e, i)}
          />
        );
      })}

      {path.points.map((p, i) => {
        // Hides the curve-flattening samples — only a real anchor is a visible, draggable joint
        // ("shows every anchor point... hides the control points that shape the curves between
        // them"); a path with no `anchors` array (pen-drawn, shape-converted) has every point as one.
        if (path.anchors && !path.anchors[i]) return null;
        const icon = selectedJoints.has(i) ? JOINT_SELECTED_ICON : hoveredJoint === i ? JOINT_HOVER_ICON : JOINT_ICON;
        return (
          <JointIcon
            key={i}
            icon={icon}
            x={(p.x / frame.w) * 100}
            y={(p.y / frame.h) * 100}
            onMouseEnter={() => setHoveredJoint(i)}
            onMouseLeave={() => setHoveredJoint((cur) => (cur === i ? null : cur))}
            onMouseDown={(e) => startJointDrag(e, i)}
          />
        );
      })}
      </div>
    </div>
  );
}
