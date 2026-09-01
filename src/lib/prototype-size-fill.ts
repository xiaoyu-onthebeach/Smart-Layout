import type { Layout } from '@/types';

/**
 * Demo-only convenience: every size spun off *from* an existing scene (the view-all "+" hotspot /
 * "Add more sizes") gets its image slot auto-filled with this one photo — never the first, initial
 * scene a set starts from (see callers). The photo has generous empty space around a small product
 * cluster near its center; PRODUCT_BBOX is that cluster's fixed location, measured once, as a
 * fraction of the (square, 2048×2048) source image.
 */
// Percent-encoded: every `url(${imageUrl})` call site in this app builds an unquoted CSS url()
// token, which can't contain a literal space.
const BIG_SIZE_IMAGE_URL = '/samples/Big%20size.png';
const PRODUCT_BBOX = { x0: 0.51, y0: 0.39, x1: 0.65, y1: 0.57 };
/** Target fraction of the crop's own (shorter) side the product cluster should occupy — bigger = more zoomed in. */
const OCCUPANCY = 1 / 2.4;

/**
 * Picks a crop of the source image — matching the target size's aspect ratio exactly (so it fills
 * edge-to-edge), centered on the product cluster, sized so the cluster occupies roughly OCCUPANCY
 * of the crop — then expresses that crop as an image element `frame`, in the target layout's own
 * px coordinate space. The crop is usually smaller than the full image, so the resulting frame
 * ends up bigger than the layout itself and overflows off-canvas on whichever sides aren't
 * shown — that's intentional: it's exactly the existing "select the image, see the dimmed
 * overflow, drag to reposition" behavior, which is how the rest of the photo stays reachable.
 */
function computeBigSizeFrame(targetWidth: number, targetHeight: number): { x: number; y: number; w: number; h: number } {
  const bboxW = PRODUCT_BBOX.x1 - PRODUCT_BBOX.x0;
  const bboxH = PRODUCT_BBOX.y1 - PRODUCT_BBOX.y0;
  const centerX = (PRODUCT_BBOX.x0 + PRODUCT_BBOX.x1) / 2;
  const centerY = (PRODUCT_BBOX.y0 + PRODUCT_BBOX.y1) / 2;
  const ratio = targetWidth / targetHeight;

  const desiredW = bboxW / OCCUPANCY;
  const desiredH = bboxH / OCCUPANCY;
  // Whichever dimension is more constraining wins, while locking the crop's aspect ratio to the
  // target's — otherwise the crop wouldn't map cleanly onto the target frame.
  let cropW = Math.max(desiredW, desiredH * ratio);
  let cropH = cropW / ratio;
  // The source image is only so big — for an extreme aspect ratio (e.g. a 5:1 leaderboard) there
  // isn't room for full padding *and* the target ratio *and* staying in-bounds. Scale both
  // dimensions down together (preserving the ratio) to the max that still fits, rather than
  // cropping outside the actual image.
  const clamp = Math.min(1, 1 / cropW, 1 / cropH);
  cropW *= clamp;
  cropH *= clamp;

  const cropX0 = Math.min(Math.max(centerX - cropW / 2, 0), 1 - cropW);
  const cropY0 = Math.min(Math.max(centerY - cropH / 2, 0), 1 - cropH);

  const scale = targetWidth / cropW; // == targetHeight / cropH, since cropW/cropH is locked to targetWidth/targetHeight
  return { x: -cropX0 * scale, y: -cropY0 * scale, w: scale, h: scale };
}

export function applyPrototypeSizeFill(layout: Layout): Layout {
  const imageElement = layout.elements.find((el) => el.kind === 'image');
  if (!imageElement) return layout;

  return {
    ...layout,
    elements: layout.elements
      // Any other image layer carried over from the source scene (e.g. one manually added or
      // duplicated there) would otherwise render on top of this fill — drop it, keeping only the
      // one slot this function fills.
      .filter((el) => el.kind !== 'image' || el.id === imageElement.id)
      .map((el) =>
        el.id === imageElement.id
          ? { ...el, imageUrl: BIG_SIZE_IMAGE_URL, focalPoint: { x: 0.5, y: 0.5 }, frame: computeBigSizeFrame(layout.size.width, layout.size.height) }
          : el,
      ),
  };
}
