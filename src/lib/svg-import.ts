// SVG import — Part 1 of "svg import and edit.md". Produces the layer tree the spec describes:
// vector/group/image `LayoutElement`s plus a `GroupMeta` entry per real (kept) group, nested
// exactly as the source SVG's own <g> structure was, with the numbering/naming/structure rules
// below. The layer panel itself (LayersTab.tsx) renders whatever this produces — this file only
// builds the data.
//
// Simplifications from the full spec, each left as a TODO rather than half-built:
// - <text> isn't outlined into real glyph letterforms (needs opentype.js + a loaded font file) — it
//   becomes a single placeholder Vector layer covering the rendered text's own bounding box (a plain
//   rectangle, not actual letter shapes), named after the text content itself, per the spec's own
//   explicit fallback: "acceptable to... present it... as a Vector path layer".
// - <clipPath>/<mask> are skipped entirely (neither the clip shape nor the clipped content is
//   imported specially) rather than unwrapped into a visible group.
// - A `<path>` with multiple subpaths (multiple `M`s) becomes one sibling Vector layer per subpath,
//   since `VectorPath` models a single contour — each still counts as one XML child for the
//   "collapse a single-child group" structure rule below, even though it yields several layers.

import type { ElementKind, GroupMeta, LayoutElement, VectorPath } from '@/types';
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

const SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'style', 'title', 'desc', 'metadata', 'symbol', 'tspan']);

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

// Design tools stamp an un-renamed layer's own default name straight into the exported `id`
// (Figma: "Vector 2", "Rectangle 7", "Group 1" — note the literal space; Illustrator: "path1234",
// "Group_x0020_1", "Layer1"). None of those are a name a person actually chose, so treating them as
// "original name" just means every unrenamed layer in a file shows the exact same handful of
// meaningless labels instead of a clean, distinguishable "Vector 1"/"Vector 2"/... — this is what
// "the layer name is taking the name from the svg file" (an id that isn't really a name) was
// reporting. Checked after underscore/hyphen cleanup, so "Group_1" and "Group 1" both match.
const GENERIC_AUTO_NAME_RE =
  /^(vector|group|frame|rectangle|rect|ellipse|oval|circle|line|polygon|star|path|union|subtract|intersect|exclude|boolean group|component|instance|layer|text|image|svgid)\s*\d*$/i;

/** The element's own id (or `<title>` child, if present), cleaned up per the naming rule:
 * underscores/hyphens become spaces — `null` when it has neither, or when what it has is just a
 * design tool's own auto-generated default (see `GENERIC_AUTO_NAME_RE`), either way falling back to
 * a numbered default instead. */
function originalName(el: Element): string | null {
  const title = el.querySelector(':scope > title')?.textContent?.trim();
  const raw = title || el.getAttribute('id') || null;
  if (!raw) return null;
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  if (!cleaned || GENERIC_AUTO_NAME_RE.test(cleaned)) return null;
  return cleaned;
}

/** Assigns the import's own numbered defaults — separate counters per type, scoped to this one
 * call, only consumed by elements/groups with no original name, in depth-first (document) order —
 * calling this inline, in recursion order, during the walk is what makes that happen, since the
 * walk itself already visits nodes depth-first. */
function createNumberer() {
  const counters: Record<'vector' | 'group' | 'image', number> = { vector: 0, group: 0, image: 0 };
  return (kind: 'vector' | 'group' | 'image', original: string | null) => {
    if (original) return original;
    counters[kind] += 1;
    return `${SVG_IMPORT_NAME_DEFAULTS[kind]} ${counters[kind]}`;
  };
}

type RawRecord = {
  kind: Exclude<ElementKind, 'text'>;
  name: string; // already numbered/resolved at this point
  points: Point[]; // absolute (post-transform) SVG user-space points
  closed: boolean;
  /** See `VectorPath.anchors` — absent means every point is a real anchor (a rect's 4 corners, say). */
  anchors?: boolean[];
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  imageUrl?: string;
  groupId?: string; // real, already-created group id — undefined at the SVG root
};

/** `fill`/`stroke`/`stroke-width` as either plain presentation attributes or packed into a CSS
 * `style="fill:...;stroke:..."` attribute (Illustrator favors the latter) — style wins when both
 * are present, same precedence the browser itself gives them when actually rendering the SVG. */
function readStyle(el: Element) {
  const styleAttr = el.getAttribute('style') ?? '';
  const styleProps: Record<string, string> = {};
  for (const decl of styleAttr.split(';')) {
    const [k, v] = decl.split(':');
    if (k && v) styleProps[k.trim().toLowerCase()] = v.trim();
  }
  const fill = styleProps.fill ?? el.getAttribute('fill');
  const stroke = styleProps.stroke ?? el.getAttribute('stroke');
  const strokeWidthAttr = styleProps['stroke-width'] ?? el.getAttribute('stroke-width');
  return {
    fill: fill && fill !== 'none' ? fill : stroke ? undefined : '#000000',
    strokeColor: stroke && stroke !== 'none' ? stroke : undefined,
    strokeWidth: stroke && stroke !== 'none' ? Number(strokeWidthAttr ?? 1) || 1 : undefined,
  };
}

/** Decodes every embedded (`data:`) `<image>` that's missing an explicit `width`/`height` — common
 * when a design tool sizes it via a wrapping `transform`/`viewBox` instead of the element's own
 * attributes — so `walk` has its real natural pixel size to fall back on. Genuinely async (image
 * decoding always is, even for a data: URI already in memory), unlike `withMeasuring` below: a
 * `getBBox()` read taken synchronously, right after inserting the element, would run before the
 * image has actually decoded and see a 0×0 box — this is why that first attempt at the same fallback
 * silently did nothing for exactly the files that needed it. */
async function preloadImageNaturalSizes(root: Element): Promise<Map<Element, { w: number; h: number }>> {
  const sizes = new Map<Element, { w: number; h: number }>();
  const candidates = Array.from(root.querySelectorAll('image')).filter((el) => {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
    const hasSize = Number(el.getAttribute('width') ?? 0) > 0 && Number(el.getAttribute('height') ?? 0) > 0;
    return href?.startsWith('data:') && !hasSize;
  });
  await Promise.all(
    candidates.map(
      (el) =>
        new Promise<void>((resolve) => {
          const href = (el.getAttribute('href') ?? el.getAttribute('xlink:href'))!;
          const img = new Image();
          img.onload = () => {
            sizes.set(el, { w: img.naturalWidth, h: img.naturalHeight });
            resolve();
          };
          img.onerror = () => resolve(); // left unset — the element is just skipped later
          img.src = href;
        }),
    ),
  );
  return sizes;
}

/** Renders `root` into a detached-but-connected (zero-size, hidden) container so `getBBox()` works
 * on its descendants — the only way to get a `<text>` element's real rendered extent (font metrics
 * aren't otherwise available without a loaded font file). Always cleans up after itself,
 * synchronously — text layout (unlike image decoding above) is ready the instant it's connected. */
function withMeasuring<T>(root: Element, fn: (measure: (el: SVGGraphicsElement) => DOMRect | null) => T): T {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:0;height:0;overflow:hidden;';
  const clone = root.cloneNode(true) as Element;
  host.appendChild(clone);
  document.body.appendChild(host);
  // Original element → its measurable clone, correlated by document order (structure is identical).
  const originalAll = Array.from(root.querySelectorAll('*'));
  const cloneAll = Array.from(clone.querySelectorAll('*'));
  const cloneFor = new Map<Element, Element>();
  originalAll.forEach((el, i) => cloneFor.set(el, cloneAll[i]));

  function measure(el: SVGGraphicsElement): DOMRect | null {
    const target = (cloneFor.get(el) as unknown as SVGGraphicsElement) ?? el;
    try {
      const box = target.getBBox();
      return box.width > 0 || box.height > 0 ? box : null;
    } catch {
      return null;
    }
  }

  try {
    return fn(measure);
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Depth-first walk building both the leaf `RawRecord`s and the `groupMeta` entries for every real
 * (kept) group — a `<g>` is skipped as a layer (never gets a groupId/groupMeta entry of its own,
 * its children reparent straight to `parentGroupId`) when it's empty, or collapsed when it has
 * exactly one XML child and no id/title of its own (structure rules: "remove empty groups",
 * "collapse a <g> that has exactly one child and no meaningful styling into that child"). Every kept
 * group's own transform is already folded into `ctm` before recursing, so nothing downstream ever
 * needs to know it was there — "flatten group transforms into children where possible".
 */
function walk(
  node: Element,
  ctm: Matrix,
  parentGroupId: string | undefined,
  numbered: ReturnType<typeof createNumberer>,
  groupMeta: Record<string, GroupMeta>,
  measure: (el: SVGGraphicsElement) => DOMRect | null,
  imageSizes: Map<Element, { w: number; h: number }>,
  out: RawRecord[],
) {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    const localM = multiply(ctm, parseTransformAttr(child.getAttribute('transform')));
    const style = readStyle(child);

    if (tag === 'g' || tag === 'a') {
      const renderableChildren = Array.from(child.children).filter((c) => !SKIP_TAGS.has(c.tagName.toLowerCase()));
      if (renderableChildren.length === 0) continue; // empty group — removed entirely
      const name = originalName(child);
      if (renderableChildren.length === 1 && !name) {
        // Collapse: no group/number consumed, children reparent straight to this <g>'s own parent.
        walk(child, localM, parentGroupId, numbered, groupMeta, measure, imageSizes, out);
        continue;
      }
      const groupId = nextId('group');
      groupMeta[groupId] = { name: numbered('group', name), parentGroupId };
      walk(child, localM, groupId, numbered, groupMeta, measure, imageSizes, out);
      continue;
    }

    if (tag === 'path') {
      const subpaths = flattenPathD(child.getAttribute('d') ?? '');
      const name = originalName(child);
      subpaths.forEach((sp, idx) => {
        out.push({
          kind: 'vector',
          name: numbered('vector', subpaths.length > 1 && name ? `${name} ${idx + 1}` : name),
          points: sp.points.map((p) => applyMatrix(localM, p)),
          closed: sp.closed,
          anchors: sp.anchors,
          ...style,
          groupId: parentGroupId,
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
      out.push({ kind: 'vector', name: numbered('vector', originalName(child)), points: rectToPoints(x, y, w, h).map((p) => applyMatrix(localM, p)), closed: true, ...style, groupId: parentGroupId });
      continue;
    }

    if (tag === 'circle' || tag === 'ellipse') {
      const cx = Number(child.getAttribute('cx') ?? 0);
      const cy = Number(child.getAttribute('cy') ?? 0);
      const r = Number(child.getAttribute('r') ?? 0);
      const rx = Number(child.getAttribute('rx') ?? r);
      const ry = Number(child.getAttribute('ry') ?? r);
      if (rx <= 0 || ry <= 0) continue;
      const ellipse = ellipseToPoints(cx, cy, rx, ry);
      out.push({
        kind: 'vector',
        name: numbered('vector', originalName(child)),
        points: ellipse.points.map((p) => applyMatrix(localM, p)),
        closed: true,
        anchors: ellipse.anchors,
        ...style,
        groupId: parentGroupId,
      });
      continue;
    }

    if (tag === 'line') {
      const p1 = { x: Number(child.getAttribute('x1') ?? 0), y: Number(child.getAttribute('y1') ?? 0) };
      const p2 = { x: Number(child.getAttribute('x2') ?? 0), y: Number(child.getAttribute('y2') ?? 0) };
      out.push({
        kind: 'vector',
        name: numbered('vector', originalName(child)),
        points: [p1, p2].map((p) => applyMatrix(localM, p)),
        closed: false,
        fill: undefined,
        strokeColor: style.strokeColor ?? '#000000',
        strokeWidth: style.strokeWidth ?? 2,
        groupId: parentGroupId,
      });
      continue;
    }

    if (tag === 'polyline' || tag === 'polygon') {
      const pts = parsePointsAttr(child.getAttribute('points'));
      if (pts.length < 2) continue;
      out.push({
        kind: 'vector',
        name: numbered('vector', originalName(child)),
        points: pts.map((p) => applyMatrix(localM, p)),
        closed: tag === 'polygon',
        ...style,
        groupId: parentGroupId,
      });
      continue;
    }

    if (tag === 'text') {
      const content = (child.textContent ?? '').trim();
      if (!content) continue;
      // Real glyph outlining needs opentype.js + a loaded font file — see this file's own top
      // comment. This is a placeholder box over the text's own rendered extent instead, so it at
      // least exists as one Vector layer named after what it actually says.
      const box = measure(child as unknown as SVGGraphicsElement);
      const x = box?.x ?? Number(child.getAttribute('x') ?? 0);
      const y = box?.y ?? Number(child.getAttribute('y') ?? 0);
      const w = box?.width ?? Math.max(1, content.length * (Number(child.getAttribute('font-size') ?? 16) * 0.6));
      const h = box?.height ?? Number(child.getAttribute('font-size') ?? 16) * 1.2;
      out.push({
        kind: 'vector',
        name: numbered('vector', content.length > 40 ? `${content.slice(0, 40)}…` : content),
        points: rectToPoints(x, y, w, h).map((p) => applyMatrix(localM, p)),
        closed: true,
        ...style,
        groupId: parentGroupId,
      });
      continue;
    }

    if (tag === 'image') {
      const href = child.getAttribute('href') ?? child.getAttribute('xlink:href');
      if (!href || !href.startsWith('data:')) continue; // external refs were already stripped — nothing to embed
      const x = Number(child.getAttribute('x') ?? 0);
      const y = Number(child.getAttribute('y') ?? 0);
      let w = Number(child.getAttribute('width') ?? 0);
      let h = Number(child.getAttribute('height') ?? 0);
      if (w <= 0 || h <= 0) {
        // No explicit size (common when it's sized by an ancestor's transform/viewBox instead) —
        // fall back to the embedded image's own natural pixel size, decoded ahead of time by
        // `preloadImageNaturalSizes` (a real width/height isn't knowable synchronously here).
        const natural = imageSizes.get(child);
        if (natural && natural.w > 0 && natural.h > 0) {
          w = natural.w;
          h = natural.h;
        } else continue;
      }
      out.push({
        kind: 'image',
        name: numbered('image', originalName(child)),
        points: rectToPoints(x, y, w, h).map((p) => applyMatrix(localM, p)),
        closed: true,
        imageUrl: href,
        groupId: parentGroupId,
      });
      continue;
    }
    // Unrecognized tags (filters, animations, etc.) are simply not imported.
  }
}

export type SvgImportResult = { elements: LayoutElement[]; groupMeta: Record<string, GroupMeta>; warning?: string };

/**
 * Parses sanitized SVG markup into ready-to-place `LayoutElement`s (plus the `GroupMeta` entries
 * their `groupId`s reference), scaled/positioned so the whole import's bounding box is centered on
 * `target` (clamped to `maxDimension` on its longest side, 1 SVG user-unit = 1 layout px otherwise).
 */
export async function parseSvgToElements(svgText: string, target: Point, maxDimension = 320): Promise<SvgImportResult> {
  const doc = new DOMParser().parseFromString(sanitizeSvg(svgText), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    return { elements: [], groupMeta: {}, warning: 'Could not parse this SVG.' };
  }

  const imageSizes = await preloadImageNaturalSizes(root);
  const numbered = createNumberer();
  const groupMeta: Record<string, GroupMeta> = {};
  const records: RawRecord[] = withMeasuring(root, (measure) => {
    const collected: RawRecord[] = [];
    walk(root, IDENTITY, undefined, numbered, groupMeta, measure, imageSizes, collected);
    return collected;
  });
  if (records.length === 0) return { elements: [], groupMeta: {}, warning: 'No importable shapes found in this SVG.' };

  const allPoints = records.flatMap((r) => r.points);
  const overall = boundsOf(allPoints);
  const overallW = Math.max(1e-3, overall.maxX - overall.minX);
  const overallH = Math.max(1e-3, overall.maxY - overall.minY);
  const scale = Math.min(1, maxDimension / Math.max(overallW, overallH));
  const offsetX = target.x - (overallW * scale) / 2;
  const offsetY = target.y - (overallH * scale) / 2;
  const toLayout = (p: Point) => ({ x: offsetX + (p.x - overall.minX) * scale, y: offsetY + (p.y - overall.minY) * scale });

  const elements: LayoutElement[] = records.map((r) => {
    const layoutPoints = r.points.map(toLayout);
    const bounds = boundsOf(layoutPoints);
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const local = layoutPoints.map((p) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY }));

    const base = { id: nextId('el'), slot: null, frame: { x: bounds.minX, y: bounds.minY, w, h }, visible: true, groupId: r.groupId, name: r.name } as const;

    if (r.kind === 'image') return { ...base, kind: 'image' as const, imageUrl: r.imageUrl, focalPoint: { x: 0.5, y: 0.5 }, style: {} };

    const path: VectorPath = { points: local, closed: r.closed, anchors: r.anchors };
    return {
      ...base,
      kind: 'vector' as const,
      path,
      style: { fill: r.closed ? (r.fill ?? '#000000') : undefined, strokeColor: r.strokeColor, strokeWidth: r.strokeWidth, strokeStyle: r.strokeColor ? 'solid' : undefined },
    };
  });

  // Single element overall → no wrapper group, even if it happened to come from a (collapsed) <g>.
  if (elements.length === 1) {
    const [only] = elements;
    only.groupId = undefined;
    return { elements, groupMeta: {} };
  }

  // Multiple top-level items (loose elements and/or top-level groups) → wrap everything in one
  // group, named after the SVG root's own id if it has one, else a numbered default (there's no
  // source file name available at this layer — only a caller with one would know it).
  const hasLooseTopLevelElements = elements.some((el) => !el.groupId);
  const topLevelGroupIds = Object.entries(groupMeta)
    .filter(([, meta]) => !meta.parentGroupId)
    .map(([id]) => id);
  const topLevelRootCount = (hasLooseTopLevelElements ? 1 : 0) + topLevelGroupIds.length;
  if (topLevelRootCount > 1) {
    const wrapperGroupId = nextId('group');
    groupMeta[wrapperGroupId] = { name: numbered('group', originalName(root)) };
    for (const el of elements) if (!el.groupId) el.groupId = wrapperGroupId;
    for (const id of topLevelGroupIds) groupMeta[id].parentGroupId = wrapperGroupId;
  }

  return { elements, groupMeta };
}
