/** A single alignment guide line to draw over the scene while dragging a layer.
 * `axis: 'x'` is a VERTICAL line (constant X, spanning a Y range); `axis: 'y'` is a HORIZONTAL line
 * (constant Y, spanning an X range) — same convention as a coordinate axis' own orientation. All
 * values are native layout units (not screen px). */
export type SnapGuide = { axis: 'x' | 'y'; position: number; start: number; end: number; style: 'solid' | 'dotted' };

export type SnapFrame = { x: number; y: number; w: number; h: number };

/** Within this many native px, a dragged layer's edge/center is considered "aligned" and snaps to it. */
const SNAP_THRESHOLD = 4;

/**
 * Given a layer's candidate frame mid-drag, snaps it to the scene's own center (solid guide) and to
 * any other layer's edges/centers (dotted guide) — at most one snap per axis, whichever is closest.
 * Returns the (possibly adjusted) frame plus whatever guides should be drawn this frame.
 */
export function computeSnap(frame: SnapFrame, nativeWidth: number, nativeHeight: number, others: SnapFrame[]): { frame: SnapFrame; guides: SnapGuide[] } {
  let { x, y } = frame;
  const { w, h } = frame;
  const guides: SnapGuide[] = [];

  const sceneCenterX = nativeWidth / 2;
  const sceneCenterY = nativeHeight / 2;
  const rawCenterX = x + w / 2;
  const rawCenterY = y + h / 2;

  if (Math.abs(rawCenterX - sceneCenterX) <= SNAP_THRESHOLD) {
    x = sceneCenterX - w / 2;
    guides.push({ axis: 'x', position: sceneCenterX, start: 0, end: nativeHeight, style: 'solid' });
  }
  if (Math.abs(rawCenterY - sceneCenterY) <= SNAP_THRESHOLD) {
    y = sceneCenterY - h / 2;
    guides.push({ axis: 'y', position: sceneCenterY, start: 0, end: nativeWidth, style: 'solid' });
  }

  // Re-derived from the (possibly already scene-centered) x/y, so a layer that just snapped to the
  // scene's own center can still separately line up with another layer on the other axis.
  const left = x;
  const right = x + w;
  const top = y;
  const bottom = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  let bestX: { position: number; delta: number; start: number; end: number } | null = null;
  let bestY: { position: number; delta: number; start: number; end: number } | null = null;

  for (const other of others) {
    const oLeft = other.x;
    const oRight = other.x + other.w;
    const oTop = other.y;
    const oBottom = other.y + other.h;
    const oCx = other.x + other.w / 2;
    const oCy = other.y + other.h / 2;
    const vStart = Math.min(top, oTop);
    const vEnd = Math.max(bottom, oBottom);
    const hStart = Math.min(left, oLeft);
    const hEnd = Math.max(right, oRight);

    // Every way this layer's own left/right/center could line up with the other's — `delta` is how
    // far the matched edge currently sits from the target; subtracting it from x/y (once, below)
    // shifts the whole frame by exactly that much, landing the matched edge precisely on target.
    const xCandidates = [
      { value: oLeft, delta: left - oLeft },
      { value: oRight, delta: left - oRight },
      { value: oLeft, delta: right - oLeft },
      { value: oRight, delta: right - oRight },
      { value: oCx, delta: cx - oCx },
    ];
    for (const c of xCandidates) {
      if (Math.abs(c.delta) <= SNAP_THRESHOLD && (!bestX || Math.abs(c.delta) < Math.abs(bestX.delta))) {
        bestX = { position: c.value, delta: c.delta, start: vStart, end: vEnd };
      }
    }
    const yCandidates = [
      { value: oTop, delta: top - oTop },
      { value: oBottom, delta: top - oBottom },
      { value: oTop, delta: bottom - oTop },
      { value: oBottom, delta: bottom - oBottom },
      { value: oCy, delta: cy - oCy },
    ];
    for (const c of yCandidates) {
      if (Math.abs(c.delta) <= SNAP_THRESHOLD && (!bestY || Math.abs(c.delta) < Math.abs(bestY.delta))) {
        bestY = { position: c.value, delta: c.delta, start: hStart, end: hEnd };
      }
    }
  }

  if (bestX) {
    x -= bestX.delta;
    guides.push({ axis: 'x', position: bestX.position, start: bestX.start, end: bestX.end, style: 'dotted' });
  }
  if (bestY) {
    y -= bestY.delta;
    guides.push({ axis: 'y', position: bestY.position, start: bestY.start, end: bestY.end, style: 'dotted' });
  }

  return { frame: { x, y, w, h }, guides };
}
