import type { CSSProperties } from 'react';

// The canvas's dotted background, used by both views: Edit paints it behind the whole screen
// (Shell's CanvasDotBackdrop), Bulk edit inside its canvas window (MultiPageCanvas). Every value
// here is at 100% zoom — spacing and dot size both scale with the zoom, so the grid looks the same
// at any zoom level, just bigger or smaller.

/** Distance between two dots, in px at 100% zoom. */
export const DOT_SPACING = 50;
/** Dot radius, in px at 100% zoom. */
export const DOT_RADIUS = 2;
/** Dot color — the last value is the opacity (0 = invisible, 1 = solid white). */
export const DOT_COLOR = 'rgba(255, 255, 255, 0.12)';
/** Below this zoom the dots are hidden — they'd be too small and dense to read as a grid. */
export const DOT_MIN_ZOOM = 0.3;

/** CSS for the dot grid under a canvas camera; `offsetX` shifts it when it's painted on a larger
 * element than the canvas itself (Edit's screen-wide backdrop, which also runs behind the sidebar). */
export function dotGridStyle(camera: { x: number; y: number; zoom: number }, offsetX = 0): CSSProperties {
  if (camera.zoom < DOT_MIN_ZOOM) return { backgroundImage: 'none' };
  const spacing = DOT_SPACING * camera.zoom;
  const radius = DOT_RADIUS * camera.zoom;
  return {
    backgroundImage: `radial-gradient(${DOT_COLOR} ${radius}px, transparent ${radius}px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${camera.x + offsetX}px ${camera.y}px`,
  };
}
