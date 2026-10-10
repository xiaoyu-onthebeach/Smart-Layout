import { useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { textShadowCss } from '@/lib/shadow';
import { isGradient } from '@/lib/gradient';
import { autoLayoutPaddingCss } from '@/lib/text-auto-layout';
import { useElementDrag, DUPLICATE_CURSOR, MIN_SIZE, type ResizeHandle } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';

const MIN_FONT_SIZE = 6;

/** Plain-text character offsets (against `container`'s own text content) of the current DOM
 * selection, or `null` if there's no selection or it's outside `container` entirely. */
function getSelectionOffsets(container: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  return { start, end: start + range.toString().length };
}

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
  altKeyDown,
  isEditing,
  onSelect,
  onStartEditing,
  onContextMenu,
  onEnterGroup,
  onStartAltDuplicate,
}: {
  element: LayoutElement;
  layoutId: string;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  activeTool: Tool;
  selected: boolean;
  /** Option/Alt is currently held — swaps the hover cursor to the duplicate hint. */
  altKeyDown: boolean;
  isEditing: boolean;
  onSelect: (e: ReactMouseEvent) => void;
  onStartEditing: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Set only when this element belongs to a group that isn't currently "entered" — double-click
   * enters the group instead of starting text-edit mode. */
  onEnterGroup?: (e: ReactMouseEvent) => void;
  /** Option-drag-duplicate: clones this element, selects the clone, and returns its id plus a
   * callback to fire once the drag ends — see ArtboardFrame's own `startAltDuplicate`. */
  onStartAltDuplicate: (element: LayoutElement) => { newId: string; onDragEnd: () => void };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const updateElement = useAppStore((s) => s.updateElement);
  const setTextRangeSelection = useAppStore((s) => s.setTextRangeSelection);
  const { startDrag, startDragOrDeferredSelect, startRotate } = useElementDrag(layoutId, element.id, scale);

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

  // Tracks the live selection while typing/highlighting, for the Spacing/Stretch panel fields to
  // read (see textRangeSelection). Global `selectionchange` rather than a React `onSelect` handler
  // — the latter doesn't fire reliably for arbitrary contentEditable elements across browsers.
  // Ignores any selection whose common ancestor has moved outside this element (e.g. the user
  // clicked into a panel field to type a value) instead of clearing it, so the last real highlight
  // survives that blur for the panel to still apply.
  useEffect(() => {
    if (!isEditing) return;
    function handleSelectionChange() {
      const el = ref.current;
      if (!el) return;
      const offsets = getSelectionOffsets(el);
      if (offsets) setTextRangeSelection({ layoutId, elementId: element.id, start: offsets.start, end: offsets.end });
    }
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isEditing, layoutId, element.id, setTextRangeSelection]);

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
  // Auto Layout's per-axis "Hug" switches — an axis with hug off keeps whatever frame.w/h it was
  // given instead of fitting the text, and a fixed width wraps the text onto new lines.
  const autoLayout = style.autoLayout;
  const fixedW = Boolean(autoLayout && !autoLayout.hugWidth);
  const fixedH = Boolean(autoLayout && !autoLayout.hugHeight);

  // The box hugs the rendered text exactly (plus any Auto Layout padding) — frame.w/h isn't an
  // independent setting for text, it's just a cache of this measurement so every other consumer
  // (thumbnails, export, the group-bounds box) sees the same tight size without re-measuring
  // themselves. Re-measures whenever anything that affects the rendered size changes; frame.w/h
  // itself is deliberately NOT a dependency — it only ever changes as a result of this effect, so
  // depending on it would just be measuring in a circle. The one exception is a fixed width, which
  // this effect never writes but which decides where the text wraps, and so how tall it is.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nativeW = fixedW ? frame.w : rect.width / scale;
    const nativeH = fixedH ? frame.h : rect.height / scale;
    if (Math.abs(nativeW - frame.w) > 0.5 || Math.abs(nativeH - frame.h) > 0.5) {
      updateElement(layoutId, element.id, { frame: { ...frame, w: nativeW, h: nativeH } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    element.content,
    style.fontSize,
    style.fontFamily,
    style.fontWeight,
    style.letterSpacing,
    style.stretch,
    style.writingMode,
    scale,
    layoutWidth,
    autoLayout?.padding.top,
    autoLayout?.padding.right,
    autoLayout?.padding.bottom,
    autoLayout?.padding.left,
    fixedW,
    fixedH,
    fixedW ? frame.w : undefined,
  ]);

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

  // Once Auto Layout has either axis at a fixed size, dragging a handle resizes the box itself
  // (like any shape's edge drag, no aspect lock) instead of scaling the font — and dragging along
  // an axis that still hugs freezes it at the dragged size, the same way Figma's text boxes do.
  function startBoxResize(e: ReactMouseEvent, handle: ResizeHandle) {
    if (!autoLayout) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = frame;
    const nextAutoLayout = {
      ...autoLayout,
      hugWidth: autoLayout.hugWidth && !(handle.includes('e') || handle.includes('w')),
      hugHeight: autoLayout.hugHeight && !(handle.includes('n') || handle.includes('s')),
    };

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let { x, y, w, h } = startFrame;
      if (handle.includes('e')) w = Math.max(MIN_SIZE, startFrame.w + dx);
      if (handle.includes('w')) w = Math.max(MIN_SIZE, startFrame.w - dx);
      if (handle.includes('s')) h = Math.max(MIN_SIZE, startFrame.h + dy);
      if (handle.includes('n')) h = Math.max(MIN_SIZE, startFrame.h - dy);
      if (handle.includes('w')) x = startFrame.x + (startFrame.w - w);
      if (handle.includes('n')) y = startFrame.y + (startFrame.h - h);
      updateElement(layoutId, element.id, { frame: { x, y, w, h }, style: { ...style, autoLayout: nextAutoLayout } });
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
        width: fixedW ? `${(frame.w / layoutWidth) * 100}%` : 'max-content',
        height: fixedH ? `${(frame.h / layoutHeight) * 100}%` : 'max-content',
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        // Only hints "this drag will duplicate" over the layer that's actually selected — hovering
        // some other, unselected layer with Option held still shows a plain move cursor.
        cursor: activeTool === 'select' && !isEditing ? (altKeyDown && selected ? DUPLICATE_CURSOR : 'move') : undefined,
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
        if (e.altKey) {
          const { newId, onDragEnd } = onStartAltDuplicate(element);
          startDrag(e, frame, { elementId: newId, onDragEnd });
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
          whiteSpace: fixedW ? 'pre-wrap' : 'pre',
          padding: autoLayout ? autoLayoutPaddingCss(autoLayout, layoutWidth) : undefined,
          boxSizing: 'border-box',
          width: fixedW ? '100%' : undefined,
          height: fixedH ? '100%' : undefined,
          outline: 'none',
          cursor: isEditing ? 'text' : undefined,
          textShadow: textShadowCss(style.dropShadow),
        }}
      >
        {element.content}
      </div>
      {selected && (
        <SelectionBoundingBox
          onResizeStart={(handle, e) => (fixedW || fixedH ? startBoxResize(e, handle) : startFontResize(e, handle))}
          onRotateStart={(_handle, e) => {
            const boxEl = (e.target as HTMLElement).closest('[data-resize-box]') as HTMLElement | null;
            if (boxEl) startRotate(e, boxEl, element.rotation ?? 0);
          }}
        />
      )}
    </div>
  );
}
