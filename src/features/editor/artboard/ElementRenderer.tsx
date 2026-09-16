import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { boxShadowCss, textShadowCss } from '@/lib/shadow';
import { isGradient } from '@/lib/gradient';
import type { LayoutElement } from '@/types';

/**
 * Renders one LayoutElement as an absolutely-positioned box using percentage
 * geometry against `layoutWidth`/`layoutHeight`. Text sizes use `cqw` units so
 * they scale with the nearest `container-type: inline-size` ancestor — no JS
 * measurement needed. Used by thumbnails (non-interactive) and the real
 * artboard (interactive, selection handled by the caller).
 */
export function ElementRenderer({
  element,
  layoutWidth,
  layoutHeight,
  interactive = false,
  onReplaceImage,
  onMouseDown,
  selected = false,
}: {
  element: LayoutElement;
  layoutWidth: number;
  layoutHeight: number;
  interactive?: boolean;
  onReplaceImage?: () => void;
  /** Lets a non-interactive (inactive-frame) instance still be shift-clicked into a cross-scene multi-select. */
  onMouseDown?: (e: ReactMouseEvent) => void;
  selected?: boolean;
}) {
  const { frame, style } = element;
  const pos: CSSProperties = {
    position: 'absolute',
    left: `${(frame.x / layoutWidth) * 100}%`,
    top: `${(frame.y / layoutHeight) * 100}%`,
    width: `${(frame.w / layoutWidth) * 100}%`,
    height: `${(frame.h / layoutHeight) * 100}%`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
  };

  if (element.kind === 'image') {
    return (
      <div
        onMouseDown={onMouseDown}
        // `fill` shows through wherever the image itself doesn't cover — a transparent PNG's cutouts,
        // or the frame's own edges once a border radius clips the (always cover-sized) image beneath it.
        style={{ ...pos, background: style.fill, boxShadow: boxShadowCss(style.dropShadow, style.innerShadow) }}
        className={cn('group/img overflow-hidden', interactive && 'ring-0', selected && 'outline outline-[1.5px] outline-button-primary')}
      >
        {element.imageUrl ? (
          <div
            className="size-full"
            style={{
              backgroundImage: `url(${element.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: `${(element.focalPoint?.x ?? 0.5) * 100}% ${(element.focalPoint?.y ?? 0.5) * 100}%`,
              transform: [element.flipX && 'scaleX(-1)', element.flipY && 'scaleY(-1)'].filter(Boolean).join(' ') || undefined,
              opacity: style.opacity !== undefined ? style.opacity / 100 : undefined,
              borderRadius: style.radius ? `${style.radius}px` : undefined,
              overflow: style.radius ? 'hidden' : undefined,
              border: style.strokeWidth ? `${style.strokeWidth}px ${style.strokeStyle ?? 'solid'} ${style.strokeColor ?? '#000000'}` : undefined,
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 border border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground">
            <ImageIcon style={{ width: '10cqw', height: '10cqw' }} />
            <span style={{ fontSize: '4cqw' }}>Add image</span>
          </div>
        )}
        {interactive && (
          <button
            type="button"
            onClick={onReplaceImage}
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover/img:opacity-100"
            style={{ fontSize: '4cqw' }}
          >
            Replace image
          </button>
        )}
      </div>
    );
  }

  if (element.kind === 'shape') {
    const isLine = element.shape === 'line';
    return (
      <div
        onMouseDown={onMouseDown}
        className={cn(selected && 'outline outline-[1.5px] outline-button-primary')}
        style={{
          ...pos,
          background: isLine ? undefined : (style.fill ?? '#d4d4d8'),
          borderRadius: element.shape === 'ellipse' ? '9999px' : style.radius ? `${style.radius}px` : undefined,
          border: style.strokeWidth ? `${style.strokeWidth}px ${style.strokeStyle ?? 'solid'} ${style.strokeColor ?? '#000000'}` : undefined,
          opacity: style.opacity !== undefined ? style.opacity / 100 : undefined,
          boxShadow: boxShadowCss(style.dropShadow, style.innerShadow),
          boxSizing: 'border-box',
        }}
      >
        {isLine && <div className="h-full w-full" style={{ background: style.fill ?? '#d4d4d8' }} />}
      </div>
    );
  }

  // text
  const isPill = Boolean(style.fill);
  // Gradient text is a CSS `background-clip: text` trick — it needs the gradient painted as this
  // box's own background-image, clipped to the glyphs, with the text's actual `color` made
  // transparent so the clipped gradient shows through instead. That background-image slot is the
  // same one the "pill" background (`style.fill`) would otherwise use, so the two can't combine —
  // an acceptable trade-off since a gradient-filled pill behind gradient text isn't a real use case.
  const gradientText = isGradient(style.color);
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(selected && 'outline outline-[1.5px] outline-button-primary')}
      style={{
        ...pos,
        display: 'flex',
        alignItems: 'center',
        // Vertical writing mode stacks the (single line of) content into one column — "start/end"
        // alignment stops meaning "left/right" once the text's own axis rotates, so just center
        // it both ways rather than trying to remap style.align onto the rotated axis.
        justifyContent: style.writingMode === 'vertical-rl' ? 'center' : style.align === 'center' ? 'center' : style.align === 'right' ? 'flex-end' : 'flex-start',
        writingMode: style.writingMode,
        backgroundColor: gradientText ? undefined : style.fill,
        backgroundImage: gradientText ? style.color : undefined,
        backgroundClip: gradientText ? 'text' : undefined,
        WebkitBackgroundClip: gradientText ? 'text' : undefined,
        borderRadius: style.radius ? `${style.radius}px` : undefined,
        color: gradientText ? 'transparent' : (style.color ?? '#18181b'),
        fontWeight: style.fontWeight ?? 400,
        fontFamily: style.fontFamily,
        fontSize: `${((style.fontSize ?? 16) / layoutWidth) * 100}cqw`,
        textAlign: (style.align as CSSProperties['textAlign']) ?? 'left',
        lineHeight: style.lineHeight ?? 1.2,
        letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
        textDecoration: style.textDecoration && style.textDecoration !== 'none' ? style.textDecoration : undefined,
        WebkitTextStroke: style.strokeWidth ? `${style.strokeWidth}px ${style.strokeColor ?? '#000000'}` : undefined,
        textShadow: textShadowCss(style.dropShadow),
        paddingInline: isPill ? '0.6em' : undefined,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span
        style={{
          transform: style.stretch ? `scaleX(${1 + style.stretch / 100})` : undefined,
          transformOrigin: style.align === 'center' ? 'center' : style.align === 'right' ? 'right' : 'left',
        }}
      >
        {element.content}
      </span>
    </div>
  );
}
