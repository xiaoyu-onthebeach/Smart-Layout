import { useAppStore } from '@/store/useAppStore';

/** Sets an image element's url, centered and sized to ~70% of the layout along its own aspect ratio. */
export function useApplyImage() {
  const updateElement = useAppStore((s) => s.updateElement);

  return function applyImage(layoutId: string, elementId: string, url: string, nativeWidth: number, nativeHeight: number) {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      const maxW = nativeWidth * 0.7;
      const maxH = nativeHeight * 0.7;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      updateElement(layoutId, elementId, {
        imageUrl: url,
        focalPoint: { x: 0.5, y: 0.5 },
        frame: { x: (nativeWidth - w) / 2, y: (nativeHeight - h) / 2, w, h },
        pendingExpand: undefined,
      });
    };
    img.src = url;
  };
}
