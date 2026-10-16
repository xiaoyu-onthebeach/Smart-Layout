// Runtime (not import-time) helpers for editing a vector layer's joints — see `VectorEditOverlay`.
// Sizes/colors here implement the "Shared visual language" table in svg-import-and-edit.md, kept in
// one place since Part 2 (editing) and Part 3 (pen tool, later) both reuse them.
import type { ShapeKind, VectorPath } from '@/types';
import { boundsOf, rectToPoints } from './svg-geometry';

export const JOINT_SIZE = 8;
export const JOINT_SELECTED_SIZE = 10;
export const JOINT_HIT_RADIUS = 8;
export const SEGMENT_HOVER_TOLERANCE = 6;
export const OUTLINE_STROKE = 1;
export const HIGHLIGHT_STROKE = 1.5;
export const ACCENT_COLOR = '#4570FF';
export const NEUTRAL_OUTLINE_COLOR = 'rgba(255, 255, 255, 0.45)';

// Each asset's own true circle center within its (drop-shadow-padded) viewBox — rendered at its
// natural intrinsic size, offset by `-center.x`/`-center.y` (not 50%/50%) to land exactly on the
// path vertex it marks. See each .svg's own circle cx/cy.
export const JOINT_ICON = { src: '/icons/SVGs/joint-default.svg', w: 14, h: 14, center: { x: 7, y: 5 } };
export const JOINT_HOVER_ICON = { src: '/icons/SVGs/joint-hover.svg', w: 14, h: 14, center: { x: 7, y: 5 } };
export const JOINT_SELECTED_ICON = { src: '/icons/SVGs/joint-clicked.svg', w: 12, h: 12, center: { x: 6, y: 6 } };
export const MIDPOINT_ICON = { src: '/icons/SVGs/joint-midpoint.svg', w: 8, h: 8, center: { x: 4, y: 4 } };
export const RADIUS_HANDLE_ICON = { src: '/icons/SVGs/radius handler.svg', w: 16, h: 16, center: { x: 8, y: 6 } };
export const PEN_ADD_CURSOR = "url('/icons/SVGs/pen cursor-add 24.svg') 2 2, auto";

// Part 3 (pen tool) — "Default style for new vectors... final values TBD by design". Matches the
// rest of this app's own shape defaults (`#d9d9d9` is the Shape tool's own default fill) for a
// closed path; an open path has no real precedent elsewhere, so plain black at a readable 2px.
export const PEN_DEFAULT_FILL = '#D9D9D9';
export const PEN_DEFAULT_STROKE_COLOR = '#000000';
export const PEN_DEFAULT_STROKE_WIDTH = 2;
// Screen px — how close a click needs to land on the first joint to close the path instead of
// placing a new one, same radius every other joint in this app is hit-tested at.
export const CLOSE_PATH_HIT_RADIUS = JOINT_HIT_RADIUS;

/** One edit-mode "segment" per the Part 2 spec's Joint/Adding-joints interactions — not necessarily
 * a single straight line: for an SVG-imported curve this spans everything between two consecutive
 * *visible* anchors (`VectorPath.anchors`), carrying every hidden curve-sample point in between, so
 * hovering/inserting treats the whole curve run as one segment instead of each tiny flattening
 * sample as its own. A path with no hidden samples (pen-drawn, shape-converted, or an import with
 * only straight-line commands) gets exactly the old literal adjacent-point pairs, since every point
 * is its own anchor there. `pointIndices` always runs start→end along the path (wrapping for the
 * closing run), inclusive of both ends. */
export function segments(path: VectorPath): { a: number; b: number; pointIndices: number[] }[] {
  const n = path.points.length;
  const isAnchor = (i: number) => !path.anchors || path.anchors[i];
  const anchorIdx: number[] = [];
  for (let i = 0; i < n; i++) if (isAnchor(i)) anchorIdx.push(i);
  if (anchorIdx.length < 2) return [];
  const out: { a: number; b: number; pointIndices: number[] }[] = [];
  const limit = path.closed ? anchorIdx.length : anchorIdx.length - 1;
  for (let k = 0; k < limit; k++) {
    const a = anchorIdx[k];
    const b = anchorIdx[(k + 1) % anchorIdx.length];
    const pointIndices: number[] = [];
    for (let i = a; ; i = (i + 1) % n) {
      pointIndices.push(i);
      if (i === b) break;
    }
    out.push({ a, b, pointIndices });
  }
  return out;
}

/** The true midpoint along a (possibly multi-point, curved) segment's own run length — a plain
 * 2-point run is just the straight-line average; a curved run interpolates by cumulative arc length
 * so the dot actually sits halfway along the curve, not halfway between its first and last sample. */
export function midpoint(path: VectorPath, segmentIndex: number): { x: number; y: number } {
  const { pointIndices } = segments(path)[segmentIndex];
  const pts = pointIndices.map((i) => path.points[i]);
  if (pts.length <= 2) return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const half = lens[lens.length - 1] / 2;
  for (let i = 1; i < lens.length; i++) {
    if (lens[i] >= half) {
      const segLen = lens[i] - lens[i - 1];
      const t = segLen > 0 ? (half - lens[i - 1]) / segLen : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
  }
  return pts[pts.length - 1];
}

/** Splits a segment by adding a new joint at its midpoint. A plain straight run (no hidden curve
 * samples) still means a literal array insert, exactly as before. A curved run instead *promotes*
 * whichever existing flattening sample already sits closest to the arc-length midpoint into a real,
 * draggable anchor — no new point is invented, so "the curve shape is unchanged". Returns the new
 * path and the inserted/promoted point's index, so the caller can select it right away. */
export function insertMidpointJoint(path: VectorPath, segmentIndex: number): { path: VectorPath; insertedIndex: number } {
  const seg = segments(path)[segmentIndex];
  const { a, b, pointIndices } = seg;
  if (pointIndices.length <= 2) {
    const mid = midpoint(path, segmentIndex);
    // Inserting after `a` is correct for every segment except the closing one (b === 0), which must
    // append at the end instead of before index 0.
    const insertAt = b === 0 && a === path.points.length - 1 ? path.points.length : a + 1;
    const points = [...path.points.slice(0, insertAt), mid, ...path.points.slice(insertAt)];
    const anchors = path.anchors ? [...path.anchors.slice(0, insertAt), true, ...path.anchors.slice(insertAt)] : undefined;
    return { path: { ...path, points, anchors }, insertedIndex: insertAt };
  }
  const pts = pointIndices.map((i) => path.points[i]);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const half = lens[lens.length - 1] / 2;
  let bestI = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const diff = Math.abs(lens[i] - half);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestI = i;
    }
  }
  const insertedIndex = pointIndices[bestI];
  const anchors = [...(path.anchors ?? path.points.map(() => true))];
  anchors[insertedIndex] = true;
  return { path: { ...path, anchors }, insertedIndex };
}

/**
 * After a joint moves, the path's own local coordinate space (0..frame.w, 0..frame.h) may no longer
 * tightly fit it — this recomputes a tight bbox and rebases every point into it, shifting
 * `frame.x`/`frame.y` by the same amount so the shape's on-screen position doesn't jump (the Fabric
 * `pathOffset` concern the spec calls out, done by hand since there's no Fabric here).
 */
export function rebaseVectorFrame(
  frame: { x: number; y: number; w: number; h: number },
  path: VectorPath,
): { frame: { x: number; y: number; w: number; h: number }; path: VectorPath } {
  const bounds = boundsOf(path.points);
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const points = path.points.map((p) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY }));
  return { frame: { x: frame.x + bounds.minX, y: frame.y + bounds.minY, w, h }, path: { ...path, points } };
}

/**
 * The explicit point geometry a 'shape' kind element actually draws, in frame-local space — how
 * double-clicking any shape ("make all shapes editable as svg") converts it into a real,
 * joint-editable `VectorPath` in place:
 * - rect/line: a 'line' shape already renders as a plain filled rectangle (its "thinness" is just a
 *   very short frame height, not a stroke) — see ElementRenderer — so it converts the same way rect
 *   does, as its 4 corners.
 * - arrow: the same open shaft+arrowhead line `arrowPoints` below draws — stroke-only, not closed.
 * - polygon: the same fixed silhouette `shapeKindPolygonPoints` below draws. `polygonSides` carries a
 *   polygon's current side count across the conversion (its own "Count" field in ShapeEditorPanel).
 * Either way the pre-conversion (non-editable) SVG rendering already draws the exact same points, so
 * converting never visually jumps. Ellipse never reaches this function — keeping a circle looking
 * like a circle once editing starts means it never actually becomes a flat-point vector; see
 * SelectableShapeElement's own ellipse-specific resize-handles-as-joints overlay instead.
 */
export function shapeKindToVectorPath(shape: ShapeKind, w: number, h: number, polygonSides?: number): VectorPath {
  switch (shape) {
    case 'arrow':
      return { points: arrowPoints(w, h), closed: false };
    case 'polygon':
      return { points: regularPolygonPoints(polygonSides ?? DEFAULT_POLYGON_SIDES, w, h), closed: true };
    case 'rect':
    case 'line':
    default:
      return { points: rectToPoints(0, 0, w, h), closed: true };
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
 * and to regenerate a converted vector's own `path.points` when its Count field changes. */
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

