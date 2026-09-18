import type { MouseEvent as ReactMouseEvent } from 'react';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { boxShadowCss } from '@/lib/shadow';
import { useElementDrag } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';

/** A user-placed shape — selectable, draggable, and resizable via 8 handles, same as the image layer. */
export function SelectableShapeElement({
  element,
  layoutId,
  layoutWidth,
  layoutHeight,
  scale,
  activeTool,
  selected,
  onSelect,
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
  onSelect: (e: ReactMouseEvent) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Set only when this element belongs to a group that isn't currently "entered" — double-click enters it. */
  onEnterGroup?: (e: ReactMouseEvent) => void;
}) {
  const { startDragOrDeferredSelect, startResize, startRotate } = useElementDrag(layoutId, element.id, scale);
  const { frame, style } = element;
  const isLine = element.shape === 'line';

  return (
    <div
      data-resize-box
      className="absolute"
      style={{
        left: `${(frame.x / layoutWidth) * 100}%`,
        top: `${(frame.y / layoutHeight) * 100}%`,
        width: `${(frame.w / layoutWidth) * 100}%`,
        height: `${(frame.h / layoutHeight) * 100}%`,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        cursor: activeTool === 'select' ? 'move' : undefined,
      }}
      onMouseDown={(e) => {
        // Let a placement tool (text/shape) click straight through to the frame beneath.
        if (activeTool !== 'select') return;
        startDragOrDeferredSelect(e, frame, onSelect);
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={
        onEnterGroup &&
        ((e) => {
          if (activeTool !== 'select') return;
          e.stopPropagation();
          onEnterGroup(e);
        })
      }
    >
      <div
        className="size-full"
        style={{
          background: isLine ? undefined : (style.fill ?? '#d9d9d9'),
          borderRadius: element.shape === 'ellipse' ? '9999px' : style.radius ? `${style.radius}px` : undefined,
          border: style.strokeWidth ? `${style.strokeWidth}px solid ${style.strokeColor ?? '#000000'}` : undefined,
          opacity: style.opacity !== undefined ? style.opacity / 100 : undefined,
          boxShadow: boxShadowCss(style.dropShadow, style.innerShadow),
          boxSizing: 'border-box',
        }}
      >
        {isLine && <div className="h-full w-full" style={{ background: style.fill ?? '#d9d9d9' }} />}
      </div>
      {selected && (
        <SelectionBoundingBox
          onResizeStart={(handle, e) => startResize(e, handle, frame)}
          onRotateStart={(_handle, e) => {
            const boxEl = (e.target as HTMLElement).closest('[data-resize-box]') as HTMLElement | null;
            if (boxEl) startRotate(e, boxEl, element.rotation ?? 0);
          }}
        />
      )}
    </div>
  );
}
