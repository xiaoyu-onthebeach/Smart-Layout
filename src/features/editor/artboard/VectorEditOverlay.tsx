import { useState, type MouseEvent as ReactMouseEvent } from 'react';
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
      }}
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
  const [selectedJoint, setSelectedJoint] = useState<number | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [hoveredMidpoint, setHoveredMidpoint] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

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
    setSelectedJoint(index);
    setDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    // `startPointOverride` matters right after an insert (see handleInsertJoint): the just-inserted
    // point doesn't exist in this render's own `path` prop yet (that update hasn't re-rendered this
    // component), so reading `path!.points[index]` here would silently grab whatever point used to
    // sit at that array index pre-insert — the dragged joint then jumps there instead of staying
    // where it was actually placed.
    const startPoint = startPointOverride ?? path!.points[index];
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
      const nextPoints = currentPath.points.map((p, i) => (i === index ? { x: startPoint.x + dx, y: startPoint.y + dy } : p));
      updateElement(layoutId, element.id, { path: { ...currentPath, points: nextPoints } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      // Recompute bounds once, after the drag — not on every move — so the shape doesn't fight
      // itself: rebasing mid-drag would change frame.w/h under the same mouse delta used above.
      const current = useAppStore.getState().layoutsById[layoutId]?.elements.find((el) => el.id === element.id);
      if (current?.path) patchPath(current.path);
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
    setSelectedJoint(insertedIndex);
    setHoveredSegment(null);
    setHoveredMidpoint(null);
    // "click on the midpoint inserts the joint and starts moving the cursor" — chain straight into
    // a drag of the newly-inserted joint so the same mousedown both inserts and starts moving it.
    // Pass its real position explicitly (see startJointDrag's own comment on why).
    startJointDrag(e, insertedIndex, insertedPoint);
  }

  return (
    // Not pointer-events-none: this covers exactly the shape's own frame, and anything within it
    // that isn't a joint/midpoint (which stop propagation in their own handlers first) just clears
    // the joint selection — "clicking elsewhere on the path... deselects the joint" — without
    // exiting edit mode. A click truly outside this box (on the canvas background) isn't caught
    // here at all, so it reaches the frame's own mousedown and deselects/exits normally.
    <div
      data-vector-edit={element.id}
      className="absolute inset-0"
      onMouseDown={(e) => {
        e.stopPropagation();
        setSelectedJoint(null);
      }}
    >
      <svg viewBox={`0 0 ${frame.w} ${frame.h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <polyline
          points={path.points.map((p) => `${p.x},${p.y}`).join(' ') + (path.closed ? ` ${path.points[0].x},${path.points[0].y}` : '')}
          fill="none"
          stroke={NEUTRAL_OUTLINE_COLOR}
          strokeWidth={OUTLINE_STROKE}
          vectorEffect="non-scaling-stroke"
        />
        {segs.map((seg, i) => {
          const a = path.points[seg.a];
          const b = path.points[seg.b];
          const isHovered = hoveredSegment === i;
          return (
            <g key={i}>
              {/* Generous invisible hit area — constant ~12 screen px regardless of zoom, same
                  `non-scaling-stroke` trick as the visible outline above. */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={12}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'stroke', cursor: 'default' }}
                onMouseEnter={() => setHoveredSegment(i)}
                onMouseLeave={() => setHoveredSegment((cur) => (cur === i ? null : cur))}
              />
              {isHovered && hoveredMidpoint !== i && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ACCENT_COLOR} strokeWidth={HIGHLIGHT_STROKE} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
              )}
            </g>
          );
        })}
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
        const icon = selectedJoint === i || (dragging && selectedJoint === i) ? JOINT_SELECTED_ICON : hoveredJoint === i ? JOINT_HOVER_ICON : JOINT_ICON;
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
  );
}
