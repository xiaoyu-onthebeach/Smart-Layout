import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { textShadowCss } from '@/lib/shadow';
import { useElementDrag } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';

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
}) {
  const ref = useRef<HTMLDivElement>(null);
  const updateElement = useAppStore((s) => s.updateElement);
  const { startDrag, startResize } = useElementDrag(layoutId, element.id, scale);

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

  return (
    <div
      className="absolute"
      style={{
        left: `${(frame.x / layoutWidth) * 100}%`,
        top: `${(frame.y / layoutHeight) * 100}%`,
        width: `${(frame.w / layoutWidth) * 100}%`,
        height: `${(frame.h / layoutHeight) * 100}%`,
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
        onSelect(e);
        startDrag(e, frame);
      }}
      onDoubleClick={(e) => {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        onSelect(e);
        onStartEditing();
      }}
    >
      <div
        ref={ref}
        contentEditable={isEditing}
        suppressContentEditableWarning
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          // Same reasoning as ElementRenderer's text branch: vertical writing mode stacks content
          // into one column, so "left/right" alignment no longer maps onto a meaningful axis.
          justifyContent: style.writingMode === 'vertical-rl' ? 'center' : style.align === 'left' ? 'flex-start' : style.align === 'right' ? 'flex-end' : 'center',
          writingMode: style.writingMode,
          backgroundColor: style.fill,
          borderRadius: style.radius ? `${style.radius}px` : undefined,
          color: style.color ?? '#ffffff',
          fontWeight: style.fontWeight ?? 600,
          fontFamily: style.fontFamily,
          fontSize: `${((style.fontSize ?? 16) / layoutWidth) * 100}cqw`,
          textAlign: 'center',
          outline: 'none',
          cursor: isEditing ? 'text' : undefined,
          textShadow: textShadowCss(style.dropShadow),
        }}
      >
        {element.content}
      </div>
      {selected && <SelectionBoundingBox onResizeStart={(handle, e) => startResize(e, handle, frame)} />}
    </div>
  );
}
