// Pure geometry helpers for SVG import — 2D affine transforms, and flattening every SVG shape kind
// (path data included) down to plain polylines, since vector layers in this prototype only ever
// store straight segments (see `VectorPath` in types/index.ts; bezier editing is out of scope for
// the SVG import/edit spec). Curves are sampled finely enough to still *look* right.

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

const BEZIER_STEPS = 16;
const ARC_STEPS = 24;

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, out: Point[]) {
  for (let i = 1; i <= BEZIER_STEPS; i++) {
    const t = i / BEZIER_STEPS;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
}

function sampleQuadratic(p0: Point, p1: Point, p2: Point, out: Point[]) {
  for (let i = 1; i <= BEZIER_STEPS; i++) {
    const t = i / BEZIER_STEPS;
    const mt = 1 - t;
    out.push({ x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x, y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y });
  }
}

/** Endpoint-to-center arc parameterization (SVG spec appendix F.6), sampled into straight segments. */
function sampleArc(p0: Point, rxIn: number, ryIn: number, xAxisRotDeg: number, largeArc: boolean, sweep: boolean, p1: Point, out: Point[]) {
  if (rxIn === 0 || ryIn === 0 || (p0.x === p1.x && p0.y === p1.y)) {
    out.push(p1);
    return;
  }
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

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign2 = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))));
    return sign2 * Math.acos(dot);
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  for (let i = 1; i <= ARC_STEPS; i++) {
    const t = theta1 + (dTheta * i) / ARC_STEPS;
    const x = cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi;
    const y = cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi;
    out.push({ x, y });
  }
}

/** Flattens an SVG path `d` attribute into one or more straight-segment subpaths (absolute points,
 * no transform applied — the caller composes its own ancestor matrix). A `d` with more than one
 * `M` becomes more than one subpath, since `VectorPath` only models a single contour per element —
 * the import step turns each subpath into its own sibling vector layer. */
export function flattenPathD(d: string): { points: Point[]; closed: boolean }[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  const next = () => Number(tokens[i++]);
  const subpaths: { points: Point[]; closed: boolean }[] = [];
  let current: Point[] = [];
  let start: Point = { x: 0, y: 0 };
  let cur: Point = { x: 0, y: 0 };
  let prevCmd = '';
  let prevCtrl: Point | null = null; // reflected control point for S/T

  function closeSubpath() {
    if (current.length > 0) subpaths.push({ points: current, closed: true });
    current = [];
  }
  function openSubpath() {
    if (current.length > 0) subpaths.push({ points: current, closed: false });
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
        openSubpath();
        const x = next();
        const y = next();
        cur = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        start = cur;
        current.push(cur);
        cmd = isRel ? 'l' : 'L'; // subsequent pairs are implicit lineto
        break;
      }
      case 'L': {
        const x = next();
        const y = next();
        cur = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        current.push(cur);
        break;
      }
      case 'H': {
        const x = next();
        cur = { x: isRel ? cur.x + x : x, y: cur.y };
        current.push(cur);
        break;
      }
      case 'V': {
        const y = next();
        cur = { x: cur.x, y: isRel ? cur.y + y : y };
        current.push(cur);
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
        sampleCubic(cur, p1, p2, p3, current);
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
        sampleCubic(cur, p1, p2, p3, current);
        prevCtrl = p2;
        cur = p3;
        break;
      }
      case 'Q': {
        const x1 = next(),
          y1 = next(),
          x = next(),
          y = next();
        const p1 = isRel ? { x: cur.x + x1, y: cur.y + y1 } : { x: x1, y: y1 };
        const p2 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        sampleQuadratic(cur, p1, p2, current);
        prevCtrl = p1;
        cur = p2;
        break;
      }
      case 'T': {
        const x = next(),
          y = next();
        const p1 = prevCtrl && /[QT]/.test(prevCmd.toUpperCase()) ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : cur;
        const p2 = isRel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        sampleQuadratic(cur, p1, p2, current);
        prevCtrl = p1;
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
        sampleArc(cur, rx, ry, rot, largeArc, sweep, p1, current);
        cur = p1;
        break;
      }
      case 'Z': {
        cur = start;
        closeSubpath();
        break;
      }
    }
    if (C !== 'C' && C !== 'S' && C !== 'Q' && C !== 'T') prevCtrl = null;
    prevCmd = cmd;
  }
  if (current.length > 0) subpaths.push({ points: current, closed: false });
  return subpaths.filter((s) => s.points.length >= 2);
}

export function rectToPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function ellipseToPoints(cx: number, cy: number, rx: number, ry: number, segments = 48): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
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
