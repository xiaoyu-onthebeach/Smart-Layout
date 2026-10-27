import type { MouseEvent as ReactMouseEvent } from 'react';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { boxShadowCss } from '@/lib/shadow';
import { arrowPoints, DEFAULT_POLYGON_SIDES, regularPolygonPoints } from '@/lib/vector-path';
import { useElementDrag, DUPLICATE_CURSOR } from './useElementDrag';
import { LineEndpointHandles, SelectionBoundingBox } from './SelectionBoundingBox';
import { EllipseEditOverlay } from './EllipseEditOverlay';

/** A user-placed shape — selectable, draggable, and resizable via 8 handles, same as the image layer.
 * Double-click starts editing it ("make all shapes editable as svg" in the SVG import & edit spec):
 * every kind except ellipse converts in place into a real vector path (`onConvertAndEdit`, handed
 * straight to the same joint-editing an imported/drawn vector already has); an ellipse instead keeps
 * being a plain CSS ellipse forever (`onEnterEllipseEdit`) with 4 joint-styled resize handles on top
 * — see EllipseEditOverlay's own doc comment for why. */
export function SelectableShapeElement({
  element,
  layoutId,
  layoutWidth,
  layoutHeight,
  scale,
  activeTool,
  selected,
  isEditing,
  altKeyDown,
  onSelect,
  onConvertAndEdit,
  onEnterEllipseEdit,
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
  /** True only for an ellipse currently showing EllipseEditOverlay — every other shape kind leaves
   * this state the moment it's double-clicked (it becomes a `vector` element instead, rendered by
   * SelectableVectorElement from then on). */
  isEditing: boolean;
  /** Option/Alt is currently held — swaps the hover cursor to the duplicate hint. */
  altKeyDown: boolean;
  onSelect: (e: ReactMouseEvent) => void;
  onConvertAndEdit: () => void;
  onEnterEllipseEdit: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Set only when this element belongs to a group that isn't currently "entered" — double-click enters it. */
  onEnterGroup?: (e: ReactMouseEvent) => void;
  /** Option-drag-duplicate: clones this element, selects the clone, and returns its id plus a
   * callback to fire once the drag ends — see ArtboardFrame's own `startAltDuplicate`. */
  onStartAltDuplicate: (element: LayoutElement) => { newId: string; onDragEnd: () => void };
}) {
  const { startDrag, startDragOrDeferredSelect, startResize, startRotate, startEndpointDrag } = useElementDrag(layoutId, element.id, scale);
  const { frame, style } = element;
  const isLine = element.shape === 'line';
  const isArrow = element.shape === 'arrow';
  const isPolygon = element.shape === 'polygon';
  const isEllipse = element.shape === 'ellipse';

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
        // Only hints "this drag will duplicate" over the layer that's actually selected — hovering
        // some other, unselected layer with Option held still shows a plain move cursor.
        cursor: activeTool === 'select' ? (altKeyDown && selected ? DUPLICATE_CURSOR : 'move') : undefined,
      }}
      onMouseDown={(e) => {
        // Let a placement tool (text/shape) click straight through to the frame beneath.
        if (activeTool !== 'select' || isEditing) return;
        if (e.altKey) {
          const { newId, onDragEnd } = onStartAltDuplicate(element);
          startDrag(e, frame, { elementId: newId, onDragEnd });
          return;
        }
        startDragOrDeferredSelect(e, frame, onSelect);
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        if (onEnterGroup) {
          onEnterGroup(e);
          return;
        }
        onSelect(e);
        if (isEllipse) onEnterEllipseEdit();
        else onConvertAndEdit();
      }}
    >
      {isArrow ? (
        <svg
          viewBox={`0 0 ${frame.w} ${frame.h}`}
          preserveAspectRatio="none"
          className="size-full overflow-visible"
          style={{ opacity: style.opacity !== undefined ? style.opacity / 100 : undefined, boxShadow: boxShadowCss(style.dropShadow, style.innerShadow) }}
        >
          <polyline
            points={arrowPoints(frame.w, frame.h, style.strokeWidth ?? 4)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill="none"
            stroke={style.strokeColor ?? '#ffffff'}
            strokeWidth={style.strokeWidth ?? 4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : isPolygon ? (
        <svg
          viewBox={`0 0 ${frame.w} ${frame.h}`}
          preserveAspectRatio="none"
          className="size-full overflow-visible"
          style={{ opacity: style.opacity !== undefined ? style.opacity / 100 : undefined, boxShadow: boxShadowCss(style.dropShadow, style.innerShadow) }}
        >
          <polygon
            points={regularPolygonPoints(style.polygonSides ?? DEFAULT_POLYGON_SIDES, frame.w, frame.h)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill={style.fill ?? '#d9d9d9'}
            stroke={style.strokeWidth ? (style.strokeColor ?? '#000000') : undefined}
            strokeWidth={style.strokeWidth}
          />
        </svg>
      ) : (
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
      )}
      {isEditing ? (
        <EllipseEditOverlay onResizeStart={(handle, e) => startResize(e, handle, frame, style)} />
      ) : (
        selected &&
        (isLine || isArrow ? (
          <LineEndpointHandles onEndpointDragStart={(side, e) => startEndpointDrag(e, side, frame, element.rotation ?? 0)} />
        ) : (
          <SelectionBoundingBox
            onResizeStart={(handle, e) => startResize(e, handle, frame, style)}
            onRotateStart={(_handle, e) => {
              const boxEl = (e.target as HTMLElement).closest('[data-resize-box]') as HTMLElement | null;
              if (boxEl) startRotate(e, boxEl, element.rotation ?? 0);
            }}
          />
        ))
      )}
    </div>
  );
}
