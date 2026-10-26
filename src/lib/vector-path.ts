// Runtime (not import-time) helpers for editing a vector layer's joints — see `VectorEditOverlay`.
// Sizes/colors here implement the "Shared visual language" table in svg-import-and-edit.md, kept in
// one place since Part 2 (editing), Part 3 (pen tool), and Part 4 (curves/handles) all reuse them.
import type { Joint, MirrorMode, ShapeKind, VectorPath } from '@/types';
import { boundsOf, normalizeHandle, rectToPoints, type Point } from './svg-geometry';

export const JOINT_SIZE = 8;
export const JOINT_SELECTED_SIZE = 10;
export const JOINT_HIT_RADIUS = 8;
export const SEGMENT_HOVER_TOLERANCE = 6;
export const OUTLINE_STROKE = 1;
export const HIGHLIGHT_STROKE = 1.5;
export const ACCENT_COLOR = '#4570FF';
export const NEUTRAL_OUTLINE_COLOR = 'rgba(255, 255, 255, 0.45)';

// Part 4 (curve handles) — the connecting line from a joint to its handle is still a plain drawn
// line (no dedicated art for that), but the handle's own end-point reuses the pen tool's own joint
// icons, just scaled down — see `HANDLE_JOINT_ICON`/`HANDLE_JOINT_SELECTED_ICON` below. Same white
// 45%-opacity as every other "editing chrome" line in this app (`NEUTRAL_OUTLINE_COLOR`) — kept as
// its own constant since conceptually it's a different line (a handle, not the path's own outline),
// even though the value happens to match today.
export const HANDLE_HIT_RADIUS = 8; // screen px, same generous hit target every other control uses
export const HANDLE_LINE_COLOR = 'rgba(255, 255, 255, 0.45)';

// Each asset's own true circle center within its (drop-shadow-padded) viewBox — rendered at its
// natural intrinsic size, offset by `-center.x`/`-center.y` (not 50%/50%) to land exactly on the
// path vertex it marks. See each .svg's own circle cx/cy.
export const JOINT_ICON = { src: '/icons/SVGs/joint-default.svg', w: 14, h: 14, center: { x: 7, y: 5 } };
export const JOINT_HOVER_ICON = { src: '/icons/SVGs/joint-hover.svg', w: 14, h: 14, center: { x: 7, y: 5 } };
export const JOINT_SELECTED_ICON = { src: '/icons/SVGs/joint-clicked.svg', w: 12, h: 12, center: { x: 6, y: 6 } };
export const MIDPOINT_ICON = { src: '/icons/SVGs/joint-midpoint.svg', w: 8, h: 8, center: { x: 4, y: 4 } };
export const RADIUS_HANDLE_ICON = { src: '/icons/SVGs/radius handler.svg', w: 16, h: 16, center: { x: 8, y: 6 } };
export const PEN_ADD_CURSOR = "url('/icons/SVGs/pen cursor-add 24.svg') 2 2, auto";

/** Scales a joint icon so its own *visible circle* (not the icon's whole drop-shadow-padded box,
 * which is bigger than the circle it actually draws) ends up `targetDiameter` px — scaling the box
 * itself down to that size would make the real dot inside it look tinier still. `nativeCircleDiameter`
 * is that icon's own true circle (its outer ring, where present) diameter — see each .svg's own
 * `r` — not the `w`/`h` of the icon's padded viewBox. */
function scaledJointIcon(icon: typeof JOINT_ICON, nativeCircleDiameter: number, targetDiameter: number): typeof JOINT_ICON {
  const scale = targetDiameter / nativeCircleDiameter;
  return { src: icon.src, w: icon.w * scale, h: icon.h * scale, center: { x: icon.center.x * scale, y: icon.center.y * scale } };
}

// A bezier handle's own end-point marker — the pen tool's own joint icons, their visible dot scaled
// down to a 4px circle instead of their native ~9-11px one: a plain white circle with a blue border
// by default, filling solid blue with a white border while actually being dragged ("focused" —
// reusing `JOINT_ICON`/`JOINT_SELECTED_ICON` is deliberate so a handle end and a real anchor joint
// read as the same family of control, just a visibly smaller, secondary one).
export const HANDLE_JOINT_ICON = scaledJointIcon(JOINT_ICON, 9, 10); // joint-default.svg's own outer ring is r=4.5 (⌀9)
export const HANDLE_JOINT_SELECTED_ICON = scaledJointIcon(JOINT_SELECTED_ICON, 11, 10); // joint-clicked.svg's own circle is r=5.5 (⌀11)

// Part 3 (pen tool) — "Default style for new vectors... final values TBD by design". Matches the
// rest of this app's own shape defaults (`#d9d9d9` is the Shape tool's own default fill) for a
// closed path; an open path's default stroke is the same white-45%-opacity gray every other
// "editing chrome" line in this app uses (see `NEUTRAL_OUTLINE_COLOR`), at a readable 2px.
export const PEN_DEFAULT_FILL = '#D9D9D9';
export const PEN_DEFAULT_STROKE_COLOR = 'rgba(255, 255, 255, 0.45)';
export const PEN_DEFAULT_STROKE_WIDTH = 2;
// Screen px — how close a click needs to land on the first joint to close the path instead of
// placing a new one, same radius every other joint in this app is hit-tested at.
export const CLOSE_PATH_HIT_RADIUS = JOINT_HIT_RADIUS;

// ---------------------------------------------------------------------------------------------
// Part 4: cubic bezier primitives. A straight segment is just the degenerate case (no handles), so
// every segment-shaped helper below treats "both handles null" as its own fast, exact path rather
// than running cubic math on four collapsed-to-two-points control points.
// ---------------------------------------------------------------------------------------------

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function cubicPointAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** De Casteljau subdivision at `t` — the two resulting cubics' own 4 control points each, sharing
 * the split point as `left[3] === right[0]`. Used by "adding a joint on a curved segment": splitting
 * this way reproduces the original curve exactly (no shape change), unlike re-fitting a new curve
 * through 3 arbitrary points would. */
export function cubicSplitAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): { left: [Point, Point, Point, Point]; right: [Point, Point, Point, Point] } {
  const p01 = lerp(p0, p1, t);
  const p12 = lerp(p1, p2, t);
  const p23 = lerp(p2, p3, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const p0123 = lerp(p012, p123, t);
  return { left: [p0, p01, p012, p0123], right: [p0123, p123, p23, p3] };
}

/** The 4 control points a joint-to-joint segment actually draws with — `p1`/`p2` already default to
 * the endpoints themselves when a handle is null, so these are always safe to feed straight into
 * `cubicPointAt`/`cubicSplitAt` even for a plain straight segment (it just degenerates to a line). */
function segmentControlPoints(a: Joint, b: Joint): { p0: Point; p1: Point; p2: Point; p3: Point; straight: boolean } {
  const p0 = { x: a.x, y: a.y };
  const p3 = { x: b.x, y: b.y };
  return { p0, p1: a.handleOut ?? p0, p2: b.handleIn ?? p3, p3, straight: !a.handleOut && !b.handleIn };
}

/** The SVG `d` command for one joint-to-joint segment — `L` when straight, otherwise `C` with
 * `A.handleOut ?? A` / `B.handleIn ?? B` as control points (the spec's own "Model → path" rule). */
function segmentCommand(a: Joint, b: Joint): string {
  const { p1, p2, p3, straight } = segmentControlPoints(a, b);
  if (straight) return `L ${p3.x} ${p3.y}`;
  return `C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}

/** The one and only place a `VectorPath` turns into a real SVG path `d` string — never hand-edit
 * path commands directly, always go through the joint model so every consumer (rendering, editing,
 * export-later) stays in sync. Empty/1-joint paths draw nothing (same as the old points model). */
export function jointsToPathD(path: VectorPath): string {
  const { joints, closed } = path;
  if (joints.length < 2) return '';
  const n = joints.length;
  let d = `M ${joints[0].x} ${joints[0].y}`;
  const segCount = closed ? n : n - 1;
  for (let k = 0; k < segCount; k++) d += ` ${segmentCommand(joints[k], joints[(k + 1) % n])}`;
  if (closed) d += ' Z';
  return d;
}

/** A joint only ever gets rounded by a uniform `style.radius` (see `jointsToRoundedPathD`) when
 * it's a plain sharp corner (no handles of its own) sitting between two plain straight edges — a
 * curve touching it from either side already has its own smooth tangent, so "rounding" it would
 * mean cutting into geometry this feature has no model for. Returns the two straight-line
 * neighbors to round against, or `null` when this joint doesn't qualify. */
function roundableCornerNeighbors(joints: Joint[], i: number, closed: boolean): { prev: Joint; next: Joint } | null {
  const n = joints.length;
  const j = joints[i];
  if (j.handleIn || j.handleOut) return null;
  if (!closed && (i === 0 || i === n - 1)) return null; // open path endpoints are never corners
  const prev = joints[(i - 1 + n) % n];
  const next = joints[(i + 1) % n];
  if (prev.handleOut || next.handleIn) return null; // an adjacent segment isn't a plain line
  return { prev, next };
}

function trimTowards(from: Point, to: Point, dist: number): Point {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1e-6;
  const t = Math.min(dist, len / 2) / len; // capped at half the edge so two rounded corners sharing a short edge can't overlap
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Same joint model as `jointsToPathD`, but every eligible sharp corner (see
 * `roundableCornerNeighbors`) is cut back by `radius` along its own two straight edges and rounded
 * off with a quadratic bezier through the original corner — the same construction a rounded
 * rectangle's own corners use. This never touches the stored joints themselves (purely a rendering-
 * time transform, the same relationship CSS `border-radius` has to a shape's literal box). */
export function jointsToRoundedPathD(path: VectorPath, radius: number): string {
  if (radius <= 0) return jointsToPathD(path);
  const { joints, closed } = path;
  if (joints.length < 2) return '';
  const n = joints.length;

  const entry: Point[] = new Array(n);
  const exit: Point[] = new Array(n);
  const rounded: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const corner = roundableCornerNeighbors(joints, i, closed);
    rounded[i] = !!corner;
    entry[i] = corner ? trimTowards(joints[i], corner.prev, radius) : { x: joints[i].x, y: joints[i].y };
    exit[i] = corner ? trimTowards(joints[i], corner.next, radius) : { x: joints[i].x, y: joints[i].y };
  }

  const segCount = closed ? n : n - 1;
  const start = closed ? exit[0] : entry[0];
  let d = `M ${start.x} ${start.y}`;
  for (let k = 0; k < segCount; k++) {
    const a = k;
    const b = (k + 1) % n;
    // A rounded corner's own adjacent segments are guaranteed plain straight lines (see
    // `roundableCornerNeighbors`), so trimming either end of this segment never affects whether
    // it's a line vs. a curve — only an untouched segment ever still needs the original command.
    d += rounded[a] || rounded[b] ? ` L ${entry[b].x} ${entry[b].y}` : ` ${segmentCommand(joints[a], joints[b])}`;
    if (rounded[b]) d += ` Q ${joints[b].x} ${joints[b].y} ${exit[b].x} ${exit[b].y}`;
  }
  if (closed) d += ' Z';
  return d;
}

/** Every joint's own position AND handle positions — the bounding box of this set always safely
 * contains the rendered curve (a cubic bezier never leaves the convex hull of its 4 control points),
 * so this is what `rebaseVectorFrame` and SVG import's own frame-fitting use instead of just the
 * joints, which could let a long handle's curve bulge outside a tighter box and clip. */
export function allControlPoints(joints: Joint[]): Point[] {
  const pts: Point[] = [];
  for (const j of joints) {
    pts.push({ x: j.x, y: j.y });
    if (j.handleIn) pts.push(j.handleIn);
    if (j.handleOut) pts.push(j.handleOut);
  }
  return pts;
}

/** Every (joint, nextJoint) pair a path actually draws a segment between — for an open path, the
 * closing segment back to the first joint doesn't exist. Every joint is real now (Part 4 has no
 * concept of a hidden "flattening sample" the way the old points model did), so this is just the
 * literal adjacent-index pairs. */
export function segments(path: VectorPath): { a: number; b: number }[] {
  const n = path.joints.length;
  const out: { a: number; b: number }[] = [];
  for (let i = 0; i < n - 1; i++) out.push({ a: i, b: i + 1 });
  if (path.closed && n > 2) out.push({ a: n - 1, b: 0 });
  return out;
}

/** The segment's own point at t=0.5 — the literal midpoint for a straight segment, the curve's real
 * halfway point (not halfway between its endpoints) for a curved one. */
export function segmentMidpoint(path: VectorPath, segmentIndex: number): Point {
  const { a, b } = segments(path)[segmentIndex];
  const { p0, p1, p2, p3, straight } = segmentControlPoints(path.joints[a], path.joints[b]);
  return straight ? lerp(p0, p3, 0.5) : cubicPointAt(p0, p1, p2, p3, 0.5);
}

/** Samples a segment finely enough to draw its own hover-highlight polyline — a straight segment is
 * just its two endpoints, a curved one `steps` evenly-t-spaced points. */
export function sampleSegment(path: VectorPath, segmentIndex: number, steps = 24): Point[] {
  const { a, b } = segments(path)[segmentIndex];
  const { p0, p1, p2, p3, straight } = segmentControlPoints(path.joints[a], path.joints[b]);
  if (straight) return [p0, p3];
  const pts = [p0];
  for (let i = 1; i <= steps; i++) pts.push(cubicPointAt(p0, p1, p2, p3, i / steps));
  return pts;
}

/**
 * "Adding a joint on a curved segment": splits at t=0.5 via de Casteljau (shape doesn't change) and
 * promotes the split point to a real joint with `mirror: 'mirror'` (its own two new handles are
 * collinear by construction). A straight segment has nothing to split — same literal midpoint insert
 * Part 2 always did, a plain corner joint. Either way, the two neighbor joints' handles facing the
 * new joint are shortened to match (`updatedA`/`updatedB`).
 */
export function insertJointOnSegment(path: VectorPath, segmentIndex: number): { path: VectorPath; insertedIndex: number } {
  const { a, b } = segments(path)[segmentIndex];
  const A = path.joints[a];
  const B = path.joints[b];
  const joints = [...path.joints];
  const insertAt = b === 0 && a === joints.length - 1 ? joints.length : a + 1;

  if (!A.handleOut && !B.handleIn) {
    const mid = lerp({ x: A.x, y: A.y }, { x: B.x, y: B.y }, 0.5);
    const newJoint: Joint = { x: mid.x, y: mid.y, handleIn: null, handleOut: null, mirror: 'sharp' };
    joints.splice(insertAt, 0, newJoint);
    return { path: { ...path, joints }, insertedIndex: insertAt };
  }

  const { p0, p1, p2, p3 } = segmentControlPoints(A, B);
  const { left, right } = cubicSplitAt(p0, p1, p2, p3, 0.5);
  const splitPoint = left[3]; // === right[0]
  const newJoint: Joint = {
    x: splitPoint.x,
    y: splitPoint.y,
    handleIn: normalizeHandle(left[2], splitPoint),
    handleOut: normalizeHandle(right[1], splitPoint),
    mirror: 'mirror',
  };
  joints[a] = { ...A, handleOut: normalizeHandle(left[1], { x: A.x, y: A.y }) };
  joints[b] = { ...B, handleIn: normalizeHandle(right[2], { x: B.x, y: B.y }) };
  joints.splice(insertAt, 0, newJoint);
  return { path: { ...path, joints }, insertedIndex: insertAt };
}

/**
 * After a joint/handle moves, the path's own local coordinate space (0..frame.w, 0..frame.h) may no
 * longer tightly fit it — this recomputes a tight bbox (over every joint *and* handle — see
 * `allControlPoints`) and rebases everything into it, shifting `frame.x`/`frame.y` by the same amount
 * so the shape's on-screen position doesn't jump.
 */
export function rebaseVectorFrame(
  frame: { x: number; y: number; w: number; h: number },
  path: VectorPath,
): { frame: { x: number; y: number; w: number; h: number }; path: VectorPath } {
  const bounds = boundsOf(allControlPoints(path.joints));
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const shift = (p: Point) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY });
  const joints = path.joints.map((j) => ({ ...j, ...shift(j), handleIn: j.handleIn ? shift(j.handleIn) : null, handleOut: j.handleOut ? shift(j.handleOut) : null }));
  return { frame: { x: frame.x + bounds.minX, y: frame.y + bounds.minY, w, h }, path: { ...path, joints } };
}

// ---------------------------------------------------------------------------------------------
// Part 4: handle dragging, mirror-mode switching, and sharp↔curve conversion. Pure functions that
// return a new Joint — VectorEditOverlay/ShapeEditorPanel own the actual interaction/state.
// ---------------------------------------------------------------------------------------------

/** SVG has no mirror-mode concept of its own, so an imported joint's mode is inferred from its
 * handle geometry: no handles → `sharp`; only one handle → `nomirror` (nothing to mirror against);
 * both handles collinear-and-opposite *and* equal length (within tolerance) → `mirror`; anything
 * else (opposite but different length, or not opposite at all) → `nomirror`, since this app's
 * simplified 2-mode system has no third "same angle, independent length" state to put it in. */
export function inferMirrorMode(joint: { x: number; y: number; handleIn: Point | null; handleOut: Point | null }): MirrorMode {
  const { handleIn, handleOut, x, y } = joint;
  if (!handleIn && !handleOut) return 'sharp';
  if (!handleIn || !handleOut) return 'nomirror';
  const vIn = { x: handleIn.x - x, y: handleIn.y - y };
  const vOut = { x: handleOut.x - x, y: handleOut.y - y };
  const lenIn = Math.hypot(vIn.x, vIn.y);
  const lenOut = Math.hypot(vOut.x, vOut.y);
  if (lenIn < 1e-6 || lenOut < 1e-6) return 'nomirror';
  let diffDeg = (Math.abs(Math.atan2(vIn.y, vIn.x) - Math.atan2(vOut.y, vOut.x)) * 180) / Math.PI;
  diffDeg %= 360;
  if (diffDeg > 180) diffDeg = 360 - diffDeg;
  if (Math.abs(diffDeg - 180) > 1) return 'nomirror'; // not opposite within ~1°
  return Math.abs(lenIn - lenOut) < 0.5 ? 'mirror' : 'nomirror';
}

/** Moves one of a joint's two handles to `pos` — `'mirror'` reflects the moved handle straight
 * through the joint to place the other (exactly opposite, exactly the same length, in one step);
 * `'nomirror'` leaves the other handle untouched; a `'sharp'` joint has no handles to move (callers
 * gate on that before ever calling this). */
export function moveJointHandle(joint: Joint, side: 'in' | 'out', pos: Point): Joint {
  const next: Joint = { ...joint, [side === 'in' ? 'handleIn' : 'handleOut']: pos };
  if (joint.mirror === 'mirror') {
    const opposite = { x: 2 * joint.x - pos.x, y: 2 * joint.y - pos.y };
    if (side === 'in') next.handleOut = opposite;
    else next.handleIn = opposite;
  }
  return next;
}

/** Dragging the joint itself — both handles translate with it, keeping their own offset from it. */
export function translateJoint(joint: Joint, dx: number, dy: number): Joint {
  const move = (p: Point | null) => (p ? { x: p.x + dx, y: p.y + dy } : null);
  return { ...joint, x: joint.x + dx, y: joint.y + dy, handleIn: move(joint.handleIn), handleOut: move(joint.handleOut) };
}

export type JointAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Aligns every selected joint along one axis to a common value (the minimum for left/top, the
 * midpoint for center/middle, the maximum for right/bottom) — the same convention "align objects"
 * uses elsewhere in this app, just applied to individual points instead of whole elements. With 2+
 * joints selected that value comes from the selection's own bounding box on that axis (so they align
 * relative to each other); with exactly 1, there's no span of its own to align within, so it aligns
 * against the whole path's bounding box instead. A no-op with nothing selected. */
export function alignJoints(path: VectorPath, indices: number[], mode: JointAlignMode): VectorPath {
  if (indices.length === 0) return path;
  const isX = mode === 'left' || mode === 'center' || mode === 'right';
  // A lone joint has no span of its own to align within, so it aligns against the whole path's own
  // bounding box instead (every joint, not just the selected one) — two or more selected joints
  // still align relative to just each other, same as before.
  const referencePts = indices.length === 1 ? path.joints : indices.map((i) => path.joints[i]);
  const values = referencePts.map((p) => (isX ? p.x : p.y));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const target = mode === 'left' || mode === 'top' ? min : mode === 'right' || mode === 'bottom' ? max : (min + max) / 2;
  const set = new Set(indices);
  const joints = path.joints.map((j, i) => {
    if (!set.has(i)) return j;
    return isX ? translateJoint(j, target - j.x, 0) : translateJoint(j, 0, target - j.y);
  });
  return { ...path, joints };
}

/**
 * Switching the mirror-mode control in the right panel snaps the handles immediately — `referenceSide`
 * is "the handle most recently dragged [in this session]; if neither has, `handleOut`" per the spec,
 * resolved by the caller. To `sharp`, both handles are removed outright (nothing to snap). To
 * `nomirror`/`mirror`, the reference handle stays put and the other one rotates to be exactly
 * opposite it — at the reference's own length for `mirror`, at its own *existing* length for
 * `nomirror` (falling back to the reference's length if it didn't have one yet).
 */
export function setJointMirrorMode(joint: Joint, mode: MirrorMode, referenceSide: 'in' | 'out'): Joint {
  if (mode === 'sharp') return { ...joint, handleIn: null, handleOut: null, mirror: 'sharp' };
  const ref = referenceSide === 'in' ? joint.handleIn : joint.handleOut;
  if (!ref) return { ...joint, mirror: mode };
  const other = referenceSide === 'in' ? joint.handleOut : joint.handleIn;
  const refLen = Math.hypot(ref.x - joint.x, ref.y - joint.y);
  const otherLen = mode === 'mirror' || !other ? refLen : Math.hypot(other.x - joint.x, other.y - joint.y);
  const angle = Math.atan2(ref.y - joint.y, ref.x - joint.x) + Math.PI;
  const newOther = { x: joint.x + Math.cos(angle) * otherLen, y: joint.y + Math.sin(angle) * otherLen };
  const result: Joint = { ...joint, mirror: mode };
  if (referenceSide === 'in') result.handleOut = newOther;
  else result.handleIn = newOther;
  return result;
}

/**
 * "sharp → curve": creates both handles along the direction from the previous joint to the next (so
 * the curve flows smoothly through this one), each 1/3 of the distance to its own neighbor on that
 * side, mode set to `mirror`. An open path's endpoint (only one neighbor) gets just the handle facing
 * it, using that neighbor's own direction.
 */
export function convertJointToCurve(joint: Joint, prev: Joint | null, next: Joint | null): Joint {
  const from = prev ?? next;
  const to = next ?? prev;
  if (!from || !to) return joint; // an isolated single-joint path — nothing to flow a curve through
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const outLen = next ? Math.hypot(next.x - joint.x, next.y - joint.y) / 3 : 0;
  const inLen = prev ? Math.hypot(prev.x - joint.x, prev.y - joint.y) / 3 : 0;
  return {
    ...joint,
    handleOut: next ? { x: joint.x + ux * outLen, y: joint.y + uy * outLen } : null,
    handleIn: prev ? { x: joint.x - ux * inLen, y: joint.y - uy * inLen } : null,
    mirror: 'mirror',
  };
}

/** "Curve → sharp": removes both handles — the adjacent segments go straight on this joint's side
 * (they only stay curved if the *neighbor* joint still has a handle facing this one). */
export function convertJointToSharp(joint: Joint): Joint {
  return { ...joint, handleIn: null, handleOut: null, mirror: 'sharp' };
}

// ---------------------------------------------------------------------------------------------
// Shape-kind geometry — plain point arrays for non-vector 'shape' rendering, wrapped into corner
// joints (no handles) for the "make all shapes editable as svg" conversion.
// ---------------------------------------------------------------------------------------------

/** Wraps plain points as corner (no-handle) joints — every non-curve shape conversion below, and the
 * "Count" field's regenerate-as-a-plain-polygon action in ShapeEditorPanel, builds a `VectorPath`
 * this way. */
export function cornerJoints(points: Point[]): Joint[] {
  return points.map((p) => ({ x: p.x, y: p.y, handleIn: null, handleOut: null, mirror: 'sharp' as const }));
}

/**
 * The explicit point geometry a 'shape' kind element actually draws, in frame-local space — how
 * double-clicking any shape ("make all shapes editable as svg") converts it into a real,
 * joint-editable `VectorPath` in place:
 * - rect/line: a 'line' shape already renders as a plain filled rectangle (its "thinness" is just a
 *   very short frame height, not a stroke) — see ElementRenderer — so it converts the same way rect
 *   does, as its 4 corners.
 * - arrow: the same open shaft+arrowhead line `arrowPoints` below draws — stroke-only, not closed.
 * - polygon: the same fixed silhouette `regularPolygonPoints` below draws. `polygonSides` carries a
 *   polygon's current side count across the conversion (its own "Count" field in ShapeEditorPanel).
 * Every one of these starts out as plain corner joints (no handles) — none of these silhouettes have
 * curves of their own. Either way the pre-conversion (non-editable) SVG rendering already draws the
 * exact same points, so converting never visually jumps. Ellipse never reaches this function —
 * keeping a circle looking like a circle once editing starts means it never actually becomes a
 * flat-point vector; see SelectableShapeElement's own ellipse-specific resize-handles-as-joints
 * overlay instead.
 */
export function shapeKindToVectorPath(shape: ShapeKind, w: number, h: number, polygonSides?: number): VectorPath {
  switch (shape) {
    case 'arrow':
      return { joints: cornerJoints(arrowPoints(w, h)), closed: false };
    case 'polygon':
      return { joints: cornerJoints(regularPolygonPoints(polygonSides ?? DEFAULT_POLYGON_SIDES, w, h)), closed: true };
    case 'rect':
    case 'line':
    default:
      return { joints: cornerJoints(rectToPoints(0, 0, w, h)), closed: true };
  }
}

/** Default style for a freshly-added shape — every kind but arrow is a solid fill with no border;
 * an arrow is a stroke-only line+arrowhead (see `arrowPoints`), so its whole visible color comes from
 * `strokeColor`/`strokeWidth` instead ("the default one as white and 4px width"). A rect starts
 * perfectly square-cornered; ellipse/polygon ignore `radius` entirely (see ElementRenderer), so it
 * only ever mattered for rect to begin with. */
export function defaultShapeStyle(shape: ShapeKind): { fill?: string; radius?: number; strokeWidth?: number; strokeColor?: string; strokeStyle?: 'solid' | 'dashed' | 'dotted' } {
  if (shape === 'arrow') return { strokeColor: '#ffffff', strokeWidth: 4, strokeStyle: 'solid' };
  if (shape === 'rect') return { fill: '#d9d9d9', radius: 0, strokeWidth: 0 };
  return { fill: '#d9d9d9', radius: 28, strokeWidth: 0 };
}

/** Arrowhead wing length — a fixed constant, deliberately *not* scaled with the frame's own `w`/`h`:
 * as the frame grows (dragging to create it, or resizing it after), only the shaft — the straight
 * run from tail to tip — should visibly grow longer; the two wing lines stay exactly this long the
 * whole time ("the 2 side arrow lines [stay] the same length from the beginning to the end, only the
 * middle line is growing"). */
export const ARROW_HEAD_LENGTH = 24;

/** A simple rightward shaft with an open "V" arrowhead at its tip, sized to its own `w`×`h` frame —
 * drawn with `stroke` only (see `defaultShapeStyle`), the same convention Figma/Sketch use for an
 * Arrow tool, unlike every other shape kind's solid `fill` silhouette. One open contour — shaft tail
 * → tip → back along one wing → tip → back along the other — so the whole glyph still fits
 * `VectorPath`'s single-contour model without a second `moveto`; retracing the tip is invisible for a
 * stroked (not filled) line. */
export function arrowPoints(w: number, h: number): { x: number; y: number }[] {
  const cy = h / 2;
  // Always the fixed length, even for a just-clicked, still-zero-width shaft — the wings show up at
  // full size immediately instead of sizing up from 0 as the shaft grows.
  const headLen = ARROW_HEAD_LENGTH;
  return [
    { x: 0, y: cy },
    { x: w, y: cy },
    { x: w - headLen, y: cy - headLen * 0.6 },
    { x: w, y: cy },
    { x: w - headLen, y: cy + headLen * 0.6 },
  ];
}

export const DEFAULT_POLYGON_SIDES = 3;
export const MIN_POLYGON_SIDES = 3;

/** A regular N-gon inscribed in a `w`×`h` box, first vertex pointing straight up (12 o'clock) —
 * the same convention the plain 3-point triangle always used, so the "Count" field's default (3)
 * draws exactly the same triangle as before. Used both for a 'polygon' shape (via `style.polygonSides`)
 * and to regenerate a converted vector's own `path.joints` when its Count field changes. */
export function regularPolygonPoints(sides: number, w: number, h: number): { x: number; y: number }[] {
  const n = Math.max(MIN_POLYGON_SIDES, Math.round(sides));
  const cx = w / 2;
  const cy = h / 2;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    points.push({ x: cx + cx * Math.cos(angle), y: cy + cy * Math.sin(angle) });
  }
  return points;
}
