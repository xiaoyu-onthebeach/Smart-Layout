import type { LayoutElement } from '@/types';
import { nextId } from './create-layout';

type Archetype = 'wide' | 'square' | 'tall';
type Align = 'left' | 'center';

type OverlaySpec = { imageUrl: string; xPct: number; yPct: number; wPct: number; hPct: number; align?: Align };

// Each asset's own pixel dimensions — used to fit it within its percentage box without distorting
// or cropping it (see fitWithinBox usage below). Measured from the SVGs' own width/height attrs.
const NATIVE_SIZE: Record<string, { w: number; h: number }> = {
  '/samples/coupon.svg': { w: 213, h: 213 },
  '/samples/logo.svg': { w: 247, h: 34 },
  '/samples/headline.svg': { w: 488, h: 68 },
  '/samples/button.svg': { w: 317, h: 100 },
  '/samples/bottom_banner.svg': { w: 1200, h: 105 },
};

// From public/samples/position-overlay-spec.md — percentages of canvas width/height, measured
// from the top-left corner. Every size within an archetype reuses this same set of positions.
// `wPct`/`hPct` describe a bounding box, not the element's literal shape — each element is then
// fit inside that box at its own native aspect ratio (see fitWithinBox), so it's never stretched
// or cropped. `bottom_banner` centers within its box instead of left-aligning, since its box is
// meant to read as "full width" even though its own aspect ratio won't literally reach 100%.
// Wide only lists coupon — its logo/headline/button/bottom_banner are handled separately by
// buildWideOverlay below, which diverges by aspect ratio in ways this flat table can't express.
const ARCHETYPE_POSITIONS: Record<Archetype, OverlaySpec[]> = {
  wide: [{ imageUrl: '/samples/coupon.svg', xPct: 5, yPct: 8, wPct: 11, hPct: 35 }],
  square: [
    { imageUrl: '/samples/coupon.svg', xPct: 7, yPct: 13, wPct: 17, hPct: 18 },
    { imageUrl: '/samples/logo.svg', xPct: 41, yPct: 17, wPct: 28, hPct: 5 },
    { imageUrl: '/samples/headline.svg', xPct: 41, yPct: 24, wPct: 54, hPct: 8 },
    { imageUrl: '/samples/button.svg', xPct: 41, yPct: 38, wPct: 35, hPct: 10 },
    { imageUrl: '/samples/bottom_banner.svg', xPct: 0, yPct: 91, wPct: 100, hPct: 9, align: 'center' },
  ],
  tall: [
    { imageUrl: '/samples/coupon.svg', xPct: 16, yPct: 15, wPct: 21, hPct: 12 },
    { imageUrl: '/samples/logo.svg', xPct: 17, yPct: 33, wPct: 32, hPct: 3 },
    { imageUrl: '/samples/headline.svg', xPct: 17, yPct: 37, wPct: 64, hPct: 6 },
    { imageUrl: '/samples/button.svg', xPct: 15, yPct: 45, wPct: 40, hPct: 6 },
    { imageUrl: '/samples/bottom_banner.svg', xPct: 0, yPct: 89, wPct: 100, hPct: 11, align: 'center' },
  ],
};

// The wide archetype's logo/headline/button gaps, tightened for both wide sub-cases (see
// buildWideOverlay below) — the shared table's button sits noticeably further from headline than
// headline sits from logo (11% vs 5%); this tightens both gaps down to roughly the same amount,
// closer to how they read grouped together in the original primary banner design.
const TIGHT_STACK: OverlaySpec[] = [
  { imageUrl: '/samples/logo.svg', xPct: 54, yPct: 13, wPct: 12, hPct: 7 },
  { imageUrl: '/samples/headline.svg', xPct: 54, yPct: 21, wPct: 24, hPct: 10 },
  { imageUrl: '/samples/button.svg', xPct: 54, yPct: 33, wPct: 15, hPct: 11 },
];
// Same logo+headline positions as TIGHT_STACK, but for the super-wide sub-case button moves out
// of the vertical stack entirely — it sits to the right of the logo+headline block instead,
// vertically centered on it (block spans TIGHT_STACK[0].yPct to TIGHT_STACK[1] bottom, i.e. 13-31).
// Its box is capped at this width and computed dynamically in buildWideOverlay below, rather than
// from a fixed xPct like every other element — at very narrow sizes (728×90, 320×50) a fixed
// column would collide with the bottom banner's own (also dynamically sized) strip on the right.
const SUPER_WIDE_BUTTON_MAX_WPCT = 15;
const SUPER_WIDE_BUTTON_HPCT = 11;
const SUPER_WIDE_BUTTON_CENTER_Y = 22;
const SUPER_WIDE_BUTTON_GAP_PCT = 1.5;

/**
 * Buckets a size into one of 3 shapes by aspect ratio, per position-overlay-spec.md: wide ≥ 1.5:1,
 * tall ≤ 0.8:1, everything between is square. Deliberately separate from size-class.ts's 5-bucket
 * `SizeClass` (wide/landscape/square/portrait/tall) — that one drives real rule-set adaptation
 * elsewhere, this one only picks which of the 3 authored position tables above to reuse.
 */
function getArchetype(width: number, height: number): Archetype {
  const ratio = width / height;
  if (ratio >= 1.5) return 'wide';
  if (ratio <= 0.8) return 'tall';
  return 'square';
}

/**
 * Scales `native` down (never up) to fit inside `box`, preserving its own aspect ratio — same
 * math as CSS `object-fit: contain`. Every element is rendered with `background-size: cover`
 * elsewhere in the app, so without this a box whose ratio doesn't match the asset's own (e.g. a
 * wide logo dropped into a tall archetype's narrower box) would crop its edges instead of just
 * appearing smaller.
 */
function fitWithinBox(box: { w: number; h: number }, native: { w: number; h: number }) {
  const scale = Math.min(1, box.w / native.w, box.h / native.h);
  return { w: native.w * scale, h: native.h * scale };
}

function placeSpec(spec: OverlaySpec, width: number, height: number, overrideYCenterPct?: number): LayoutElement {
  const box = { x: (spec.xPct / 100) * width, y: (spec.yPct / 100) * height, w: (spec.wPct / 100) * width, h: (spec.hPct / 100) * height };
  const native = NATIVE_SIZE[spec.imageUrl];
  const { w, h } = fitWithinBox(box, native);
  const x = spec.align === 'center' ? box.x + (box.w - w) / 2 : box.x;
  const y = overrideYCenterPct !== undefined ? (overrideYCenterPct / 100) * height - h / 2 : box.y;
  return {
    id: nextId('el'),
    kind: 'image',
    slot: null,
    imageUrl: spec.imageUrl,
    focalPoint: { x: 0.5, y: 0.5 },
    frame: { x, y, w, h },
    style: {},
    visible: true,
  };
}

// Brand blue for the real-text bottom banner below (a solid fill reads fine at these sizes — the
// SVG asset's own left-to-right gradient doesn't survive being squeezed this small anyway).
// Sampled from bottom_banner.svg's own gradient stops.
const BOTTOM_BANNER_BLUE = '#2F86BE';
const BOTTOM_BANNER_TEXT = '新発売セット';

function textBanner(frame: { x: number; y: number; w: number; h: number }, fontSize: number): LayoutElement {
  return {
    id: nextId('el'),
    kind: 'text',
    slot: null,
    content: BOTTOM_BANNER_TEXT,
    focalPoint: { x: 0.5, y: 0.5 },
    frame,
    style: { fill: BOTTOM_BANNER_BLUE, color: '#ffffff', fontWeight: 700, fontSize },
    visible: true,
  };
}

/**
 * A compact horizontal bar pinned to the bottom edge — used by the landscape-wide sizes (1280×720,
 * 1200×628, 970×600, ...). Reads as real text at a modest, fixed size rather than reusing
 * bottom_banner.svg's own (much larger) baked-in text, so the height only needs to wrap that
 * text plus a little padding instead of the fixed ~10-20% of canvas height the old image asset
 * needed to stay legible.
 */
function buildBottomBannerAutoHeight(width: number, height: number): LayoutElement {
  const fontSize = 22;
  const paddingY = fontSize * 0.7;
  const h = fontSize + paddingY * 2;
  return textBanner({ x: 0, y: height - h, w: width, h }, fontSize);
}

// ~1em per full-width CJK character, plus 0.8em padding on each side.
const BANNER_CHAR_FACTOR = BOTTOM_BANNER_TEXT.length + 1.6;
// Never shrunk smaller than this, even when the button needs the room — below it the text stops
// reading as a legible (if small) label and starts reading as a broken smear of pixels.
const BANNER_MIN_FONT = 6;

function bannerWidthForFont(fontSize: number) {
  return fontSize * BANNER_CHAR_FACTOR;
}

/**
 * A compact horizontal bar pinned to the right edge, full height — used by the super-wide sizes
 * (1500×300, 728×90, 320×50, ...). The text still reads left-to-right (not rotated); only its
 * width is sized to wrap it, since a horizontal line of text can't fill the full available height
 * the way a vertical stack of characters would. `maxWidth` lets the caller shrink the font (down
 * to BANNER_MIN_FONT) when the button beside it needs the room — see buildWideOverlay.
 */
function buildBottomBannerAutoWidth(width: number, height: number, maxWidth: number): LayoutElement {
  const idealFontSize = Math.min(24, Math.max(14, height * 0.2));
  const fontSize = Math.max(BANNER_MIN_FONT, Math.min(idealFontSize, maxWidth / BANNER_CHAR_FACTOR));
  const w = bannerWidthForFont(fontSize);
  return textBanner({ x: width - w, y: 0, w, h: height }, fontSize);
}

// width/height at or above this counts as "super wide" (skinny banner strips like 1500×300,
// 728×90, 320×50) — short enough on height that a horizontal bottom bar would be a sliver, so it
// moves to a strip on the right instead, and coupon/button both re-center vertically to make
// better use of the leftover height. Below it (landscape-ish wide shapes like 1280×720), there's
// enough height that a bar along the bottom and the original top-left coupon read fine as-is.
const SUPER_WIDE_MIN_RATIO = 5;

function buildWideOverlay(width: number, height: number): LayoutElement[] {
  const coupon = ARCHETYPE_POSITIONS.wide[0];
  const isSuperWide = width / height >= SUPER_WIDE_MIN_RATIO;

  if (isSuperWide) {
    // Logo/headline keep their tight vertical stack, left-aligned; button moves out of that stack
    // to sit beside it on the right instead, vertically centered on the logo+headline block. Both
    // it and the bottom banner's strip compete for the same leftover lane to the right of
    // headline — at very narrow sizes (728×90, 320×50) there isn't room for both at their ideal
    // size, so the button's height-capped render width is reserved first (a fully invisible
    // button reads as more obviously broken than slightly smaller banner text) and the banner's
    // font shrinks to fit whatever's left, no smaller than BANNER_MIN_FONT.
    const [logo, headline] = TIGHT_STACK;
    const gapPx = (SUPER_WIDE_BUTTON_GAP_PCT / 100) * width;
    const headlineRightEdge = ((headline.xPct + headline.wPct) / 100) * width;
    const laneWidth = Math.max(0, width - headlineRightEdge - gapPx);

    const buttonBoxH = (SUPER_WIDE_BUTTON_HPCT / 100) * height;
    const buttonNative = NATIVE_SIZE['/samples/button.svg'];
    // The most width the button could ever render at, capped by its own height box — reserving
    // more than this would just be wasted space, never wider than useful.
    const buttonMaxRenderW = Math.min((SUPER_WIDE_BUTTON_MAX_WPCT / 100) * width, buttonBoxH * (buttonNative.w / buttonNative.h));
    const bannerMinW = bannerWidthForFont(BANNER_MIN_FONT);
    const buttonBoxW = Math.max(0, Math.min(buttonMaxRenderW, laneWidth - gapPx - bannerMinW));

    const bottomBanner = buildBottomBannerAutoWidth(width, height, laneWidth - buttonBoxW - gapPx);
    const { w: buttonW, h: buttonH } = fitWithinBox({ w: buttonBoxW, h: buttonBoxH }, buttonNative);
    const button: LayoutElement = {
      id: nextId('el'),
      kind: 'image',
      slot: null,
      imageUrl: '/samples/button.svg',
      focalPoint: { x: 0.5, y: 0.5 },
      frame: { x: headlineRightEdge + gapPx, y: (SUPER_WIDE_BUTTON_CENTER_Y / 100) * height - buttonH / 2, w: buttonW, h: buttonH },
      style: {},
      visible: true,
    };
    return [placeSpec(coupon, width, height, 50), placeSpec(logo, width, height), placeSpec(headline, width, height), button, bottomBanner];
  }

  // Logo/headline/button form one tight vertical stack, left-aligned — coupon keeps its own
  // top-left corner position per position-overlay-spec.md.
  return [placeSpec(coupon, width, height), ...TIGHT_STACK.map((spec) => placeSpec(spec, width, height)), buildBottomBannerAutoHeight(width, height)];
}

/**
 * Builds the coupon/logo/headline/button/bottom_banner overlay for a freshly generated size,
 * positioned from its archetype's percentage table — a visual mock (per the spec, "no real layout
 * computation needed"), not real auto-layout.
 */
export function buildOverlayElements(width: number, height: number): LayoutElement[] {
  const archetype = getArchetype(width, height);
  if (archetype === 'wide') return buildWideOverlay(width, height);
  return ARCHETYPE_POSITIONS[archetype].map((spec) => placeSpec(spec, width, height));
}
