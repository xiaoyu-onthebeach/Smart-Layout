import type { LayoutElement } from '@/types';

/**
 * Simplified "self-adapt" — scales every element's frame (and font size / radius)
 * proportionally from the source size to the target size. Not the brief's full
 * per-size-class adaptation engine (no reflow, no drop-order); a straight,
 * predictable scale so a copied page still looks intentional at a new ratio.
 *
 * Element ids are preserved (not regenerated) on purpose: pages in the same
 * group correlate their elements by id so an edit on one can cascade to the
 * matching element on the rest.
 */
export function adaptElementsToSize(
  elements: LayoutElement[],
  sourceSize: { width: number; height: number },
  targetSize: { width: number; height: number },
): LayoutElement[] {
  const scaleX = targetSize.width / sourceSize.width;
  const scaleY = targetSize.height / sourceSize.height;

  return elements.map((el) => ({
    ...el,
    frame: {
      x: el.frame.x * scaleX,
      y: el.frame.y * scaleY,
      w: el.frame.w * scaleX,
      h: el.frame.h * scaleY,
    },
    style: {
      ...el.style,
      fontSize: el.style.fontSize ? el.style.fontSize * scaleX : el.style.fontSize,
      radius: el.style.radius ? el.style.radius * scaleX : el.style.radius,
    },
  }));
}
