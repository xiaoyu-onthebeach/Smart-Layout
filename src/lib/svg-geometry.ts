// Pure geometry helpers for SVG import — 2D affine transforms, and turning every SVG shape kind
// (path data included) into the joint+handle model `VectorPath` actually stores (see Part 4 of the
// SVG import/edit spec, and `Joint` in types/index.ts). A path's own curve commands (C/S/Q/T/A) turn
// into real joints with handles, not a flattened polyline — Q and A have no direct equivalent in the
// joint model, so both get converted to one or more cubic segments first (`quadToCubic`/
// `arcToCubicSegments`) and handled identically to a real `C` from there on.

export type Point = { x: number; y: number };
/** [a, b, c, d, e, f] — same layout as `DOMMatrix`/CSS `matrix()`: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Parses an SVG `transform` attribute (space/comma-separated `translate()`/`scale()`/`rotate()`/
 * `matrix()`/`skewX()`/`skewY()`, applied left to right) into one composed matrix. */
export function parseTransformAttr(attr: string | null | undefined): Matrix {
  if (!attr) return IDENTITY;
  let m = IDENTITY;
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attr))) {
    const name = match[1];
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let next: Matrix = IDENTITY;
    switch (name) {
      case 'translate':
        next = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        next = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const deg = args[0] ?? 0;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
        next = multiply([1, 0, 0, 1, cx, cy], multiply([cos, sin, -sin, cos, 0, 0], [1, 0, 0, 1, -cx, -cy]));
        break;
      }
      case 'skewX':
        next = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        next = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      case 'matrix':
        next = [args[0] ?? 1, args[1] ?? 0, args[2] ?? 0, args[3] ?? 1, args[4] ?? 0, args[5] ?? 0];
        break;
    }
    m = multiply(m, next);
  }
  return m;
}

/** `Q`'s single control point promoted to an equivalent cubic's two, per the spec's "Path → model":
 * `cp1 = P0 + 2/3 (Q − P0)`, `cp2 = P2 + 2/3 (Q − P2)`. */
export function quadToCubic(p0: Point, q: Point, p2: Point): { p1: Point; p2: Point } {
  return {
    p1: { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
    p2: { x: p2.x + (2 / 3) * (q.x - p2.x), y: p2.y + (2 / 3) * (q.y - p2.y) },
  };
}

/** One cubic segment's own control points — `p0` is implicit (whatever the running "current point"
 * already is when the caller consumes this), `p1`/`p2`/`p3` are absolute. */
type CubicSeg = { p1: Point; p2: Point; p3: Point };

/**
 * Endpoint-to-center arc parameterization (SVG spec appendix F.6), converted straight to one or more
 * cubic bezier segments (standard ≤90°-per-segment construction) instead of flattened sample points —
 * the joint model has no representation for an arc itself, only corners and cubic curves, so this is
 * the one and only place arc geometry gets approximated at all.
 */
export function arcToCubicSegments(p0: Point, rxIn: number, ryIn: number, xAxisRotDeg: number, largeArc: boolean, sweep: boolean, p1: Point): CubicSeg[] {
  if (rxIn === 0 || ryIn === 0 || (p0.x === p1.x && p0.y === p1.y)) return [{ p1: p0, p2: p1, p3: p1 }];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const phi = (xAxisRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den || 0));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number) => {
    const sign2 = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))));
    return sign2 * Math.acos(dot);
  };
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Point on the transformed ellipse at angle `t` (own ellipse-space angle, not the final rotated one).
  const ellipsePoint = (t: number): Point => ({
    x: cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi,
    y: cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi,
  });
  const ellipseTangent = (t: number): Point => ({
    x: -rx * Math.sin(t) * cosPhi - ry * Math.cos(t) * sinPhi,
    y: -rx * Math.sin(t) * sinPhi + ry * Math.cos(t) * cosPhi,
  });

  const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const segSweep = dTheta / segCount;
  // Standard unit-circle bezier-arc control-length constant for a `segSweep`-wide slice.
  const alpha = (Math.sin(segSweep) * (Math.sqrt(4 + 3 * Math.tan(segSweep / 2) ** 2) - 1)) / 3;

  const out: CubicSeg[] = [];
  for (let k = 0; k < segCount; k++) {
    const a1 = theta1 + k * segSweep;
    const a2 = theta1 + (k + 1) * segSweep;
    const start = ellipsePoint(a1);
    const end = ellipsePoint(a2);
    const tanStart = ellipseTangent(a1);
    const tanEnd = ellipseTangent(a2);
    out.push({
      p1: { x: start.x + alpha * tanStart.x, y: start.y + alpha * tanStart.y },
      p2: { x: end.x - alpha * tanEnd.x, y: end.y - alpha * tanEnd.y },
      p3: end,
    });
  }
  // The arc's own declared endpoint is authoritative (avoids compounding float error across segments).
  out[out.length - 1].p3 = p1;
  return out;
}

const EPS = 1e-4;

/** See `VectorPath`/`Joint` in types/index.ts — kept here (not types/index.ts) since it's a plain
 * geometry value, not a React-aware type. */
export type RawJoint = { x: number; y: number; handleIn: Point | null; handleOut: Point | null };

/** A control point within `EPS` of its own joint means "no handle on that side" (the spec's own
 * phrasing) — collapses a degenerate explicit handle down to `null` so downstream code (handle
 * rendering, mirror-mode inference) only ever sees a real, visible handle or nothing. */
export function normalizeHandle(h: Point, joint: Point): Point | null {
  return Math.hypot(h.x - joint.x, h.y - joint.y) < EPS ? null : h;
}

/**
 * Parses an SVG path `d` attribute into one or more joint contours (absolute points, no transform
 * applied — the caller composes its own ancestor matrix). A `d` with more than one `M` becomes more
 * than one contour, since `VectorPath` only models a single contour per element — the import step
 * turns each into its own sibling vector layer. Mirror modes aren't set here (callers that care
 * infer them via `inferMirrorMode` in vector-path.ts, since that's bundled with the rest of the
 * handle-mode logic); every joint comes back with `mirror: 'sharp'` as a placeholder.
 */
export function parsePathDToJoints(d: string): { joints: RawJoint[]; closed: boolean }[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  const next = () => Number(tokens[i++]);
  const contours: { joints: RawJoint[]; closed: boolean }[] = [];
  let current: RawJoint[] = [];
  let start: Point = { x: 0, y: 0 };
  let cur: Point = { x: 0, y: 0 };
  let prevCmd = '';
  let prevCtrl: Point | null = null; // reflected control point for S/T

  function lastJoint(): RawJoint | undefined {
    return current[current.length - 1];
  }
  /** A straight-line (no incoming handle) endpoint — M/L/H/V and a degenerate arc all go through here. */
  function pushCorner(p: Point) {
    current.push({ x: p.x, y: p.y, handleIn: null, handleOut: null });
  }
  /** A cubic segment from the current point to `seg.p3` — sets the *previous* joint's outgoing handle
   * and appends the new joint with its incoming handle already set (its own outgoing handle, if any,
   * comes from whatever segment leaves it next). */
  function pushCubic(seg: CubicSeg) {
    const from = lastJoint();
    if (from) from.handleOut = normalizeHandle(seg.p1, { x: from.x, y: from.y });
    current.push({ x: seg.p3.x, y: seg.p3.y, handleIn: normalizeHandle(seg.p2, seg.p3), handleOut: null });
  }
  function closeContour() {
    if (current.length > 0) {
      // "if the last joint equals the contour's start, merge them" — the path already curved back to
      // its own origin, so the duplicate last joint collapses into the first (carrying over whatever
      // incoming handle it had, since that's the curve actually arriving at the shared point).
      if (current.length > 1) {
        const last = current[current.length - 1];
        const first = current[0];
        if (Math.hypot(last.x - first.x, last.y - first.y) < EPS) {
          first.handleIn = last.handleIn;
          current.pop();
        }
      }
      contours.push({ joints: current, closed: true });
    }
    current = [];
  }
  function openContour() {
    if (current.length > 0) contours.push({ joints: current, closed: false });
    current = [];
  }

  let cmd = '';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/[a-zA-Z]/.test(tok)) {
      cmd = tok;
      i++;
    } else if (!cmd) {
      break;
    }
    const isRel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case 'M': {
        openContour();
        const x = next();
        const y = next();
        cur = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        start = cur;
        pushCorner(cur);
        cmd = isRel ? 'l' : 'L'; // subsequent pairs are implicit lineto
        break;
      }
      case 'L': {
        const x = next();
        const y = next();
        cur = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        pushCorner(cur);
        break;
      }
      case 'H': {
        const x = next();
        cur = { x: isRel ? cur.x + x : x, y: cur.y };
        pushCorner(cur);
        break;
      }
      case 'V': {
        const y = next();
        cur = { x: cur.x, y: isRel ? cur.y + y : y };
        pushCorner(cur);
        break;
      }
      case 'C': {
        const x1 = next(),
          y1 = next(),
          x2 = next(),
          y2 = next(),
          x = next(),
          y = next();
        const p1 = isRel ? { x: cur.x + x1, y: cur.y + y1 } : { x: x1, y: y1 };
        const p2 = isRel ? { x: cur.x + x2, y: cur.y + y2 } : { x: x2, y: y2 };
        const p3 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        pushCubic({ p1, p2, p3 });
        prevCtrl = p2;
        cur = p3;
        break;
      }
      case 'S': {
        const x2 = next(),
          y2 = next(),
          x = next(),
          y = next();
        const p1 = prevCtrl && /[CS]/.test(prevCmd.toUpperCase()) ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : cur;
        const p2 = isRel ? { x: cur.x + x2, y: cur.y + y2 } : { x: x2, y: y2 };
        const p3 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        pushCubic({ p1, p2, p3 });
        prevCtrl = p2;
        cur = p3;
        break;
      }
      case 'Q': {
        const x1 = next(),
          y1 = next(),
          x = next(),
          y = next();
        const q = isRel ? { x: cur.x + x1, y: cur.y + y1 } : { x: x1, y: y1 };
        const p2 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        const { p1, p2: cp2 } = quadToCubic(cur, q, p2);
        pushCubic({ p1, p2: cp2, p3: p2 });
        prevCtrl = q;
        cur = p2;
        break;
      }
      case 'T': {
        const x = next(),
          y = next();
        const q = prevCtrl && /[QT]/.test(prevCmd.toUpperCase()) ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : cur;
        const p2 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        const { p1, p2: cp2 } = quadToCubic(cur, q, p2);
        pushCubic({ p1, p2: cp2, p3: p2 });
        prevCtrl = q;
        cur = p2;
        break;
      }
      case 'A': {
        const rx = next(),
          ry = next(),
          rot = next(),
          largeArc = next() !== 0,
          sweep = next() !== 0,
          x = next(),
          y = next();
        const p1 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        for (const seg of arcToCubicSegments(cur, rx, ry, rot, largeArc, sweep, p1)) pushCubic(seg);
        cur = p1;
        break;
      }
      case 'Z': {
        cur = start;
        closeContour();
        break;
      }
    }
    if (C !== 'C' && C !== 'S' && C !== 'Q' && C !== 'T') prevCtrl = null;
    prevCmd = cmd;
  }
  openContour(); // flushes a trailing open subpath the same way a fresh `M`/EOF would
  return contours.filter((c) => c.joints.length >= 2);
}

export function rectToPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

const CIRCLE_HANDLE_K = 0.5522847498; // 4/3 * (sqrt(2) - 1), the standard 4-bezier circle approximation

/** A `<circle>`/`<ellipse>` has no path commands of its own, so there's nothing to "infer" — these 4
 * cardinal joints (the same convention Illustrator/Figma use when converting a circle to a path) are
 * built as an exact 4-bezier approximation, each one a true `mirror` joint: at a cardinal point the
 * curve's tangent is governed only by the *other* axis's radius, so `handleIn`/`handleOut` are always
 * exactly opposite and equal length regardless of how different `rx`/`ry` are. */
export function ellipseToJoints(cx: number, cy: number, rx: number, ry: number): RawJoint[] {
  const kx = rx * CIRCLE_HANDLE_K;
  const ky = ry * CIRCLE_HANDLE_K;
  const right = { x: cx + rx, y: cy };
  const bottom = { x: cx, y: cy + ry };
  const left = { x: cx - rx, y: cy };
  const top = { x: cx, y: cy - ry };
  return [
    { ...right, handleIn: { x: right.x, y: right.y - ky }, handleOut: { x: right.x, y: right.y + ky } },
    { ...bottom, handleIn: { x: bottom.x + kx, y: bottom.y }, handleOut: { x: bottom.x - kx, y: bottom.y } },
    { ...left, handleIn: { x: left.x, y: left.y + ky }, handleOut: { x: left.x, y: left.y - ky } },
    { ...top, handleIn: { x: top.x - kx, y: top.y }, handleOut: { x: top.x + kx, y: top.y } },
  ];
}

export function parsePointsAttr(attr: string | null | undefined): Point[] {
  const nums = (attr ?? '').trim().match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

export function boundsOf(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
