import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { boxShadowCss, textShadowCss } from '@/lib/shadow';
import { isGradient } from '@/lib/gradient';
import { autoLayoutPaddingCss } from '@/lib/text-auto-layout';
import type { LayoutElement } from '@/types';

/**
 * Splits `content` into the plain-text runs implied by `letterSpacingRange`/`stretchRange` (see
 * their doc comments in `types/index.ts`) — each run's own effective spacing/stretch, falling back
 * to the element's flat `style.letterSpacing`/`style.stretch` outside either range. A run only ever
 * gets a range's override when it sits fully inside that range, so a range can't leak onto text it
 * wasn't drawn around even if the two ranges partially overlap. Single-run (the common case, no
 * override set) collapses to one segment spanning the whole string.
 */
function textRunSegments(content: string, style: LayoutElement['style']) {
  const { letterSpacingRange, stretchRange } = style;
  if (!letterSpacingRange && !stretchRange) return [{ text: content, letterSpacing: style.letterSpacing, stretch: style.stretch }];
  const clamp = (n: number) => Math.max(0, Math.min(content.length, n));
  const breakpoints = new Set([0, content.length]);
  if (letterSpacingRange) {
    breakpoints.add(clamp(letterSpacingRange.start));
    breakpoints.add(clamp(letterSpacingRange.end));
  }
  if (stretchRange) {
    breakpoints.add(clamp(stretchRange.start));
    breakpoints.add(clamp(stretchRange.end));
  }
  const points = [...breakpoints].sort((a, b) => a - b);
  const segments: { text: string; letterSpacing: number | undefined; stretch: number | undefined }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start === end) continue;
    const inRange = (r?: { start: number; end: number }) => !!r && start >= r.start && end <= r.end;
    segments.push({
      text: content.slice(start, end),
      letterSpacing: inRange(letterSpacingRange) ? letterSpacingRange!.value : style.letterSpacing,
      stretch: inRange(stretchRange) ? stretchRange!.value : style.stretch,
    });
  }
  return segments;
}

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
  // Only template slot text gets the pill's built-in side padding — a layer added on the canvas
  // hugs its own glyphs there (see EditableTextElement), so padding it here too would squeeze it
  // into an ellipsis; its own breathing room comes from Auto Layout padding instead.
  const isPill = Boolean(style.fill) && element.slot !== null;
  // Gradient text is a CSS `background-clip: text` trick — it needs the gradient painted as this
  // box's own background-image, clipped to the glyphs, with the text's actual `color` made
  // transparent so the clipped gradient shows through instead. That background-image slot is the
  // same one the "pill" background (`style.fill`) would otherwise use, so the two can't combine —
  // an acceptable trade-off since a gradient-filled pill behind gradient text isn't a real use case.
  const gradientText = isGradient(style.color);
  const segments = textRunSegments(element.content ?? '', style);
  // Auto Layout swaps the centred single-line flex box for plain block flow, so the text sits at
  // the top-left of its padding (matching the live canvas element) and can wrap at a fixed width.
  const autoLayout = style.autoLayout;
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(selected && 'outline outline-[1.5px] outline-button-primary')}
      style={{
        ...pos,
        display: autoLayout ? 'block' : 'flex',
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
        textDecoration: style.textDecoration && style.textDecoration !== 'none' ? style.textDecoration : undefined,
        fontStyle: style.fontStyle,
        textTransform: style.textTransform && style.textTransform !== 'none' ? style.textTransform : undefined,
        WebkitTextStroke: style.strokeWidth ? `${style.strokeWidth}px ${style.strokeColor ?? '#000000'}` : undefined,
        textShadow: textShadowCss(style.dropShadow),
        ...(autoLayout
          ? {
              padding: autoLayoutPaddingCss(autoLayout, layoutWidth),
              boxSizing: 'border-box',
              whiteSpace: autoLayout.hugWidth ? 'pre' : 'pre-wrap',
            }
          : {
              paddingInline: isPill ? '0.6em' : undefined,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }),
      }}
    >
      {segments.map((seg, i) => (
        <span
          key={i}
          style={{
            // `vertical-align` has no effect here — this span is the flex container's own (sole)
            // flex item, and vertical-align only ever applies to inline-level/table-cell boxes — so
            // super/subscript is faked with a baseline-style shift + a proportionally smaller size
            // instead, the same trick line-height-relative CSS superscripts have always used. Both
            // are element-wide (not something a run's own letterSpacing/stretch range can vary).
            display: style.verticalAlign && style.verticalAlign !== 'baseline' ? 'inline-block' : undefined,
            fontSize: style.verticalAlign && style.verticalAlign !== 'baseline' ? '0.7em' : undefined,
            letterSpacing: seg.letterSpacing ? `${seg.letterSpacing}px` : undefined,
            transform:
              style.verticalAlign === 'super'
                ? 'translateY(-0.3em)'
                : style.verticalAlign === 'sub'
                  ? 'translateY(0.3em)'
                  : seg.stretch
                    ? `scaleX(${1 + seg.stretch / 100})`
                    : undefined,
            transformOrigin: style.align === 'center' ? 'center' : style.align === 'right' ? 'right' : 'left',
          }}
        >
          {seg.text}
        </span>
      ))}
    </div>
  );
}
