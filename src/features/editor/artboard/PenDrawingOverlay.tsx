import type { Joint } from '@/types';
import {
  ACCENT_COLOR,
  CLOSE_PATH_HIT_RADIUS,
  HANDLE_JOINT_ICON,
  HANDLE_JOINT_SELECTED_ICON,
  HANDLE_LINE_COLOR,
  HIGHLIGHT_STROKE,
  JOINT_HOVER_ICON,
  JOINT_ICON,
  JOINT_SELECTED_ICON,
  jointsToPathD,
  OUTLINE_STROKE,
  PEN_DEFAULT_STROKE_COLOR,
  PEN_DEFAULT_STROKE_WIDTH,
} from '@/lib/vector-path';

function JointGlyph({ icon, x, y, nativeWidth, nativeHeight }: { icon: typeof JOINT_ICON; x: number; y: number; nativeWidth: number; nativeHeight: number }) {
  return (
    <img
      src={icon.src}
      alt=""
      className="pointer-events-none absolute"
      style={{
        left: `${(x / nativeWidth) * 100}%`,
        top: `${(y / nativeHeight) * 100}%`,
        width: icon.w,
        height: icon.h,
        transform: `translate(${-icon.center.x}px, ${-icon.center.y}px)`,
      }}
    />
  );
}

/**
 * The in-progress path a pen-tool drawing session has placed so far (svg import & edit spec, Part
 * 3 "Drawing a new line"/"New joint confirmed", Part 4 "Drag to draw a curve") — there's no real
 * `LayoutElement` yet to hand to `VectorEditOverlay`, so this draws the same visual language itself:
 * committed segments already in the vector's own real finished stroke (curved wherever a joint has a
 * handle — real bezier `<path>` commands via `jointsToPathD`, not a flattened polyline, and in the
 * same style the committed `LayoutElement` will actually render in once finished, not a faint
 * editing-chrome preview), a live accent-stroke preview segment from the active (last-placed) joint
 * to the cursor — itself curved when that joint has an outgoing handle, per "the next preview segment
 * starts curved, following the outgoing handle" — the active joint in its selected style plus its own
 * handles ("while drawing... show the handles of the active joint"), every other committed joint in
 * its default style. The cursor's own preview joint (the thing that would be placed next) is
 * `PenToolCursor`'s job, not this one's — and while actively dragging to shape a handle, `PenToolCursor`
 * deliberately suppresses its own joint glyph so it doesn't double up with the handle's own end-point
 * marker drawn here.
 */
export function PenDrawingOverlay({
  joints,
  cursor,
  pressed,
  closeHover,
  nativeWidth,
  nativeHeight,
}: {
  joints: Joint[];
  cursor: { x: number; y: number } | null;
  /** True for the window between mousedown and mouseup while shaping the active joint's handle —
   * swaps its end-point marker to the "focused" (filled) style while being dragged. */
  pressed: boolean;
  /** True when the cursor is close enough to the first joint to close the path on click — swaps
   * that joint to its hover (enlarged) style as a hint, same convention Part 2's midpoint uses. */
  closeHover: boolean;
  nativeWidth: number;
  nativeHeight: number;
}) {
  if (joints.length === 0) return null;
  const last = joints[joints.length - 1];
  const committedD = joints.length >= 2 ? jointsToPathD({ joints, closed: false }) : '';
  // The not-yet-placed next segment: a straight line unless the active joint already has an
  // outgoing handle, in which case it curves out of that handle same as any other segment would (the
  // cursor itself stands in for a plain corner "next joint" with no handle of its own).
  const previewD = cursor
    ? jointsToPathD({ joints: [last, { x: cursor.x, y: cursor.y, handleIn: null, handleOut: null, mirror: 'sharp' }], closed: false })
    : '';
  const handleIcon = pressed ? HANDLE_JOINT_SELECTED_ICON : HANDLE_JOINT_ICON;

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg viewBox={`0 0 ${nativeWidth} ${nativeHeight}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        {committedD && <path d={committedD} fill="none" stroke={PEN_DEFAULT_STROKE_COLOR} strokeWidth={PEN_DEFAULT_STROKE_WIDTH} vectorEffect="non-scaling-stroke" />}
        {previewD && <path d={previewD} fill="none" stroke={ACCENT_COLOR} strokeWidth={HIGHLIGHT_STROKE} vectorEffect="non-scaling-stroke" />}
        {/* The active joint's own handles — shown while drawing regardless of hover, per the spec. */}
        {last.handleIn && <line x1={last.x} y1={last.y} x2={last.handleIn.x} y2={last.handleIn.y} stroke={HANDLE_LINE_COLOR} strokeWidth={OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />}
        {last.handleOut && <line x1={last.x} y1={last.y} x2={last.handleOut.x} y2={last.handleOut.y} stroke={HANDLE_LINE_COLOR} strokeWidth={OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />}
      </svg>
      {last.handleIn && <JointGlyph icon={handleIcon} x={last.handleIn.x} y={last.handleIn.y} nativeWidth={nativeWidth} nativeHeight={nativeHeight} />}
      {last.handleOut && <JointGlyph icon={handleIcon} x={last.handleOut.x} y={last.handleOut.y} nativeWidth={nativeWidth} nativeHeight={nativeHeight} />}
      {joints.map((j, i) => {
        const isActive = i === joints.length - 1;
        const isCloseTarget = i === 0 && closeHover && joints.length >= 2;
        const icon = isCloseTarget ? JOINT_HOVER_ICON : isActive ? JOINT_SELECTED_ICON : JOINT_ICON;
        return <JointGlyph key={i} icon={icon} x={j.x} y={j.y} nativeWidth={nativeWidth} nativeHeight={nativeHeight} />;
      })}
    </div>
  );
}

export function isWithinClosePathRadius(a: { x: number; y: number }, b: { x: number; y: number }, scale: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale <= CLOSE_PATH_HIT_RADIUS;
}
