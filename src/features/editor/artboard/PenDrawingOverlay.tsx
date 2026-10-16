import { ACCENT_COLOR, CLOSE_PATH_HIT_RADIUS, HIGHLIGHT_STROKE, JOINT_HOVER_ICON, JOINT_ICON, JOINT_SELECTED_ICON, NEUTRAL_OUTLINE_COLOR, OUTLINE_STROKE } from '@/lib/vector-path';

/**
 * The in-progress path a pen-tool drawing session has placed so far (svg import & edit spec, Part
 * 3 "Drawing a new line"/"New joint confirmed") — there's no real `LayoutElement` yet to hand to
 * `VectorEditOverlay`, so this draws the same visual language itself: committed segments in neutral
 * gray, a live accent-stroke preview segment from the active (last-placed) joint to the cursor, the
 * active joint in its selected style, every other committed joint in its default style. The cursor's
 * own preview joint (the thing that would be placed next) is `PenToolCursor`'s job, not this one's —
 * this only ever draws what's already committed, in the scene's own layout-space coordinates.
 */
export function PenDrawingOverlay({
  points,
  cursor,
  closeHover,
  nativeWidth,
  nativeHeight,
}: {
  points: { x: number; y: number }[];
  cursor: { x: number; y: number } | null;
  /** True when the cursor is close enough to the first joint to close the path on click — swaps
   * that joint to its hover (enlarged) style as a hint, same convention Part 2's midpoint uses. */
  closeHover: boolean;
  nativeWidth: number;
  nativeHeight: number;
}) {
  if (points.length === 0) return null;
  const last = points[points.length - 1];

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg viewBox={`0 0 ${nativeWidth} ${nativeHeight}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        {points.length >= 2 && (
          <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={NEUTRAL_OUTLINE_COLOR} strokeWidth={OUTLINE_STROKE} vectorEffect="non-scaling-stroke" />
        )}
        {cursor && <line x1={last.x} y1={last.y} x2={cursor.x} y2={cursor.y} stroke={ACCENT_COLOR} strokeWidth={HIGHLIGHT_STROKE} vectorEffect="non-scaling-stroke" />}
      </svg>
      {points.map((p, i) => {
        const isActive = i === points.length - 1;
        const isCloseTarget = i === 0 && closeHover && points.length >= 2;
        const icon = isCloseTarget ? JOINT_HOVER_ICON : isActive ? JOINT_SELECTED_ICON : JOINT_ICON;
        return (
          <img
            key={i}
            src={icon.src}
            alt=""
            className="pointer-events-none absolute"
            style={{
              left: `${(p.x / nativeWidth) * 100}%`,
              top: `${(p.y / nativeHeight) * 100}%`,
              width: icon.w,
              height: icon.h,
              transform: `translate(${-icon.center.x}px, ${-icon.center.y}px)`,
            }}
          />
        );
      })}
    </div>
  );
}

/** Screen-space (zoom-independent) distance check — `scale` converts the layout-space delta between
 * two points into the actual on-screen pixel distance, same conversion every other drag handler in
 * this app already does. */
export function isWithinClosePathRadius(a: { x: number; y: number }, b: { x: number; y: number }, scale: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale <= CLOSE_PATH_HIT_RADIUS;
}
