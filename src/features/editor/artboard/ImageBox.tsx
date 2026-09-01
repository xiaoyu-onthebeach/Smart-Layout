import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { LayoutElement } from '@/types';
import type { ResizeHandle } from './useElementDrag';

/**
 * An image element's visual box — shared by the active (editable) and inactive (view-all preview)
 * render paths. Normally the image just covers its own `frame`. When `pendingExpand` is set (a
 * Cmd-dragged, not-yet-committed enlargement), the box grows to that size while the image itself
 * stays fixed at `frame`, leaving a transparent gap with an expand affordance in the new area.
 */
export function ImageBox({
  element,
  layoutWidth,
  layoutHeight,
  outlined,
  cursor,
  expanding,
  isDraggingExpand,
  expandHandle,
  onExpandClick,
  onMouseDown,
  onContextMenu,
  children,
}: {
  element: LayoutElement;
  layoutWidth: number;
  layoutHeight: number;
  outlined?: boolean;
  cursor?: CSSProperties['cursor'];
  expanding?: boolean;
  /** True while a Cmd-drag is actively resizing the pending-expand box — hides the finish-the-drag affordances until it settles. */
  isDraggingExpand?: boolean;
  /** Which handle grew the box last — the expand button/prompt sit near that corner instead of always the bottom-right. */
  expandHandle?: ResizeHandle | null;
  onExpandClick?: (e: ReactMouseEvent) => void;
  onMouseDown?: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const { frame, pendingExpand, imageUrl, focalPoint, flipX, flipY } = element;
  const box = pendingExpand ?? frame;
  const hasGap = Boolean(pendingExpand);
  const flipTransform = [flipX && 'scaleX(-1)', flipY && 'scaleY(-1)'].filter(Boolean).join(' ') || undefined;
  const showExpandAffordance = hasGap && !expanding && !isDraggingExpand;
  // Which corner the expand button/prompt sit near — defaults to bottom-right (matching the
  // original fixed behavior) unless the last drag grew the box leftward/upward, in which case
  // they follow that edge instead so they land next to the "new" area, not the opposite corner.
  const horizontalSide: 'left' | 'right' = expandHandle?.includes('w') ? 'left' : 'right';
  const verticalSide: 'top' | 'bottom' = expandHandle?.includes('n') ? 'top' : 'bottom';
  // Anchor position on whichever side was picked, as a % of the box's own size (0% = the box's
  // own edge on that side). Clamped to the frame's matching edge once the box is dragged past it,
  // so the button/prompt stay reachable no matter how far past that the box extends.
  const rightAnchorPct = Math.max(0, ((box.x + box.w - layoutWidth) / box.w) * 100);
  const leftAnchorPct = Math.max(0, (-box.x / box.w) * 100);
  const bottomAnchorPct = Math.max(0, ((box.y + box.h - layoutHeight) / box.h) * 100);
  const topAnchorPct = Math.max(0, (-box.y / box.h) * 100);
  const horizontalAnchorPct = horizontalSide === 'left' ? leftAnchorPct : rightAnchorPct;
  const verticalAnchorPct = verticalSide === 'top' ? topAnchorPct : bottomAnchorPct;
  // Not just the Cmd-drag gap case — a committed `frame` can also end up bigger than the native
  // layout (e.g. the auto-zoomed fill applied to freshly generated sizes), and a selected element's
  // resize handles need the same unclipped treatment there too.
  const boxOverflowsFrame = box.x < 0 || box.y < 0 || box.x + box.w > layoutWidth || box.y + box.h > layoutHeight;

  // The prompt entry sits below the expand button, which itself can end up anywhere on screen —
  // including well outside the frame once the box overflows it. Since the frame clips anything
  // positioned (even just geometrically) beyond its own bounds via `overflow-hidden`, an
  // absolutely-positioned child can never escape that no matter its z-index — only `position:
  // fixed` does, which needs real viewport pixels instead of the box-relative percentages used
  // everywhere else here. The expand button is always kept on-screen already (its own position is
  // clamped to the frame), so its rendered rect is a reliable anchor to measure from.
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const [promptPos, setPromptPos] = useState<{ left: number; top: number } | null>(null);

  // No dependency array — the button's on-screen rect can shift for reasons that don't cleanly
  // reduce to a short dependency list (camera pan/zoom in the view-all canvas, the frame's own
  // container resizing, etc.), so this just re-measures after every render instead of trying to
  // enumerate every case that should trigger it. The measurement itself is cheap.
  useLayoutEffect(() => {
    if (!showExpandAffordance) {
      setPromptPos(null);
      return;
    }
    function update() {
      const rect = expandButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Right-aligned with the button when it's on the right (its right edge is the reference
      // point), left-aligned when the button's on the left instead — same idea, mirrored. Always
      // below the button regardless of which side it's on vertically.
      const left = horizontalSide === 'right' ? rect.right - 238 : rect.left;
      const top = rect.bottom + 12;
      setPromptPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });

  // The resize handles (in `children`) are normally positioned via `absolute inset-0` against the
  // box div below — fine while the box stays within the frame, but the frame's own overflow-hidden
  // stops rendering (and hit-testing) anything past its edge, so a handle that ends up outside the
  // frame becomes both invisible and unclickable there. Same `position: fixed` escape hatch as the
  // prompt entry above: whenever the box exceeds the frame, mirror its real on-screen rect into a
  // fixed, unclipped wrapper for the handles instead.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxRect, setBoxRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Same "just re-measure every render" reasoning as the prompt entry's effect above.
  useLayoutEffect(() => {
    if (!boxOverflowsFrame) {
      setBoxRect(null);
      return;
    }
    function update() {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return;
      setBoxRect((prev) =>
        prev && prev.left === rect.left && prev.top === rect.top && prev.width === rect.width && prev.height === rect.height
          ? prev
          : { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      );
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });

  return (
    <>
      <div
        ref={boxRef}
        className={cn('absolute', outlined && 'outline outline-2 -outline-offset-2 outline-button-primary')}
        style={{
          left: `${(box.x / layoutWidth) * 100}%`,
          top: `${(box.y / layoutHeight) * 100}%`,
          width: `${(box.w / layoutWidth) * 100}%`,
          height: `${(box.h / layoutHeight) * 100}%`,
          cursor,
        }}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
      >
        {hasGap && (
          <>
            <div className="absolute inset-0 bg-button-primary/10" />
            {/* Faint cyan grid, fading toward the gap's own edges, to read as "expandable canvas"
                rather than a flat color fill. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, rgba(116,207,229,0.9) 0, rgba(116,207,229,0.9) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(to bottom, rgba(116,207,229,0.9) 0, rgba(116,207,229,0.9) 1px, transparent 1px, transparent 24px)',
                mixBlendMode: 'plus-lighter',
                opacity: 0.4,
                maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 85%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 35%, transparent 85%)',
              }}
            />
          </>
        )}
        <div
          className="absolute"
          style={{
            left: `${((frame.x - box.x) / box.w) * 100}%`,
            top: `${((frame.y - box.y) / box.h) * 100}%`,
            width: `${(frame.w / box.w) * 100}%`,
            height: `${(frame.h / box.h) * 100}%`,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: `${(focalPoint?.x ?? 0.5) * 100}% ${(focalPoint?.y ?? 0.5) * 100}%`,
            transform: flipTransform,
            opacity: element.style.opacity !== undefined ? element.style.opacity / 100 : undefined,
            borderRadius: element.style.radius ? `${element.style.radius}px` : undefined,
            overflow: element.style.radius ? 'hidden' : undefined,
            border: element.style.strokeWidth
              ? `${element.style.strokeWidth}px ${element.style.strokeStyle ?? 'solid'} ${element.style.strokeColor ?? '#000000'}`
              : undefined,
            boxSizing: 'border-box',
          }}
        />
        {expanding && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <LoadingSpinner size={40} />
          </div>
        )}
        {showExpandAffordance && onExpandClick && (
          <button
            ref={expandButtonRef}
            type="button"
            aria-label={t('Expand image')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onExpandClick}
            className="absolute size-9"
            style={{
              // Inset from whichever corner of the box the last expand drag grew toward (normal
              // case: also inset from that corner's own edges). Pinning the position to the box's
              // own corner, unconditionally, puts it off-screen once that side is dragged past the
              // frame, since the frame clips anything past its own bounds — so once it does, clamp
              // the anchor to the frame's matching edge instead, with the same padding, keeping the
              // button reachable no matter how far past that the box extends.
              [horizontalSide]: `calc(${horizontalAnchorPct}% + 8px)`,
              [verticalSide]: `calc(${verticalAnchorPct}% + 8px)`,
            }}
          >
            <img src="/icons/expand_blue.svg" alt="" className="size-full" />
          </button>
        )}
        {showExpandAffordance && promptPos && (
          <div className="fixed z-50" style={{ left: promptPos.left, top: promptPos.top }} onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="text"
              placeholder={t('Describe the expanded area...')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onExpandClick?.(e as unknown as ReactMouseEvent);
              }}
              className="h-9 w-[238px] rounded-lg bg-[#26262C] px-3 text-sm text-white placeholder:text-white/65 outline-none"
              style={{ boxShadow: '0px 1px 2px rgba(0,0,0,0.03), 0px 1px 6px -1px rgba(0,0,0,0.02), 0px 2px 4px rgba(0,0,0,0.02)' }}
            />
          </div>
        )}
        {!boxOverflowsFrame && children}
      </div>
      {/* Only when there's actually something to show — otherwise this wrapper would sit on top of
          the image (fixed-position content stacks above plain absolute content) and silently
          swallow clicks meant for it, even while nothing is selected yet. `pointer-events: none`
          on the wrapper itself (with the handles individually opting back in) means that even once
          something IS selected, a click on the rest of this area still falls through to the image
          underneath — e.g. to drag it by its body, not just resize it via a handle. */}
      {boxOverflowsFrame && boxRect && children && (
        <div className="pointer-events-none fixed z-40" style={{ left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height }}>
          {children}
        </div>
      )}
    </>
  );
}
