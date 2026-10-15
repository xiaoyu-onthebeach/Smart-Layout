import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { JOINT_HOVER_ICON, JOINT_ICON, NEUTRAL_OUTLINE_COLOR, OUTLINE_STROKE } from '@/lib/vector-path';
import type { ResizeHandle } from './useElementDrag';

const CARDINAL: { handle: Extract<ResizeHandle, 'n' | 'e' | 's' | 'w'>; x: number; y: number; cursor: string }[] = [
  { handle: 'n', x: 50, y: 0, cursor: 'ns-resize' },
  { handle: 'e', x: 100, y: 50, cursor: 'ew-resize' },
  { handle: 's', x: 50, y: 100, cursor: 'ns-resize' },
  { handle: 'w', x: 0, y: 50, cursor: 'ew-resize' },
];

/**
 * An ellipse's own "Editing" state — explicitly NOT the generic vector-path editing every other
 * shape gets: converting to flat joints would turn a circle into a diamond, which keeping the
 * circle's own look exactly as-is (an explicit fix request) rules out. Instead this shows the same
 * default/hover joint art at the 4 cardinal points, each one just a relabeled version of the
 * existing single-axis resize handle underneath (`onResizeStart('n'|'e'|'s'|'w', ...)` — the exact
 * same drag `useElementDrag` already does for the normal Focused state's own handles) — the ellipse
 * itself never leaves `kind: 'shape'` or gets any `path` of its own.
 */
export function EllipseEditOverlay({ onResizeStart }: { onResizeStart: (handle: Extract<ResizeHandle, 'n' | 'e' | 's' | 'w'>, e: ReactMouseEvent) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-none absolute inset-0 rounded-full" style={{ outline: `${OUTLINE_STROKE}px solid ${NEUTRAL_OUTLINE_COLOR}`, outlineOffset: -OUTLINE_STROKE }} />
      {CARDINAL.map(({ handle, x, y, cursor }) => {
        const icon = hovered === handle ? JOINT_HOVER_ICON : JOINT_ICON;
        return (
          <img
            key={handle}
            src={icon.src}
            alt=""
            draggable={false}
            onMouseEnter={() => setHovered(handle)}
            onMouseLeave={() => setHovered((cur) => (cur === handle ? null : cur))}
            onMouseDown={(e) => onResizeStart(handle, e)}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: icon.w,
              height: icon.h,
              transform: `translate(${-icon.center.x}px, ${-icon.center.y}px)`,
              cursor,
              pointerEvents: 'auto',
            }}
          />
        );
      })}
    </div>
  );
}
