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
}: {
  element: LayoutElement;
  layoutId: string;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  activeTool: Tool;
  selected: boolean;
  onSelect: (e: ReactMouseEvent) => void;
}) {
  const { startDrag, startResize } = useElementDrag(layoutId, element.id, scale);
  const { frame, style } = element;
  const isLine = element.shape === 'line';

  return (
    <div
      className="absolute"
      style={{
        left: `${(frame.x / layoutWidth) * 100}%`,
        top: `${(frame.y / layoutHeight) * 100}%`,
        width: `${(frame.w / layoutWidth) * 100}%`,
        height: `${(frame.h / layoutHeight) * 100}%`,
        cursor: activeTool === 'select' ? 'move' : undefined,
      }}
      onMouseDown={(e) => {
        // Let a placement tool (text/shape) click straight through to the frame beneath.
        if (activeTool !== 'select') return;
        onSelect(e);
        startDrag(e, frame);
      }}
    >
      <div
        className="size-full"
        style={{
          backgroundColor: isLine ? undefined : (style.fill ?? '#d9d9d9'),
          borderRadius: element.shape === 'ellipse' ? '9999px' : style.radius ? `${style.radius}px` : undefined,
          border: style.strokeWidth ? `${style.strokeWidth}px solid ${style.strokeColor ?? '#000000'}` : undefined,
          opacity: style.opacity !== undefined ? style.opacity / 100 : undefined,
          boxShadow: boxShadowCss(style.dropShadow, style.innerShadow),
          boxSizing: 'border-box',
        }}
      >
        {isLine && <div className="h-full w-full" style={{ backgroundColor: style.fill ?? '#d9d9d9' }} />}
      </div>
      {selected && <SelectionBoundingBox onResizeStart={(handle, e) => startResize(e, handle, frame)} />}
    </div>
  );
}
