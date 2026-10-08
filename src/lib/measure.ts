/**
 * Geometry for the "hold ⌘ to measure" overlay (see measurement-overlay-spec.md) — pure, no React
 * or store dependency, so the case-by-case distance math stays easy to reason about (and test)
 * separately from the overlay's own rendering/event-wiring in ArtboardFrame.tsx.
 */

export type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export function boxFromFrame(frame: { x: number; y: number; w: number; h: number }): Box {
  return { left: frame.x, top: frame.y, right: frame.x + frame.w, bottom: frame.y + frame.h, width: frame.w, height: frame.h };
}

/** The frame's own axis-aligned bounding box once `rotation` (degrees, pivoting around the frame's
 * own center — matches every element renderer's plain `transform: rotate()`) is applied — the
 * "visual" box the spec calls for, not the raw unrotated frame. */
export function rotatedBoundingBox(frame: { x: number; y: number; w: number; h: number }, rotation = 0): Box {
  if (!rotation) return boxFromFrame(frame);
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.w, y: frame.y },
    { x: frame.x + frame.w, y: frame.y + frame.h },
    { x: frame.x, y: frame.y + frame.h },
  ].map(({ x, y }) => {
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function unionBoxes(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function boxContainsPoint(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** One line segment the overlay draws — always purely horizontal or vertical (the spec has no
 * angle/diagonal measurements). `value` is the signed distance it labels; `null` means it's a pure
 * projection guide (Case 3's dashed extension of the target's own edge) with no pill of its own. */
export type MeasureLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
  value: number | null;
};

function line(id: string, x1: number, y1: number, x2: number, y2: number, value: number | null, dashed: boolean): MeasureLine {
  return { id, x1, y1, x2, y2, value, dashed };
}

/**
 * The four cases from measurement-overlay-spec.md § "Measurement rules". `source` is the current
 * selection's own (rotation-aware) box; `target` is whatever's under the cursor — another layer's
 * box, or the frame's own bounds (the frame is just another box here, same math either way).
 */
export function computeMeasureLines(source: Box, target: Box): MeasureLine[] {
  const contains = target.left <= source.left && target.top <= source.top && target.right >= source.right && target.bottom >= source.bottom;
  const hOverlap = source.left < target.right && target.left < source.right;
  const vOverlap = source.top < target.bottom && target.top < source.bottom;

  // Case 1 — target fully contains source: four edge-to-edge distances, each measured from the
  // midpoint of the source's own edge.
  if (contains) {
    const midY = (source.top + source.bottom) / 2;
    const midX = (source.left + source.right) / 2;
    return [
      line('left', target.left, midY, source.left, midY, source.left - target.left, false),
      line('right', source.right, midY, target.right, midY, target.right - source.right, false),
      line('top', midX, target.top, midX, source.top, source.top - target.top, false),
      line('bottom', midX, source.bottom, midX, target.bottom, target.bottom - source.bottom, false),
    ];
  }

  // Case 4 — overlapping on both axes, but neither contains the other: signed edge-to-edge
  // offsets instead of gaps — dashed, so they read as "offset" rather than Case 1's solid "gap".
  if (hOverlap && vOverlap) {
    const midY = (Math.max(source.top, target.top) + Math.min(source.bottom, target.bottom)) / 2;
    const midX = (Math.max(source.left, target.left) + Math.min(source.right, target.right)) / 2;
    return [
      line('left-left', target.left, midY, source.left, midY, source.left - target.left, true),
      line('right-right', source.right, midY, target.right, midY, source.right - target.right, true),
      line('top-top', midX, target.top, midX, source.top, source.top - target.top, true),
      line('bottom-bottom', midX, source.bottom, midX, target.bottom, source.bottom - target.bottom, true),
    ];
  }

  // Case 2 — overlap on exactly one axis: the real gap on the other axis, anchored through
  // source's own center (not the overlap range's center) so it reads as "measured from this
  // object," plus a reference line on the overlapping axis showing how far target's edge pokes out
  // past source's corresponding edge — so the full spatial relationship is visible even on the
  // axis where there's no true gap to report. One dashed line, running the same direction as the
  // real gap line, connects the two: it runs from target's own near edge (no need for a second
  // dashed line along that edge — target's own solid border already reads as that reference)
  // straight through where it crosses the reference line, on to source's own far edge. Suppressed
  // entirely whenever the poke-out isn't positive — target flush with or tucked inside source's
  // edge has nothing worth calling out.
  if (hOverlap && !vOverlap) {
    const sourceMidX = (source.left + source.right) / 2;
    const sourceMidY = (source.top + source.bottom) / 2;
    const targetMidX = (target.left + target.right) / 2;
    const sourceBelow = source.top >= target.bottom;
    const targetNearY = sourceBelow ? target.bottom : target.top;
    const sourceFarY = sourceBelow ? source.bottom : source.top;
    const vGapValue = sourceBelow ? source.top - target.bottom : target.top - source.bottom;
    const vLine = sourceBelow
      ? line('v-gap', sourceMidX, targetNearY, sourceMidX, source.top, vGapValue, false)
      : line('v-gap', sourceMidX, source.bottom, sourceMidX, targetNearY, vGapValue, false);

    // Source sitting right of target's own center reveals the gap between their LEFT edges
    // (target's left edge trails behind); source sitting left reveals the RIGHT edges instead.
    const useLeftLeft = sourceMidX >= targetMidX;
    const hRefValue = useLeftLeft ? source.left - target.left : target.right - source.right;
    if (hRefValue <= 0) return [vLine];

    const refTargetX = useLeftLeft ? target.left : target.right;
    const refSourceX = useLeftLeft ? source.left : source.right;
    const hRef = line('h-ref', refTargetX, sourceMidY, refSourceX, sourceMidY, hRefValue, false);
    const projection = line('h-ref-projection', refTargetX, targetNearY, refTargetX, sourceFarY, null, true);
    return [vLine, hRef, projection];
  }
  if (vOverlap && !hOverlap) {
    const sourceMidX = (source.left + source.right) / 2;
    const sourceMidY = (source.top + source.bottom) / 2;
    const targetMidY = (target.top + target.bottom) / 2;
    const sourceRight = source.left >= target.right;
    const targetNearX = sourceRight ? target.right : target.left;
    const sourceFarX = sourceRight ? source.right : source.left;
    const hGapValue = sourceRight ? source.left - target.right : target.left - source.right;
    const hLine = sourceRight
      ? line('h-gap', targetNearX, sourceMidY, source.left, sourceMidY, hGapValue, false)
      : line('h-gap', source.right, sourceMidY, targetNearX, sourceMidY, hGapValue, false);

    // Mirror of the horizontal case: source below target's center reveals the TOP edges; source
    // above reveals the BOTTOM edges.
    const useTopTop = sourceMidY >= targetMidY;
    const vRefValue = useTopTop ? source.top - target.top : target.bottom - source.bottom;
    if (vRefValue <= 0) return [hLine];

    const refTargetY = useTopTop ? target.top : target.bottom;
    const refSourceY = useTopTop ? source.top : source.bottom;
    const vRef = line('v-ref', sourceMidX, refTargetY, sourceMidX, refSourceY, vRefValue, false);
    const projection = line('v-ref-projection', targetNearX, refTargetY, sourceFarX, refTargetY, null, true);
    return [hLine, vRef, projection];
  }

  // Case 3 — no overlap on either axis (diagonal): both gaps, anchored through the one corner of
  // source nearest the target so the two solid lines meet there at a right angle — with the
  // target's own near edges projected (dashed) across to that corner, since the two boxes don't
  // face each other directly.
  const hGapFromRight = source.left >= target.right;
  const vGapFromBottom = source.top >= target.bottom;
  const hNearTargetX = hGapFromRight ? target.right : target.left;
  const vNearTargetY = vGapFromBottom ? target.bottom : target.top;
  const nearCornerX = hGapFromRight ? source.left : source.right;
  const nearCornerY = vGapFromBottom ? source.top : source.bottom;
  const hGapValue = hGapFromRight ? source.left - target.right : target.left - source.right;
  const vGapValue = vGapFromBottom ? source.top - target.bottom : target.top - source.bottom;
  return [
    line('h-gap-projection', hNearTargetX, vGapFromBottom ? target.bottom : target.top, hNearTargetX, nearCornerY, null, true),
    line('h-gap', hNearTargetX, nearCornerY, nearCornerX, nearCornerY, hGapValue, false),
    line('v-gap-projection', hGapFromRight ? target.right : target.left, vNearTargetY, nearCornerX, vNearTargetY, null, true),
    line('v-gap', nearCornerX, vNearTargetY, nearCornerX, nearCornerY, vGapValue, false),
  ];
}

/** A pill's current layout, in whatever units the caller works in (this overlay always uses
 * screen px, since collision is a screen-space concern — two pills can be native-units apart yet
 * screen-adjacent at high zoom, or the reverse at low zoom). */
export type PillSpec = { id: string; x: number; y: number; width: number; height: number };

/**
 * Nudges overlapping pills apart vertically rather than letting them stack (spec: "offset them
 * perpendicular to their lines"). This app's pills are near-exclusively stacked by nearby text
 * layers and the always-shown dimension pill sitting just below the source box — both inherently
 * vertical arrangements — so a vertical-only separation is a simple, effective best-effort for the
 * shapes this overlay actually produces, not an exhaustive general-purpose solver.
 */
export function resolvePillCollisions(pills: PillSpec[]): Map<string, { x: number; y: number }> {
  const positions = new Map(pills.map((p) => [p.id, { x: p.x, y: p.y }]));
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < pills.length; i++) {
      for (let j = i + 1; j < pills.length; j++) {
        const a = pills[i];
        const b = pills[j];
        const pa = positions.get(a.id)!;
        const pb = positions.get(b.id)!;
        const dx = Math.abs(pa.x - pb.x);
        const dy = Math.abs(pa.y - pb.y);
        const overlapX = (a.width + b.width) / 2 - dx;
        const overlapY = (a.height + b.height) / 2 - dy;
        if (overlapX > 0 && overlapY > 0) {
          const push = overlapY / 2 + 1;
          if (pa.y <= pb.y) {
            pa.y -= push;
            pb.y += push;
          } else {
            pa.y += push;
            pb.y -= push;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return positions;
}

/** Rounds for display, normalizing -0 to 0 — a value that's merely close to 0 due to float drift
 * still reads as the "flush" 0 the spec wants, never a stray "-0". */
export function roundForDisplay(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}
