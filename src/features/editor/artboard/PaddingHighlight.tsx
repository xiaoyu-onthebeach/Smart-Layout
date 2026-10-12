import { useEffect, useRef, useState } from 'react';
import type { TextAutoLayout } from '@/types';

/** The "sunburn" token (see index.css) at 30%. */
const PADDING_TINT = 'color-mix(in srgb, var(--sunburn) 30%, transparent)';

// Last known pointer position, kept from page load on — so a box that becomes selected while the
// pointer is already resting on it (the click that selected it) lights up straight away, rather
// than waiting for the next pointer move to find out where the pointer is.
let lastPointer: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), { passive: true });
}

/**
 * Whether the pointer is over `anchor`'s on-screen box. Hit-tested against the box's rect on every
 * pointer move rather than relying on enter/leave events, since a group's outline can't take
 * pointer events (it would swallow clicks meant for its members) and its padding/gaps aren't
 * covered by any member either.
 */
function usePointerInside(anchor: React.RefObject<HTMLElement | null>): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    function check(point: { x: number; y: number } | null) {
      const rect = anchor.current?.getBoundingClientRect();
      setInside(Boolean(rect && point && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom));
    }
    check(lastPointer);
    const onMove = (e: PointerEvent) => check({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [anchor]);
  return inside;
}

/**
 * Tints a selected box's Auto Layout spacing, Figma-style — four strips along its inside edges for
 * the padding, plus (for a layout group) one per gap between its members, given relative to the
 * box's own top-left. Only mounted while the box is selected, and only lights up while the pointer
 * is over it, so the tint doesn't sit over the design the rest of the time.
 * Rendered as a child of the box itself (so it follows any rotation), sized in the artboard's own
 * `cqw` units, the same scale padding is applied in.
 */
export function PaddingHighlight({
  padding,
  gaps = [],
  layoutWidth,
}: {
  padding: TextAutoLayout['padding'];
  gaps?: { x: number; y: number; w: number; h: number }[];
  layoutWidth: number;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hovered = usePointerInside(anchorRef);
  const { top, right, bottom, left } = padding;
  if (!top && !right && !bottom && !left && gaps.length === 0) return null;
  const u = (v: number) => `${(v / layoutWidth) * 100}cqw`;
  const strip = { position: 'absolute', background: PADDING_TINT, pointerEvents: 'none' } as const;
  return (
    <>
      {/* Invisible stand-in for the box itself, just for hover hit-testing. */}
      <span ref={anchorRef} aria-hidden className="pointer-events-none absolute inset-0" />
      {hovered && (
        <>
          {top > 0 && <div data-padding-highlight style={{ ...strip, left: 0, right: 0, top: 0, height: u(top) }} />}
          {bottom > 0 && <div data-padding-highlight style={{ ...strip, left: 0, right: 0, bottom: 0, height: u(bottom) }} />}
          {/* Side strips stop short of the top/bottom ones, so the corners aren't tinted twice as dark. */}
          {left > 0 && <div data-padding-highlight style={{ ...strip, left: 0, top: u(top), bottom: u(bottom), width: u(left) }} />}
          {right > 0 && <div data-padding-highlight style={{ ...strip, right: 0, top: u(top), bottom: u(bottom), width: u(right) }} />}
          {gaps.map((g, i) => (
            <div key={i} data-padding-highlight style={{ ...strip, left: u(g.x), top: u(g.y), width: u(g.w), height: u(g.h) }} />
          ))}
        </>
      )}
    </>
  );
}
