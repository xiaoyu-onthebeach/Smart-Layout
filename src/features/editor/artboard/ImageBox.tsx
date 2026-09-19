import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { boxShadowCss } from '@/lib/shadow';
import type { LayoutElement } from '@/types';

// The moved-image frame-gap grid's own cyan line pattern, blended so it reads against any image
// behind it rather than a flat fill. Each line fades to 50% opacity at its own two ends (not just
// the grid's outer edge) — done via a mask gradient running *across* the lines (vertical mask for
// the vertical-line layer, horizontal mask for the horizontal one) rather than baked into the line
// color, since a repeating-linear-gradient stripe pattern is otherwise a single flat color along
// its own length.
const GRID_FADE_STOPS = 'rgba(0,0,0,0.5) 0%, #000 20%, #000 80%, rgba(0,0,0,0.5) 100%';
const GRID_LINE_COLOR = '#74cee551';

function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ mixBlendMode: 'plus-lighter', opacity: 0.8 }}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, ${GRID_LINE_COLOR} 0, ${GRID_LINE_COLOR} 1px, transparent 1px, transparent 24px)`,
          maskImage: `linear-gradient(to bottom, ${GRID_FADE_STOPS})`,
          WebkitMaskImage: `linear-gradient(to bottom, ${GRID_FADE_STOPS})`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, ${GRID_LINE_COLOR} 0, ${GRID_LINE_COLOR} 1px, transparent 1px, transparent 24px)`,
          maskImage: `linear-gradient(to right, ${GRID_FADE_STOPS})`,
          WebkitMaskImage: `linear-gradient(to right, ${GRID_FADE_STOPS})`,
        }}
      />
    </div>
  );
}

/**
 * An image element's visual box — shared by the active (editable) and inactive (view-all preview)
 * render paths. Normally the image just covers its own `frame`. While an expand-to-frame commit is
 * animating (see `onExpandToFrameClick`), `pendingExpand` briefly holds the target box so the
 * shimmer overlay can size itself to it ahead of the real `frame` update landing.
 */
export function ImageBox({
  element,
  layoutWidth,
  layoutHeight,
  outlined,
  selected,
  cursor,
  scale,
  expanding,
  onExpandToFrameClick,
  isBackgroundImage,
  suppressFrameGapAffordance,
  sceneHasBackgroundColor,
  onMouseDown,
  onContextMenu,
  onDoubleClick,
  children,
}: {
  element: LayoutElement;
  layoutWidth: number;
  layoutHeight: number;
  outlined?: boolean;
  /** Whether this layer is currently selected — distinct from `outlined` (which only applies to the
   * inactive/preview render path's own plain-outline indicator): this gates the frame-gap grid/
   * button below, which should only ever show while the background image is the one selected. */
  selected?: boolean;
  cursor?: CSSProperties['cursor'];
  /** Rendered px per native layout px (camera/fit-to-screen zoom) — below 30% the expand icons hide, since they'd be too small to read or reliably click. */
  scale?: number;
  expanding?: boolean;
  /** Fills the moved-image gap left against the frame's own corner. */
  onExpandToFrameClick?: (e: ReactMouseEvent) => void;
  /** Whether this is "the" background image — the real hero slot if it's filled, otherwise whichever decorative image is standing in for it (same rule ArtboardFrame uses to decide what stays visible during focus-picking). Gates the automatic frame-gap grid/button below, so a small logo or badge dragged off-canvas doesn't grow the same affordance around itself. */
  isBackgroundImage?: boolean;
  /** True during an active move/resize drag and for a short settle delay after — hides the frame-gap grid/button so they don't flicker in mid-drag. */
  suppressFrameGapAffordance?: boolean;
  /** True once the scene has its own background color fill — the margin around the frame reads as
   * filled space at that point, not empty canvas, so the frame-gap grid/button (which exist to flag
   * genuinely empty space left over) no longer apply there. */
  sceneHasBackgroundColor?: boolean;
  onMouseDown?: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onDoubleClick?: (e: ReactMouseEvent) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const { frame, pendingExpand, imageUrl, focalPoint, flipX, flipY } = element;
  const box = pendingExpand ?? frame;
  const flipTransform = [flipX && 'scaleX(-1)', flipY && 'scaleY(-1)'].filter(Boolean).join(' ') || undefined;
  // A committed `frame` can end up bigger than the native layout (e.g. the auto-zoomed fill
  // applied to freshly generated sizes, or the expand-to-frame animation briefly growing `box` past
  // it via `pendingExpand`), and a selected element's resize handles need the same unclipped
  // treatment there too.
  const boxOverflowsFrame = box.x < 0 || box.y < 0 || box.x + box.w > layoutWidth || box.y + box.h > layoutHeight;

  // The background image's own frame can leave an empty margin against the canvas (dragged off to
  // one side, or simply smaller than the scene). Scoped to the hero slot only, so a small
  // decorative overlay doesn't grow this same grid+button around itself; and never during the
  // expand animation, since that's already covering (and about to commit) this same area.
  const gapRight = frame.x + frame.w < layoutWidth - 0.5;
  const gapLeft = frame.x > 0.5;
  const gapBottom = frame.y + frame.h < layoutHeight - 0.5;
  const gapTop = frame.y > 0.5;
  const hasFrameGap =
    isBackgroundImage &&
    selected &&
    element.hasCoveredFrame &&
    !suppressFrameGapAffordance &&
    !sceneHasBackgroundColor &&
    !expanding &&
    (gapRight || gapLeft || gapBottom || gapTop);
  const frameGapHorizontalSide: 'left' | 'right' = gapRight ? 'right' : 'left';
  const frameGapVerticalSide: 'top' | 'bottom' = gapBottom ? 'bottom' : 'top';
  // Too small to read or reliably click once zoomed out past this — hides just the icon, not the
  // grid underneath it.
  const showExpandIcons = scale === undefined || scale >= 0.3;

  // The resize handles (in `children`) are normally positioned via `absolute inset-0` against the
  // box div below — fine while the box stays within the frame, but the frame's own overflow-hidden
  // stops rendering (and hit-testing) anything past its edge, so a handle that ends up outside the
  // frame becomes both invisible and unclickable there. `position: fixed` is the escape hatch:
  // whenever the box exceeds the frame, mirror its real on-screen rect into a fixed, unclipped
  // wrapper for the handles instead.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxRect, setBoxRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // No dependency array — the box's on-screen rect can shift for reasons that don't cleanly reduce
  // to a short dependency list (camera pan/zoom in the view-all canvas, the frame's own container
  // resizing, etc.), so this just re-measures after every render instead of trying to enumerate
  // every case that should trigger it. The measurement itself is cheap.
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
      {hasFrameGap && (
        // Spans the whole scene frame, sitting *behind* the box below in paint order — the image's
        // own opaque pixels cover their own area on top of this, leaving the grid visible only in
        // the uncovered margin, whatever shape that margin happens to be.
        <div className="pointer-events-none absolute inset-0">
          <GridLines />
        </div>
      )}
      <div
        ref={boxRef}
        data-resize-box
        className={cn('absolute', outlined && 'outline outline-2 -outline-offset-2 outline-button-primary')}
        style={{
          left: `${(box.x / layoutWidth) * 100}%`,
          top: `${(box.y / layoutHeight) * 100}%`,
          width: `${(box.w / layoutWidth) * 100}%`,
          height: `${(box.h / layoutHeight) * 100}%`,
          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
          cursor,
        }}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
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
            boxShadow: boxShadowCss(element.style.dropShadow, element.style.innerShadow),
            boxSizing: 'border-box',
          }}
        />
        {expanding && (
          <>
            <div className="shimmer-surface absolute inset-0" />
            {/* Positioned at the *scene frame's* own center, not this box's — `box` can be an
                off-center pendingExpand rect (e.g. grown only rightward), which would otherwise
                pull the caption away from the middle of the banner while it "generates". */}
            <p
              className="absolute text-sm font-medium text-white"
              style={{
                left: `${((layoutWidth / 2 - box.x) / box.w) * 100}%`,
                top: `${((layoutHeight / 2 - box.y) / box.h) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {t('Expanding image…')}
            </p>
          </>
        )}
        {!boxOverflowsFrame && children}
      </div>
      {/* A later sibling than the box above (not nested inside the grid's own wrapper) so it paints
          on top of the image whenever the gap is tight enough for the two to overlap — the grid
          itself stays behind (it's meant to disappear under the image's own opaque area), but the
          button should always stay clickable and visible. */}
      {hasFrameGap && onExpandToFrameClick && showExpandIcons && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('Expand image')}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onExpandToFrameClick}
              className="absolute size-10 transition-[filter] hover:brightness-90"
              style={{ [frameGapHorizontalSide]: 12, [frameGapVerticalSide]: 12 }}
            >
              <img src="/icons/expand_blue.svg" alt="" className="size-full" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('Expand image')}</TooltipContent>
        </Tooltip>
      )}
      {/* Only when there's actually something to show — otherwise this wrapper would sit on top of
          the image (fixed-position content stacks above plain absolute content) and silently
          swallow clicks meant for it, even while nothing is selected yet. `pointer-events: none`
          on the wrapper itself (with the handles individually opting back in) means that even once
          something IS selected, a click on the rest of this area still falls through to the image
          underneath — e.g. to drag it by its body, not just resize it via a handle. */}
      {boxOverflowsFrame && boxRect && children && (
        <div
          data-resize-box
          className="pointer-events-none fixed z-40"
          style={{ left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined }}
        >
          {children}
        </div>
      )}
    </>
  );
}
