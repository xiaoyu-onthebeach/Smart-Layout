/** Purely decorative ruler overlay — ticks/labels track the canvas's own pan/zoom (`camera`) so
 * they look right at any zoom level, but nothing here is interactive: no draggable guides, no
 * click-to-measure, no snapping. Toggled by the ruler icon in `CanvasZoomBar`. */

/** Shared strip thickness for both the top and left ruler bars, and the corner square between
 * them — also read by `TopBar` to push the header down/right by the same amount while shown. */
export const RULER_SIZE = 24;

// The app's own canvas background is `#131316` — a translucent version of that exact color was
// invisible (blending with whatever's behind it), so the ruler bars use the lighter "elevated
// surface" tone the editing panels already use (`#19191D`) instead, for real contrast.
const RULER_BG = 'rgba(25,25,29,0.92)';
const RULER_SHADOW = '0px 4px 32px 4px rgba(0,0,0,0.24)';
const TICK_MINOR_COLOR = 'rgba(64,64,74,0.5)';
const TICK_MAJOR_COLOR = '#50505D';
const LABEL_COLOR = 'rgba(255,255,255,0.45)';

const MIN_MAJOR_PX = 56;

/** "Nice numbers" step-size pick (1/2/5 x a power of ten) so major ticks land on clean values at
 * any zoom level, the same technique chart axes use — instead of a fixed 50px-canvas-unit step that
 * would look absurdly dense zoomed out or absurdly sparse zoomed in. */
function pickMajorStep(zoom: number): number {
  const target = MIN_MAJOR_PX / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const residual = target / magnitude;
  const nice = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  return nice * magnitude;
}

type Tick = { pos: number; major: boolean; label: string };

/** One axis's worth of ticks, in track-local screen pixels (`0` = the ruler's own start, right
 * after the corner square) — `offset`/`zoom` are that axis's own camera fields. */
function buildTicks(offset: number, zoom: number, trackLength: number): Tick[] {
  const step = pickMajorStep(zoom);
  const minorStep = step / 5;
  const startValue = -offset / zoom;
  const endValue = (trackLength - offset) / zoom;
  const firstIndex = Math.floor(startValue / minorStep) - 1;
  const lastIndex = Math.ceil(endValue / minorStep) + 1;
  const ticks: Tick[] = [];
  for (let i = firstIndex; i <= lastIndex; i++) {
    const value = i * minorStep;
    const pos = value * zoom + offset;
    if (pos < -4 || pos > trackLength + 4) continue;
    const major = i % 5 === 0;
    ticks.push({ pos, major, label: major ? String(Math.round(value)) : '' });
  }
  return ticks;
}

function TopRuler({ offset, zoom, trackWidth }: { offset: number; zoom: number; trackWidth: number }) {
  const ticks = buildTicks(offset, zoom, trackWidth);
  return (
    // `fixed`, not `absolute` — same reasoning as LeftRuler below: scoping this to the canvas
    // container (which starts to the right of the sidebar) left a gap with no ruler bar at all
    // above the sidebar itself, just the dot-grid showing through. `fixed` hugs the true browser
    // edge instead, so the bar reads as one continuous strip across the whole top of the app.
    <div
      className="pointer-events-none fixed top-0 z-20 overflow-hidden"
      style={{ left: RULER_SIZE, right: 0, height: RULER_SIZE, background: RULER_BG, boxShadow: RULER_SHADOW, backdropFilter: 'blur(16px)' }}
    >
      {ticks.map((tick, i) => (
        <div key={i}>
          <div
            className="absolute bottom-[1px]"
            style={{ left: tick.pos, width: 1, height: tick.major ? 8 : 4, background: tick.major ? TICK_MAJOR_COLOR : TICK_MINOR_COLOR }}
          />
          {tick.major && (
            <span className="absolute top-0.5 text-[10px] tracking-[-0.01em] whitespace-nowrap" style={{ left: tick.pos + 3, color: LABEL_COLOR }}>
              {tick.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function LeftRuler({ offset, zoom, trackHeight }: { offset: number; zoom: number; trackHeight: number }) {
  const ticks = buildTicks(offset, zoom, trackHeight);
  return (
    // `fixed`, not `absolute` — this bar hugs the true browser edge regardless of where the canvas
    // viewport itself sits (the sidebar shifts right to make room for it; see Shell.tsx), unlike
    // TopRuler, which stays scoped to the canvas viewport it measures.
    <div
      className="pointer-events-none fixed left-0 z-20 overflow-hidden"
      style={{ top: RULER_SIZE, bottom: 0, width: RULER_SIZE, background: RULER_BG, boxShadow: RULER_SHADOW, backdropFilter: 'blur(16px)' }}
    >
      {ticks.map((tick, i) => (
        <div key={i}>
          <div
            className="absolute right-[1px]"
            style={{ top: tick.pos, height: 1, width: tick.major ? 8 : 4, background: tick.major ? TICK_MAJOR_COLOR : TICK_MINOR_COLOR }}
          />
          {tick.major && (
            // Rotated -90deg around its own top-left corner: the label's un-rotated *width* (the
            // number's own text length) swings to point up the ruler, and its *height* (~11px)
            // swings to point right, into the 24px track — rotating the other way sends the
            // height leg left instead, off the track's left edge and clipped invisible.
            <span
              className="absolute text-[10px] tracking-[-0.01em] whitespace-nowrap"
              style={{ left: 3, top: tick.pos, color: LABEL_COLOR, transformOrigin: 'left top', transform: 'rotate(-90deg)' }}
            >
              {tick.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function RulerOverlay({
  camera,
  viewport,
  canvasOffsetX,
}: {
  camera: { x: number; y: number; zoom: number };
  viewport: { width: number; height: number };
  /** The canvas container's own left edge, in true (full-window) screen px — however wide the
   * sidebar currently is. `LeftRuler` doesn't need this (it's pinned to the true left edge
   * regardless), but `TopRuler` does: it's also now `fixed` to the true viewport, so its own tick
   * math needs to travel from "camera-relative, inside the canvas container" out to "true
   * viewport" coordinates the same way the dot-grid backdrop's own phase-matching already does. */
  canvasOffsetX: number;
}) {
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  return (
    <>
      <TopRuler offset={camera.x + canvasOffsetX - RULER_SIZE} zoom={camera.zoom} trackWidth={canvasOffsetX + viewport.width - RULER_SIZE} />
      <LeftRuler offset={camera.y - RULER_SIZE} zoom={camera.zoom} trackHeight={viewport.height - RULER_SIZE} />
      {/* Corner square at the true top-left of the app, where the (fixed) left ruler starts —
          matches the header's own push-down-and-right so nothing overlaps it. */}
      <div className="pointer-events-none fixed top-0 left-0 z-20" style={{ width: RULER_SIZE, height: RULER_SIZE, background: '#19191D' }} />
    </>
  );
}
