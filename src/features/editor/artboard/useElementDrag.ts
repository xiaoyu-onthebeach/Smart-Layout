import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';

export const MIN_SIZE = 24;
// Corners resize both axes; edge midpoints resize a single axis.
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

/** Pixel-drag move/resize for a single element's frame. `scale` = rendered px per native layout px. */
export function useElementDrag(layoutId: string, elementId: string, scale: number) {
  const updateElement = useAppStore((s) => s.updateElement);

  function startDrag(e: ReactMouseEvent, startFrame: LayoutElement['frame']) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      updateElement(layoutId, elementId, { frame: { ...startFrame, x: startFrame.x + dx, y: startFrame.y + dy } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startResize(e: ReactMouseEvent, corner: ResizeHandle, startFrame: LayoutElement['frame']) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let { x, y, w, h } = startFrame;
      if (corner.includes('e')) w = Math.max(MIN_SIZE, startFrame.w + dx);
      if (corner.includes('s')) h = Math.max(MIN_SIZE, startFrame.h + dy);
      if (corner.includes('w')) {
        w = Math.max(MIN_SIZE, startFrame.w - dx);
        x = startFrame.x + (startFrame.w - w);
      }
      if (corner.includes('n')) {
        h = Math.max(MIN_SIZE, startFrame.h - dy);
        y = startFrame.y + (startFrame.h - h);
      }
      updateElement(layoutId, elementId, { frame: { x, y, w, h } });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { startDrag, startResize };
}
