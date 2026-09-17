import type { Layout, LayoutElement } from '@/types';
import { classify } from './size-class';
import { nextId } from './create-layout';

/**
 * One-off demo content for the very first primary size a session creates — see
 * `PlaygroundsPage.tsx` (which builds the primary's own elements from `buildLancomePrimaryElements`)
 * and `MultiPageCanvas.tsx`'s `handleAddAdjacent` (which checks `findLancomeSiblingFill` before
 * falling back to the normal adapt/overlay pipeline). Assets live in `public/samples/Lancome banners/`
 * — spaces percent-encoded since every `url(...)` call site in this app builds an unquoted token.
 */
const SAMPLES_DIR = '/samples/Lancome%20banners';
// Exported so LayersTab can identify which real element is which by its imageUrl, for the demo's
// own hand-authored layer list (see LancomeLayerRows) — a single source of truth instead of
// duplicating these strings there.
export const LANCOME_BACKGROUND_URL = `${SAMPLES_DIR}/600x500-bg.png`;
export const LANCOME_PRODUCT_NAME_URL = `${SAMPLES_DIR}/Product%20name.svg`;
export const LANCOME_DESCRIPTION_URL = `${SAMPLES_DIR}/Description.svg`;
export const LANCOME_BUTTON_URL = `${SAMPLES_DIR}/Button.svg`;

function imageElement(url: string, frame: { x: number; y: number; w: number; h: number }): LayoutElement {
  return { id: nextId('el'), kind: 'image', slot: null, imageUrl: url, focalPoint: { x: 0.5, y: 0.5 }, frame, style: {}, visible: true };
}

// Native px size of each asset (read off its own SVG viewBox) — placed at that native size, not
// stretched, anchored at the given top-left position.
const OVERLAY_SPECS: { url: string; x: number; y: number; w: number; h: number }[] = [
  { url: LANCOME_PRODUCT_NAME_URL, x: 67, y: 110, w: 202, h: 78 },
  { url: LANCOME_DESCRIPTION_URL, x: 80, y: 229, w: 173, h: 64 },
  { url: LANCOME_BUTTON_URL, x: 106, y: 320, w: 125, h: 28 },
];

/** The initial 600×500 scene's own content — a full-bleed background photo with the product
 * name/description/button graphics layered on top at their fixed positions. */
export function buildLancomePrimaryElements(width: number, height: number): LayoutElement[] {
  return [imageElement(LANCOME_BACKGROUND_URL, { x: 0, y: 0, w: width, h: height }), ...OVERLAY_SPECS.map((spec) => imageElement(spec.url, spec))];
}

// width/height → the matching hero shot for that exact size, @2x assets rendered at their nominal
// (not pixel) dimensions.
const SIBLING_FILLS: { width: number; height: number; url: string }[] = [
  { width: 1280, height: 200, url: `${SAMPLES_DIR}/%201280x200.png` },
  { width: 400, height: 800, url: `${SAMPLES_DIR}/400x800.png` },
  { width: 880, height: 320, url: `${SAMPLES_DIR}/880x320.png` },
  { width: 480, height: 360, url: `${SAMPLES_DIR}/480x360.png` },
];

/** Only the 4 sizes this demo has a matching hero shot for — every other size generated from the
 * Lancome primary still goes through the normal adapt/overlay pipeline. */
export function findLancomeSiblingFill(width: number, height: number): string | undefined {
  return SIBLING_FILLS.find((f) => f.width === width && f.height === height)?.url;
}

/**
 * A sibling layout filled with a single full-frame image — deliberately not `createAdaptedLayout`
 * (no carried-over elements from the primary) and no `buildOverlayElements` decoration on top,
 * since each of these 4 sizes already has its own finished hero shot.
 */
export function buildLancomeSiblingLayout(
  opts: { setId: string; productId: string; width: number; height: number; label: string; presetId?: string; ruleSetId: string },
  fillUrl: string,
): Layout {
  return {
    id: nextId('layout'),
    setId: opts.setId,
    productId: opts.productId,
    size: { width: opts.width, height: opts.height, presetId: opts.presetId, label: opts.label },
    sizeClass: classify(opts.width, opts.height),
    ruleSetId: opts.ruleSetId,
    elements: [imageElement(fillUrl, { x: 0, y: 0, w: opts.width, h: opts.height })],
    isSource: true,
    detached: false,
    adaptationNotes: [],
  };
}
