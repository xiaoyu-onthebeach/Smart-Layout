import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { textShadowCss } from '@/lib/shadow';
import { isGradient } from '@/lib/gradient';
import { useElementDrag, MIN_SIZE, type ResizeHandle } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';

const MIN_FONT_SIZE = 6;

/**
 * A decorative (slot: null) text element. Single click selects it (bounding box + inspector,
 * draggable/resizable); double click enters contentEditable typing mode, committed when editing ends.
 */
export function EditableTextElement({
  element,
  layoutId,
  layoutWidth,
  layoutHeight,
  scale,
  activeTool,
  selected,
  isEditing,
  onSelect,
  onStartEditing,
  onContextMenu,
  onEnterGroup,
}: {
  element: LayoutElement;
  layoutId: string;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  activeTool: Tool;
  selected: boolean;
  isEditing: boolean;
  onSelect: (e: ReactMouseEvent) => void;
  onStartEditing: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Set only when this element belongs to a group that isn't currently "entered" — double-click
   * enters the group instead of starting text-edit mode. */
  onEnterGroup?: (e: ReactMouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const updateElement = useAppStore((s) => s.updateElement);
  const { startDragOrDeferredSelect, startRotate } = useElementDrag(layoutId, element.id, scale);
  // Drives SelectionBoundingBox's own idle-vs-expanded look — see DraggableImageElement's own copy
  // of this same comment for why it's lifted up here instead of detected inside that overlay itself.
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!isEditing || !ref.current) return;
    const el = ref.current;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing]);

  // Commit on the true→false transition itself, rather than waiting for a native `blur` event —
  // toggling `contentEditable` off while the node still holds focus doesn't reliably fire one
  // (the browser can drop focus as a side effect of the attribute change before React's own
  // synthetic blur listener sees it), which was silently discarding whatever had just been typed.
  useEffect(() => {
    if (isEditing || !ref.current) return;
    const content = ref.current.textContent ?? '';
    if (content !== (element.content ?? '')) {
      updateElement(layoutId, element.id, { content });
    }
    if (ref.current === document.activeElement) ref.current.blur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const { frame, style } = element;

  // The box hugs the rendered text exactly (no left/right padding) — frame.w/h isn't an
  // independent setting for text, it's just a cache of this measurement so every other consumer
  // (thumbnails, export, the group-bounds box) sees the same tight size without re-measuring
  // themselves. Re-measures whenever anything that affects the rendered size changes; frame.w/h
  // itself is deliberately NOT a dependency — it only ever changes as a result of this effect, so
  // depending on it would just be measuring in a circle.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nativeW = rect.width / scale;
    const nativeH = rect.height / scale;
    if (Math.abs(nativeW - frame.w) > 0.5 || Math.abs(nativeH - frame.h) > 0.5) {
      updateElement(layoutId, element.id, { frame: { ...frame, w: nativeW, h: nativeH } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.content, style.fontSize, style.fontFamily, style.fontWeight, style.letterSpacing, style.stretch, style.writingMode, scale, layoutWidth]);

  // Corner/edge drag scales the font size instead of the box — the box has no independent size of
  // its own to resize (see the measurement effect above). Estimates the resulting box size as the
  // same scale factor applied to the current one, purely to offset x/y for a 'w'/'n' handle so the
  // *opposite* corner stays anchored, same convention as every other element's resize; the estimate
  // only has to be close, since the measurement effect corrects w/h for real on the next render.
  function startFontResize(e: ReactMouseEvent, handle: ResizeHandle) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFontSize = style.fontSize ?? 16;
    const startW = frame.w;
    const startH = frame.h;
    const isCorner = handle.length === 2;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const signedDx = handle.includes('w') ? -dx : handle.includes('e') ? dx : 0;
      const signedDy = handle.includes('n') ? -dy : handle.includes('s') ? dy : 0;
      let scaleFactor: number;
      if (isCorner) {
        const scaleW = (startW + signedDx) / startW;
        const scaleH = (startH + signedDy) / startH;
        scaleFactor = Math.abs(scaleW - 1) > Math.abs(scaleH - 1) ? scaleW : scaleH;
      } else if (handle === 'e' || handle === 'w') {
        scaleFactor = (startW + signedDx) / startW;
      } else {
        scaleFactor = (startH + signedDy) / startH;
      }
      scaleFactor = Math.max(scaleFactor, MIN_FONT_SIZE / startFontSize, MIN_SIZE / startW, MIN_SIZE / startH);
      const newFontSize = Math.round(startFontSize * scaleFactor);

      const estW = startW * scaleFactor;
      const estH = startH * scaleFactor;
      let x = frame.x;
      let y = frame.y;
      if (handle.includes('w')) x = frame.x + (startW - estW);
      if (handle.includes('n')) y = frame.y + (startH - estH);
      updateElement(layoutId, element.id, { frame: { ...frame, x, y }, style: { ...style, fontSize: newFontSize } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // See ElementRenderer's own text branch for why gradient text needs this background-clip trick
  // (and why it can't combine with the `style.fill` pill background).
  const gradientText = isGradient(style.color);

  return (
    <div
      data-resize-box
      className="absolute"
      style={{
        left: `${(frame.x / layoutWidth) * 100}%`,
        top: `${(frame.y / layoutHeight) * 100}%`,
        width: 'max-content',
        height: 'max-content',
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        cursor: activeTool === 'select' && !isEditing ? 'move' : undefined,
      }}
      onMouseDown={(e) => {
        // Let a placement tool (text/shape) click straight through to the frame beneath.
        if (activeTool !== 'select') return;
        if (isEditing) {
          // Stop it from bubbling to the frame's own mousedown (which would deselect us), but
          // don't preventDefault — the browser still needs to place the caret natively.
          e.stopPropagation();
          return;
        }
        startDragOrDeferredSelect(e, frame, onSelect);
      }}
      onDoubleClick={(e) => {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        if (onEnterGroup) {
          onEnterGroup(e);
          return;
        }
        onSelect(e);
        onStartEditing();
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={ref}
        contentEditable={isEditing}
        suppressContentEditableWarning
        style={{
          writingMode: style.writingMode,
          backgroundColor: gradientText ? undefined : style.fill,
          backgroundImage: gradientText ? style.color : undefined,
          backgroundClip: gradientText ? 'text' : undefined,
          WebkitBackgroundClip: gradientText ? 'text' : undefined,
          borderRadius: style.radius ? `${style.radius}px` : undefined,
          color: gradientText ? 'transparent' : (style.color ?? '#ffffff'),
          fontWeight: style.fontWeight ?? 600,
          fontFamily: style.fontFamily,
          fontSize: `${((style.fontSize ?? 16) / layoutWidth) * 100}cqw`,
          textAlign: style.writingMode === 'vertical-rl' ? 'center' : ((style.align as 'left' | 'center' | 'right') ?? 'center'),
          whiteSpace: 'pre',
          outline: 'none',
          cursor: isEditing ? 'text' : undefined,
          textShadow: textShadowCss(style.dropShadow),
        }}
      >
        {element.content}
      </div>
      {selected && (
        <SelectionBoundingBox
          hovered={hovered}
          onResizeStart={(handle, e) => startFontResize(e, handle)}
          onRotateStart={(_handle, e) => {
            const boxEl = (e.target as HTMLElement).closest('[data-resize-box]') as HTMLElement | null;
            if (boxEl) startRotate(e, boxEl, element.rotation ?? 0);
          }}
        />
      )}
    </div>
  );
}
