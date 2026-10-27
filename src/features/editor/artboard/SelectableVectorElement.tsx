import type { MouseEvent as ReactMouseEvent } from 'react';
import type { LayoutElement } from '@/types';
import type { Tool } from '@/store/types';
import { boxShadowCss } from '@/lib/shadow';
import { jointsToRoundedPathD, RADIUS_HANDLE_ICON } from '@/lib/vector-path';
import { useElementDrag, DUPLICATE_CURSOR } from './useElementDrag';
import { SelectionBoundingBox } from './SelectionBoundingBox';
import { VectorEditOverlay } from './VectorEditOverlay';

/** A vector path layer (imported from SVG, or — later — drawn with the pen tool). Mirrors
 * `SelectableShapeElement` for the normal selected/dragging/resizing behavior, with two states on
 * top of that per the SVG import & edit spec: **Focused** (this component's default selected look —
 * the usual bounding box/handles, plus a non-interactive red radius handle, no joints) and
 * **Editing** (double-click, or Enter while focused — handles disappear, replaced by
 * `VectorEditOverlay`'s joints). */
export function SelectableVectorElement({
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
  isEditing: boolean;
  altKeyDown: boolean;
  onSelect: (e: ReactMouseEvent) => void;
  onStartEditing: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  onEnterGroup?: (e: ReactMouseEvent) => void;
  onStartAltDuplicate: (element: LayoutElement) => { newId: string; onDragEnd: () => void };
}) {
  const { startDrag, startDragOrDeferredSelect, startResize, startRotate } = useElementDrag(layoutId, element.id, scale);
  const { frame, style, path } = element;

  const d = path && path.joints.length >= 2 ? jointsToRoundedPathD(path, style.radius ?? 0) : '';

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
        cursor: activeTool === 'select' && !isEditing ? (altKeyDown && selected ? DUPLICATE_CURSOR : 'move') : undefined,
        boxShadow: boxShadowCss(style.dropShadow, style.innerShadow),
      }}
      onMouseDown={(e) => {
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
        onStartEditing();
      }}
    >
      {d && (
        <svg
          viewBox={`0 0 ${frame.w} ${frame.h}`}
          preserveAspectRatio="none"
          className="size-full overflow-visible"
          style={{ opacity: style.opacity !== undefined ? style.opacity / 100 : undefined }}
        >
          {path!.closed ? (
            <path d={d} fill={style.fill ?? 'none'} stroke={style.strokeColor} strokeWidth={style.strokeWidth} />
          ) : (
            <path d={d} fill="none" stroke={style.strokeColor ?? style.fill ?? '#000000'} strokeWidth={style.strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      )}

      {isEditing ? (
        <VectorEditOverlay layoutId={layoutId} element={element} />
      ) : (
        selected && (
          <>
            <SelectionBoundingBox
              onResizeStart={(handle, e) => startResize(e, handle, frame, style)}
              onRotateStart={(_handle, e) => {
                const boxEl = (e.target as HTMLElement).closest('[data-resize-box]') as HTMLElement | null;
                if (boxEl) startRotate(e, boxEl, element.rotation ?? 0);
              }}
            />
            {/* Focused state's own red radius handle — "use the radius handler.svg... make it
                non-interactive for now" (see out-of-scope: "Red ring handle behavior"). Inset a
                fixed 12 screen px below the frame's top edge, horizontally centered — a render-only
                placeholder until it does anything. */}
            <img
              src={RADIUS_HANDLE_ICON.src}
              alt=""
              className="pointer-events-none absolute"
              style={{
                left: '50%',
                top: 12,
                width: RADIUS_HANDLE_ICON.w,
                height: RADIUS_HANDLE_ICON.h,
                transform: `translate(${-RADIUS_HANDLE_ICON.center.x}px, ${-RADIUS_HANDLE_ICON.center.y}px)`,
              }}
            />
          </>
        )
      )}
    </div>
  );
}
