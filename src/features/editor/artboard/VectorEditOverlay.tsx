import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Joint, LayoutElement, VectorPath } from '@/types';
import {
  ACCENT_COLOR,
  convertJointToCurve,
  convertJointToSharp,
  HANDLE_JOINT_ICON,
  HANDLE_JOINT_SELECTED_ICON,
  HANDLE_LINE_COLOR,
  HIGHLIGHT_STROKE,
  insertJointOnSegment,
  JOINT_HOVER_ICON,
  JOINT_ICON,
  JOINT_SELECTED_ICON,
  jointsToPathD,
  MIDPOINT_ICON,
  moveJointHandle,
  NEUTRAL_OUTLINE_COLOR,
  OUTLINE_STROKE,
  PEN_ADD_CURSOR,
  rebaseVectorFrame,
  sampleSegment,
  segmentMidpoint,
  segments,
  translateJoint,
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
  onDoubleClick,
}: {
  icon: { src: string; w: number; h: number; center: { x: number; y: number } };
  x: number;
  y: number;
  cursor?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseDown?: (e: ReactMouseEvent) => void;
  onDoubleClick?: (e: ReactMouseEvent) => void;
}) {
  return (
    <img
      src={icon.src}
      alt=""
      draggable={false}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
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
 * The "Editing" state from the SVG import & edit spec's Part 2 (joints, segments, midpoint-insert)
 * and Part 4 (handles, mirror modes, curve conversion) — replaces the normal bounding box/resize
 * handles while active (rendered instead of `SelectionBoundingBox` by `SelectableVectorElement`): a
 * neutral gray outline (curved wherever the path actually curves — real bezier `<path>` via
 * `jointsToPathD`, not a flattened polyline), joints at every vertex, handles on a selected joint and
 * its facing neighbors, and segment-hover + midpoint-insert for adding new ones. Pen-tool drawing
 * (Part 3/4) is separate — this only edits an existing path's joints.
 */
export function VectorEditOverlay({ layoutId, element }: { layoutId: string; element: LayoutElement }) {
  const updateElement = useAppStore((s) => s.updateElement);
  const setEditingVectorJoint = useAppStore((s) => s.setEditingVectorJoint);
  const path = element.path;
  const [hoveredJoint, setHoveredJoint] = useState<number | null>(null);
  // Multiple joints at once — shift-click toggles one in/out, a marquee drag replaces (or, held with
  // shift, adds to) the set with everything inside the dragged box. Dragging any member moves the
  // whole set together; a plain click on a joint not already in a multi-selection still just selects
  // that one, same as before.
  const [selectedJoints, setSelectedJointsState] = useState<Set<number>>(new Set());
  const selectedJointsRef = useRef(selectedJoints);
  selectedJointsRef.current = selectedJoints;
  // "The reference handle is the one most recently dragged [for the currently selected joint] in
  // this session; if neither has, `handleOut`" — reset whenever the selection itself changes (see
  // every `setSelectedJoints` call below) since this only applies in the sense of "this one joint's
  // current selection session".
  const [lastDraggedSide, setLastDraggedSide] = useState<'in' | 'out' | null>(null);
  function setSelectedJoints(next: Set<number>) {
    setSelectedJointsState(next);
    setLastDraggedSide(null);
  }
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [hoveredMidpoint, setHoveredMidpoint] = useState<number | null>(null);
  // Which handle (if any) is actively being dragged right now — its end-point marker fills solid
  // ("focused") while held, same convention a real anchor joint's own selected icon already uses.
  const [draggingHandle, setDraggingHandle] = useState<{ joint: number; side: 'in' | 'out' } | null>(null);
  // Frame-local (0..frame.w, 0..frame.h) rectangle while marquee-selecting, null otherwise.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Mirrors the local selection up to the store — `VectorPathPanel` lives outside this component's
  // tree entirely and has no other way to know which joints are selected (for aligning them / showing
  // their position), or — once exactly one is — which of its handles to treat as the mirror-mode
  // switch's own reference.
  useEffect(() => {
    setEditingVectorJoint(selectedJoints.size > 0 ? { layoutId, elementId: element.id, jointIndices: [...selectedJoints], referenceSide: lastDraggedSide ?? 'out' } : null);
    return () => setEditingVectorJoint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJoints, lastDraggedSide, layoutId, element.id]);

  if (!path) return null;
  const { frame } = element;
  const segs = segments(path);
  const n = path.joints.length;

  function neighborsOf(i: number): { prev: number | null; next: number | null } {
    if (path!.closed) return { prev: (i - 1 + n) % n, next: (i + 1) % n };
    return { prev: i > 0 ? i - 1 : null, next: i < n - 1 ? i + 1 : null };
  }

  // Every (joint, side) whose handle should actually render — the selected joint(s)' own two, plus
  // whichever of their neighbors' handles face them (the ones shaping the two segments touching a
  // selected joint). A plain `Map<index, Set<'in'|'out'>>` since a joint can show up from both its
  // own selection *and* as a neighbor of another selected one.
  const visibleHandles = new Map<number, Set<'in' | 'out'>>();
  function showHandle(idx: number, side: 'in' | 'out') {
    if (!visibleHandles.has(idx)) visibleHandles.set(idx, new Set());
    visibleHandles.get(idx)!.add(side);
  }
  for (const i of selectedJoints) {
    showHandle(i, 'in');
    showHandle(i, 'out');
    const { prev, next } = neighborsOf(i);
    if (prev !== null) showHandle(prev, 'out');
    if (next !== null) showHandle(next, 'in');
  }

  function patchPath(nextPath: VectorPath) {
    const { frame: nextFrame, path: rebased } = rebaseVectorFrame(frame, nextPath);
    updateElement(layoutId, element.id, { frame: nextFrame, path: rebased });
  }

  function startJointDrag(e: ReactMouseEvent, index: number, startJointOverride?: Joint) {
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
      setSelectedJoints(new Set([index]));
      dragIndices = [index];
    }

    const startX = e.clientX;
    const startY = e.clientY;
    // `startJointOverride` matters right after an insert (see handleInsertJoint): the just-inserted
    // joint doesn't exist in this render's own `path` prop yet (that update hasn't re-rendered this
    // component), so reading `path!.joints[index]` here would silently grab whatever joint used to
    // sit at that array index pre-insert — the dragged joint then jumps there instead of staying
    // where it was actually placed (handles included).
    const startJoints = new Map<number, Joint>();
    for (const i of dragIndices) startJoints.set(i, i === index && startJointOverride ? startJointOverride : path!.joints[i]);
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
      const nextJoints = currentPath.joints.map((j, i) => {
        const start = startJoints.get(i);
        return start ? translateJoint(start, dx, dy) : j;
      });
      updateElement(layoutId, element.id, { path: { ...currentPath, joints: nextJoints } });
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

  /** Part 4 "Drag a handle to change curvature" — the opposite handle's own reaction depends on the
   * joint's `mirror` mode (`moveJointHandle` applies that), Shift constrains this handle's own angle
   * (relative to its joint) to 45° increments, and one whole drag is one undo step (a single
   * `patchPath` call on release, same convention `startJointDrag` uses). */
  function startHandleDrag(e: ReactMouseEvent, jointIndex: number, side: 'in' | 'out') {
    e.stopPropagation();
    e.preventDefault();
    setLastDraggedSide(side);
    setDraggingHandle({ joint: jointIndex, side });
    const startX = e.clientX;
    const startY = e.clientY;
    const startJoint = path!.joints[jointIndex];
    const startHandle = (side === 'in' ? startJoint.handleIn : startJoint.handleOut)!;
    document.body.style.cursor = 'default';
    function onMove(ev: globalThis.MouseEvent) {
      const current = useAppStore.getState().layoutsById[layoutId]?.elements.find((el) => el.id === element.id);
      const currentPath = current?.path ?? path!;
      const currentFrame = current?.frame ?? frame;
      const boxEl = document.querySelector(`[data-vector-edit="${element.id}"]`) as HTMLElement | null;
      const renderedW = boxEl?.getBoundingClientRect().width ?? currentFrame.w;
      const liveScale = renderedW / currentFrame.w;
      const dx = (ev.clientX - startX) / liveScale;
      const dy = (ev.clientY - startY) / liveScale;
      let pos = { x: startHandle.x + dx, y: startHandle.y + dy };
      const j = currentPath.joints[jointIndex];
      if (ev.shiftKey) {
        const vx = pos.x - j.x;
        const vy = pos.y - j.y;
        const len = Math.hypot(vx, vy);
        const angle = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
        pos = { x: j.x + Math.cos(angle) * len, y: j.y + Math.sin(angle) * len };
      }
      const joints = currentPath.joints.map((jj, i) => (i === jointIndex ? moveJointHandle(jj, side, pos) : jj));
      updateElement(layoutId, element.id, { path: { ...currentPath, joints } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setDraggingHandle(null);
      const current = useAppStore.getState().layoutsById[layoutId]?.elements.find((el) => el.id === element.id);
      if (current?.path) patchPath(current.path);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /** Part 4 "Convert sharp ↔ curve joint" — double-click is one of the two triggers (the other is
   * the right panel's own Mirroring control, see ShapeEditorPanel). */
  function handleJointDoubleClick(e: ReactMouseEvent, index: number) {
    e.stopPropagation();
    e.preventDefault();
    const joint = path!.joints[index];
    const isCurve = Boolean(joint.handleIn || joint.handleOut);
    let nextJoint: Joint;
    if (isCurve) {
      nextJoint = convertJointToSharp(joint);
    } else {
      const { prev, next } = neighborsOf(index);
      nextJoint = convertJointToCurve(joint, prev !== null ? path!.joints[prev] : null, next !== null ? path!.joints[next] : null);
    }
    const joints = path!.joints.map((j, i) => (i === index ? nextJoint : j));
    patchPath({ ...path!, joints });
  }

  /** Mousedown on empty space inside the edit box — a plain click clears the selection (unless shift
   * is held, in which case it's a no-op), same as before; a real drag instead draws a marquee and
   * selects (or, with shift, adds) every joint whose point ends up inside it. */
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
      path!.joints.forEach((j, i) => {
        if (j.x >= minX && j.x <= maxX && j.y >= minY && j.y <= maxY) hit.add(i);
      });
      setSelectedJoints(hit);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleInsertJoint(e: ReactMouseEvent, segmentIndex: number) {
    e.stopPropagation();
    e.preventDefault();
    const { path: nextPath, insertedIndex } = insertJointOnSegment(path!, segmentIndex);
    const insertedJoint = nextPath.joints[insertedIndex];
    patchPath(nextPath);
    setHoveredSegment(null);
    setHoveredMidpoint(null);
    // "click on the midpoint inserts the joint and starts moving the cursor" — chain straight into
    // a drag of the newly-inserted joint so the same mousedown both inserts and starts moving it.
    // Pass its real joint explicitly (see startJointDrag's own comment on why).
    startJointDrag(e, insertedIndex, insertedJoint);
  }

  return (
    // Not pointer-events-none: this covers exactly the shape's own frame, and anything within it
    // that isn't a joint/handle/midpoint (which stop propagation in their own handlers first) either
    // clears the joint selection on a plain click, or drags out a marquee to select several at once —
    // see `startMarquee`. Wrapped in an outer div `MARQUEE_MARGIN` px bigger on every side: a plain
    // rect/polygon's corner joints sit exactly on the frame's own edge, so a marquee that could only
    // start from strictly *inside* that edge could never enclose every corner in one drag (there'd be
    // no interior starting point outside all of them at once) — the margin gives a lasso-sized sliver
    // of slop to start from just outside the shape. A click further out still reaches the frame's own
    // mousedown and deselects/exits normally.
    <div className="absolute" style={{ inset: -MARQUEE_MARGIN }} onMouseDown={(e) => { e.stopPropagation(); startMarquee(e); }}>
      <div data-vector-edit={element.id} className="absolute" style={{ inset: MARQUEE_MARGIN }}>
        <svg viewBox={`0 0 ${frame.w} ${frame.h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <path d={jointsToPathD(path)} fill="none" stroke={NEUTRAL_OUTLINE_COLOR} strokeWidth={OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />
          {segs.map((_, i) => {
            // Sampled finely enough to approximate a curved segment's own hover-highlight shape —
            // straight segments just get their two endpoints back (see `sampleSegment`).
            const runPoints = sampleSegment(path, i).map((p) => `${p.x},${p.y}`).join(' ');
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
          {/* Handle connector lines — drawn before the joints/handles themselves so they sit behind. */}
          {[...visibleHandles.entries()].flatMap(([idx, sides]) => {
            const j = path.joints[idx];
            const lines: ReactNode[] = [];
            if (sides.has('in') && j.handleIn) lines.push(<line key={`${idx}-in`} x1={j.x} y1={j.y} x2={j.handleIn.x} y2={j.handleIn.y} stroke={HANDLE_LINE_COLOR} strokeWidth={OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />);
            if (sides.has('out') && j.handleOut) lines.push(<line key={`${idx}-out`} x1={j.x} y1={j.y} x2={j.handleOut.x} y2={j.handleOut.y} stroke={HANDLE_LINE_COLOR} strokeWidth={OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />);
            return lines;
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

        {/* Handle end-point markers — the pen tool's own joint icons at a small 4px size (see
            `HANDLE_JOINT_ICON`), filling solid ("focused") only while actually being dragged. */}
        {[...visibleHandles.entries()].flatMap(([idx, sides]) => {
          const j = path.joints[idx];
          const dots: ReactNode[] = [];
          (['in', 'out'] as const).forEach((side) => {
            if (!sides.has(side)) return;
            const h = side === 'in' ? j.handleIn : j.handleOut;
            if (!h) return;
            const focused = draggingHandle?.joint === idx && draggingHandle.side === side;
            dots.push(
              <JointIcon
                key={`${idx}-${side}`}
                icon={focused ? HANDLE_JOINT_SELECTED_ICON : HANDLE_JOINT_ICON}
                x={(h.x / frame.w) * 100}
                y={(h.y / frame.h) * 100}
                onMouseDown={(e) => startHandleDrag(e, idx, side)}
              />,
            );
          });
          return dots;
        })}

        {path.joints.map((j, i) => {
          const icon = selectedJoints.has(i) ? JOINT_SELECTED_ICON : hoveredJoint === i ? JOINT_HOVER_ICON : JOINT_ICON;
          return (
            <JointIcon
              key={i}
              icon={icon}
              x={(j.x / frame.w) * 100}
              y={(j.y / frame.h) * 100}
              onMouseEnter={() => setHoveredJoint(i)}
              onMouseLeave={() => setHoveredJoint((cur) => (cur === i ? null : cur))}
              onMouseDown={(e) => startJointDrag(e, i)}
              onDoubleClick={(e) => handleJointDoubleClick(e, i)}
            />
          );
        })}
      </div>
    </div>
  );
}
