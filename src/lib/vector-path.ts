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

/** Every (point, nextPoint) pair a path actually draws a segment between — for an open path, the
 * closing segment back to the first point doesn't exist. */
export function segments(path: VectorPath): { a: number; b: number }[] {
  const n = path.points.length;
  const out: { a: number; b: number }[] = [];
  for (let i = 0; i < n - 1; i++) out.push({ a: i, b: i + 1 });
  if (path.closed && n > 2) out.push({ a: n - 1, b: 0 });
  return out;
}

export function midpoint(path: VectorPath, segmentIndex: number): { x: number; y: number } {
  const segs = segments(path);
  const { a, b } = segs[segmentIndex];
  const pa = path.points[a];
  const pb = path.points[b];
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

/** Splits a segment by inserting a new joint at its midpoint (straight segments only — curves are
 * out of scope here, so there's no de Casteljau split to do, just an array insert). Returns the new
 * path and the inserted point's index, so the caller can select it right away. */
export function insertMidpointJoint(path: VectorPath, segmentIndex: number): { path: VectorPath; insertedIndex: number } {
  const segs = segments(path);
  const { a, b } = segs[segmentIndex];
  const mid = midpoint(path, segmentIndex);
  // Inserting after `a` is correct for every segment except the closing one (b === 0), which must
  // append at the end instead of before index 0.
  const insertAt = b === 0 && a === path.points.length - 1 ? path.points.length : a + 1;
  const points = [...path.points.slice(0, insertAt), mid, ...path.points.slice(insertAt)];
  return { path: { ...path, points }, insertedIndex: insertAt };
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
 * - arrow/polygon: the same fixed silhouette their own (non-editable, pre-conversion) SVG rendering
 *   already draws — see `shapeKindPolygonPoints` below, which both share. `polygonSides` carries a
 *   polygon's current side count across the conversion (its own "Count" field in ShapeEditorPanel).
 * Ellipse never reaches this function — keeping a circle looking like a circle once editing starts
 * means it never actually becomes a flat-point vector; see SelectableShapeElement's own
 * ellipse-specific resize-handles-as-joints overlay instead.
 */
export function shapeKindToVectorPath(shape: ShapeKind, w: number, h: number, polygonSides?: number): VectorPath {
  switch (shape) {
    case 'arrow':
    case 'polygon':
      return { points: shapeKindPolygonPoints(shape, w, h, polygonSides), closed: true };
    case 'rect':
    case 'line':
    default:
      return { points: rectToPoints(0, 0, w, h), closed: true };
  }
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

/** The fixed silhouette for the two shape kinds that were never a plain CSS rect/ellipse to begin
 * with — both the ordinary (pre-edit) SVG rendering in ElementRenderer/SelectableShapeElement and
 * the editable conversion above draw the exact same points, so an arrow/polygon never visually
 * changes at the moment it becomes editable. `sides` only matters for 'polygon' (its own "Count"
 * field in ShapeEditorPanel — see `style.polygonSides`); arrow ignores it. */
export function shapeKindPolygonPoints(shape: 'arrow' | 'polygon', w: number, h: number, sides: number = DEFAULT_POLYGON_SIDES): { x: number; y: number }[] {
  if (shape === 'polygon') return regularPolygonPoints(sides, w, h);
  // A rightward arrow sized to its own frame: a shaft (30% of the height, vertically centered) the
  // first 60% of the width, then a full-height triangular head for the rest.
  const shaftH = h * 0.3;
  const shaftTop = h / 2 - shaftH / 2;
  const shaftBottom = h / 2 + shaftH / 2;
  const headX = w * 0.6;
  return [
    { x: 0, y: shaftTop },
    { x: headX, y: shaftTop },
    { x: headX, y: 0 },
    { x: w, y: h / 2 },
    { x: headX, y: h },
    { x: headX, y: shaftBottom },
    { x: 0, y: shaftBottom },
  ];
}
