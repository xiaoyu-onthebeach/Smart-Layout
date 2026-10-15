// SVG import — Part 1 of "svg import and edit.md", scoped down per instruction: produces the
// correct canvas elements (vector/group/image) with correct geometry, fill/stroke, and names, but
// doesn't yet try to teach the (flat, non-nested) layer panel about any of this — that's follow-up
// work. See that doc for the full spec this implements a subset of.
//
// Simplifications from the full spec, each left as a TODO rather than half-built:
// - <text> is skipped (real outlining needs opentype.js + a loaded font file; faking it with a
//   plain box would look wrong more often than it'd help).
// - <clipPath>/<mask> are skipped entirely (neither the clip shape nor the clipped content is
//   imported specially) rather than unwrapped into a visible group, since that needs the same
//   nested-group work as below.
// - Nested <g> only ever flattens to ONE level of grouping (a single shared `groupId` on every leaf
//   it contains) — this data model has no real group tree yet (see `GroupAutoLayout`'s own doc
//   comment), so "preserve nested structure" isn't representable until the layer panel work lands.
// - A `<path>` with multiple subpaths (multiple `M`s) becomes one sibling Vector layer per subpath,
//   since `VectorPath` models a single contour.

import type { ElementKind, LayoutElement, VectorPath } from '@/types';
import { nextId } from './create-layout';
import {
  applyMatrix,
  boundsOf,
  ellipseToPoints,
  flattenPathD,
  IDENTITY,
  multiply,
  parsePointsAttr,
  parseTransformAttr,
  rectToPoints,
  type Matrix,
  type Point,
} from './svg-geometry';

export const SVG_IMPORT_NAME_DEFAULTS: Record<'vector' | 'group' | 'image', string> = {
  vector: 'Vector',
  group: 'Group',
  image: 'Image',
};

const SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'style', 'title', 'desc', 'metadata', 'symbol', 'text', 'tspan']);

/** Strips the handful of things an untrusted SVG could use to run code or reach the network, before
 * it's ever handed to DOMParser: `<script>`, `on*` event handler attributes, `<foreignObject>`
 * (arbitrary embedded HTML), and non-`data:` `href`/`xlink:href` values (external fetches). */
export function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/((?:xlink:)?href\s*=\s*"(?!data:))[^"]*"/gi, '$1"')
    .replace(/((?:xlink:)?href\s*=\s*'(?!data:))[^']*'/gi, "$1'");
}

/** The element's own id (or `<title>` child, if present), cleaned up per the naming rule:
 * underscores/hyphens become spaces. `null` when it has neither (gets a numbered default instead). */
function originalName(el: Element): string | null {
  const title = el.querySelector(':scope > title')?.textContent?.trim();
  const raw = title || el.getAttribute('id') || null;
  if (!raw) return null;
  return raw.replace(/[_-]+/g, ' ').trim() || null;
}

type RawRecord = {
  kind: Exclude<ElementKind, 'text'>;
  name: string | null;
  points: Point[]; // absolute (post-transform) SVG user-space points
  closed: boolean;
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  imageUrl?: string;
  groupKey: string | null; // identity of the nearest grouping <g>, shared by every leaf under it
  groupName: string | null;
};

function readStyle(el: Element) {
  const fill = el.getAttribute('fill');
  const stroke = el.getAttribute('stroke');
  const strokeWidthAttr = el.getAttribute('stroke-width');
  return {
    fill: fill && fill !== 'none' ? fill : stroke ? undefined : '#000000',
    strokeColor: stroke && stroke !== 'none' ? stroke : undefined,
    strokeWidth: stroke && stroke !== 'none' ? Number(strokeWidthAttr ?? 1) || 1 : undefined,
  };
}

/** Depth-first walk collecting every leaf shape as a `RawRecord` with fully-resolved absolute
 * points — `groupKey` tags which (single level of) `<g>` it came from, `null` at the SVG root. */
function walk(node: Element, ctm: Matrix, groupKey: string | null, groupName: string | null, out: RawRecord[]) {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    const localM = multiply(ctm, parseTransformAttr(child.getAttribute('transform')));
    const style = readStyle(child);

    if (tag === 'g' || tag === 'a') {
      const key = originalName(child) ? `id:${originalName(child)}` : `g:${nextId('g')}`;
      walk(child, localM, key, originalName(child), out);
      continue;
    }

    if (tag === 'path') {
      const subpaths = flattenPathD(child.getAttribute('d') ?? '');
      const name = originalName(child);
      subpaths.forEach((sp, idx) => {
        out.push({
          kind: 'vector',
          name: subpaths.length > 1 && name ? `${name} ${idx + 1}` : name,
          points: sp.points.map((p) => applyMatrix(localM, p)),
          closed: sp.closed,
          ...style,
          groupKey,
          groupName,
        });
      });
      continue;
    }

    if (tag === 'rect') {
      const x = Number(child.getAttribute('x') ?? 0);
      const y = Number(child.getAttribute('y') ?? 0);
      const w = Number(child.getAttribute('width') ?? 0);
      const h = Number(child.getAttribute('height') ?? 0);
      if (w <= 0 || h <= 0) continue;
      out.push({ kind: 'vector', name: originalName(child), points: rectToPoints(x, y, w, h).map((p) => applyMatrix(localM, p)), closed: true, ...style, groupKey, groupName });
      continue;
    }

    if (tag === 'circle' || tag === 'ellipse') {
      const cx = Number(child.getAttribute('cx') ?? 0);
      const cy = Number(child.getAttribute('cy') ?? 0);
      const r = Number(child.getAttribute('r') ?? 0);
      const rx = Number(child.getAttribute('rx') ?? r);
      const ry = Number(child.getAttribute('ry') ?? r);
      if (rx <= 0 || ry <= 0) continue;
      out.push({ kind: 'vector', name: originalName(child), points: ellipseToPoints(cx, cy, rx, ry).map((p) => applyMatrix(localM, p)), closed: true, ...style, groupKey, groupName });
      continue;
    }

    if (tag === 'line') {
      const p1 = { x: Number(child.getAttribute('x1') ?? 0), y: Number(child.getAttribute('y1') ?? 0) };
      const p2 = { x: Number(child.getAttribute('x2') ?? 0), y: Number(child.getAttribute('y2') ?? 0) };
      out.push({ kind: 'vector', name: originalName(child), points: [p1, p2].map((p) => applyMatrix(localM, p)), closed: false, fill: undefined, strokeColor: style.strokeColor ?? '#000000', strokeWidth: style.strokeWidth ?? 2, groupKey, groupName });
      continue;
    }

    if (tag === 'polyline' || tag === 'polygon') {
      const pts = parsePointsAttr(child.getAttribute('points'));
      if (pts.length < 2) continue;
      out.push({ kind: 'vector', name: originalName(child), points: pts.map((p) => applyMatrix(localM, p)), closed: tag === 'polygon', ...style, groupKey, groupName });
      continue;
    }

    if (tag === 'image') {
      const href = child.getAttribute('href') ?? child.getAttribute('xlink:href');
      if (!href || !href.startsWith('data:')) continue; // external refs were already stripped — nothing to embed
      const x = Number(child.getAttribute('x') ?? 0);
      const y = Number(child.getAttribute('y') ?? 0);
      const w = Number(child.getAttribute('width') ?? 0);
      const h = Number(child.getAttribute('height') ?? 0);
      if (w <= 0 || h <= 0) continue;
      out.push({ kind: 'image', name: originalName(child), points: rectToPoints(x, y, w, h).map((p) => applyMatrix(localM, p)), closed: true, imageUrl: href, groupKey, groupName });
      continue;
    }
    // Unrecognized tags (filters, animations, etc.) are simply not imported.
  }
}

/** Assigns the import's own numbered defaults — separate counters per type, scoped to this one
 * call, only consumed by elements with no original name, in depth-first (document) order. */
function createNumberer() {
  const counters: Record<'vector' | 'group' | 'image', number> = { vector: 0, group: 0, image: 0 };
  return (kind: 'vector' | 'group' | 'image', original: string | null) => {
    if (original) return original;
    counters[kind] += 1;
    return `${SVG_IMPORT_NAME_DEFAULTS[kind]} ${counters[kind]}`;
  };
}

export type SvgImportResult = { elements: LayoutElement[]; warning?: string };

/**
 * Parses sanitized SVG markup into ready-to-place `LayoutElement`s, scaled/positioned so the whole
 * import's bounding box is centered on `target` (clamped to `maxDimension` on its longest side,
 * 1 SVG user-unit = 1 layout px otherwise).
 */
export function parseSvgToElements(svgText: string, target: Point, maxDimension = 320): SvgImportResult {
  const doc = new DOMParser().parseFromString(sanitizeSvg(svgText), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    return { elements: [], warning: 'Could not parse this SVG.' };
  }

  const records: RawRecord[] = [];
  walk(root, IDENTITY, null, null, records);
  if (records.length === 0) return { elements: [], warning: 'No importable shapes found in this SVG.' };

  const allPoints = records.flatMap((r) => r.points);
  const overall = boundsOf(allPoints);
  const overallW = Math.max(1e-3, overall.maxX - overall.minX);
  const overallH = Math.max(1e-3, overall.maxY - overall.minY);
  const scale = Math.min(1, maxDimension / Math.max(overallW, overallH));
  const offsetX = target.x - (overallW * scale) / 2;
  const offsetY = target.y - (overallH * scale) / 2;
  const toLayout = (p: Point) => ({ x: offsetX + (p.x - overall.minX) * scale, y: offsetY + (p.y - overall.minY) * scale });

  const numbered = createNumberer();
  const groupIds = new Map<string, string>(); // groupKey -> assigned LayoutElement groupId
  const groupNameForKey = new Map<string, string>();
  for (const r of records) if (r.groupKey && !groupNameForKey.has(r.groupKey)) groupNameForKey.set(r.groupKey, numbered('group', r.groupName));

  // A <g> wrapping exactly one leaf is a no-op wrapper (structure rule: collapse single-child groups).
  const groupSizes = new Map<string, number>();
  for (const r of records) if (r.groupKey) groupSizes.set(r.groupKey, (groupSizes.get(r.groupKey) ?? 0) + 1);

  const elements: LayoutElement[] = [];
  for (const r of records) {
    const layoutPoints = r.points.map(toLayout);
    const bounds = boundsOf(layoutPoints);
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const local = layoutPoints.map((p) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY }));
    const collapseGroup = r.groupKey && (groupSizes.get(r.groupKey) ?? 0) <= 1;
    const groupId = r.groupKey && !collapseGroup ? (groupIds.get(r.groupKey) ?? groupIds.set(r.groupKey, nextId('group')).get(r.groupKey)!) : undefined;

    const base = {
      id: nextId('el'),
      slot: null,
      frame: { x: bounds.minX, y: bounds.minY, w, h },
      visible: true,
      groupId,
      name: numbered(r.kind === 'image' ? 'image' : 'vector', r.name),
    };

    if (r.kind === 'image') {
      elements.push({ ...base, kind: 'image', imageUrl: r.imageUrl, focalPoint: { x: 0.5, y: 0.5 }, style: {} });
    } else {
      const path: VectorPath = { points: local, closed: r.closed };
      elements.push({
        ...base,
        kind: 'vector',
        path,
        style: { fill: r.closed ? (r.fill ?? '#000000') : undefined, strokeColor: r.strokeColor, strokeWidth: r.strokeWidth, strokeStyle: r.strokeColor ? 'solid' : undefined },
      });
    }
  }

  // Single element overall → no wrapper group, even if it happened to come from a (collapsed) <g>.
  if (elements.length === 1) {
    elements[0].groupId = undefined;
    return { elements };
  }

  // Multiple top-level elements with no <g> of their own at all → wrap everything in one group.
  // (A proper group *name* — the root's id, else `fileName`, else a numbered default — has nowhere
  // to live yet: `groupId` is just a membership tag, groups have no record of their own. That's
  // layer-panel-tree work, deferred along with the rest of it.)
  const anyGrouped = elements.some((el) => el.groupId);
  if (!anyGrouped) {
    const wrapperGroupId = nextId('group');
    for (const el of elements) el.groupId = wrapperGroupId;
  }

  return { elements };
}
