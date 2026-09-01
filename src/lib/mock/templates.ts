import type { LayoutElement, SavedTemplate } from '@/types';

const ACCENT = '#c2410c';
const ACCENT_SOFT = '#fed7aa';
const INK = '#18181b';
const MUTED = '#52525b';

const img = (id: string, src: string, frame: LayoutElement['frame']): LayoutElement => ({
  id,
  kind: 'image',
  slot: 'image',
  imageUrl: src,
  focalPoint: { x: 0.5, y: 0.45 },
  frame,
  style: {},
  visible: true,
});

const text = (
  id: string,
  slot: LayoutElement['slot'],
  content: string,
  frame: LayoutElement['frame'],
  style: LayoutElement['style'],
): LayoutElement => ({ id, kind: 'text', slot, content, frame, style, visible: true });

const shape = (
  id: string,
  shapeKind: NonNullable<LayoutElement['shape']>,
  frame: LayoutElement['frame'],
  style: LayoutElement['style'],
): LayoutElement => ({ id, kind: 'shape', slot: null, shape: shapeKind, frame, style, visible: true });

export const savedTemplates: SavedTemplate[] = [
  {
    id: 'tpl-hero-split-wide',
    name: 'Product hero — split',
    category: 'productHero',
    platformId: 'amazon',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-hero-split-wide',
      size: { width: 1200, height: 600, label: 'Product hero split' },
      sizeClass: 'wide',
      ruleSetId: 'rs-amazon-sponsored-brand',
      adaptationNotes: [],
      elements: [
        img('t1-image', '/samples/black_1.png', { x: 0, y: 0, w: 600, h: 600 }),
        shape('t1-accent', 'ellipse', { x: 620, y: 40, w: 120, h: 120 }, { fill: ACCENT_SOFT }),
        text('t1-headline', 'headline', 'Add headline', { x: 640, y: 190, w: 500, h: 80 }, { fontSize: 44, fontWeight: 700, color: INK, align: 'left' }),
        text('t1-sub', 'subMessage', 'Add sub message', { x: 640, y: 280, w: 480, h: 50 }, { fontSize: 20, fontWeight: 400, color: MUTED, align: 'left' }),
        text('t1-price', 'price', 'Add price', { x: 640, y: 350, w: 200, h: 40 }, { fontSize: 26, fontWeight: 700, color: ACCENT, align: 'left' }),
        text('t1-cta', 'cta', 'Add CTA', { x: 640, y: 420, w: 180, h: 52 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 8, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-sale-badge-square',
    name: 'Sale spotlight — square',
    category: 'salePromo',
    platformId: 'qoo10',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-sale-badge-square',
      size: { width: 800, height: 800, label: 'Sale spotlight' },
      sizeClass: 'square',
      ruleSetId: 'rs-qoo10-promo-tile',
      adaptationNotes: [],
      elements: [
        shape('t2-bg', 'rect', { x: 0, y: 0, w: 800, h: 800 }, { fill: '#fff7ed' }),
        img('t2-image', '/samples/beige_3.png', { x: 140, y: 220, w: 520, h: 420 }),
        text('t2-badge', 'badge', 'Add badge', { x: 40, y: 40, w: 160, h: 44 }, { fontSize: 18, fontWeight: 700, color: '#ffffff', fill: ACCENT, radius: 22, align: 'center' }),
        text('t2-headline', 'headline', 'Add headline', { x: 40, y: 120, w: 720, h: 70 }, { fontSize: 40, fontWeight: 700, color: INK, align: 'left' }),
        text('t2-cta', 'cta', 'Add CTA', { x: 40, y: 690, w: 200, h: 56 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 8, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-multi-trio-landscape',
    name: 'Multi-product trio',
    category: 'multiProduct',
    platformId: 'tiktok',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-multi-trio-landscape',
      size: { width: 1200, height: 628, label: 'Multi-product trio' },
      sizeClass: 'landscape',
      ruleSetId: 'rs-tiktok-feed-banner',
      adaptationNotes: [],
      elements: [
        text('t3-headline', 'headline', 'Add headline', { x: 40, y: 30, w: 1120, h: 60 }, { fontSize: 32, fontWeight: 700, color: INK, align: 'left' }),
        img('t3-image-1', '/samples/black_1.png', { x: 40, y: 120, w: 340, h: 460 }),
        img('t3-image-2', '/samples/blue_1.png', { x: 430, y: 120, w: 340, h: 460 }),
        img('t3-image-3', '/samples/black_3.png', { x: 820, y: 120, w: 340, h: 460 }),
        text('t3-cta', 'cta', 'Add CTA', { x: 480, y: 560, w: 240, h: 52 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 26, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-text-led-tall',
    name: 'Statement — text-led',
    category: 'textLed',
    platformId: 'tiktok',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-text-led-tall',
      size: { width: 720, height: 1280, label: 'Statement text-led' },
      sizeClass: 'tall',
      ruleSetId: 'rs-tiktok-story-banner',
      adaptationNotes: [],
      elements: [
        shape('t4-bg', 'rect', { x: 0, y: 0, w: 720, h: 1280 }, { fill: INK }),
        text('t4-headline', 'headline', 'Add headline', { x: 60, y: 420, w: 600, h: 220 }, { fontSize: 56, fontWeight: 700, color: '#ffffff', align: 'left' }),
        text('t4-sub', 'subMessage', 'Add sub message', { x: 60, y: 660, w: 560, h: 60 }, { fontSize: 22, fontWeight: 400, color: '#d4d4d8', align: 'left' }),
        img('t4-image', '/samples/red_1.png', { x: 60, y: 760, w: 200, h: 200 }),
        text('t4-cta', 'cta', 'Add CTA', { x: 60, y: 1000, w: 220, h: 56 }, { fontSize: 18, fontWeight: 600, color: INK, fill: '#ffffff', radius: 28, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-hero-stack-portrait',
    name: 'Product hero — stacked',
    category: 'productHero',
    platformId: 'rakuten',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-hero-stack-portrait',
      size: { width: 640, height: 960, label: 'Product hero stacked' },
      sizeClass: 'portrait',
      ruleSetId: 'rs-rakuten-mobile-banner',
      adaptationNotes: [],
      elements: [
        img('t5-image', '/samples/red_3.png', { x: 0, y: 0, w: 640, h: 560 }),
        text('t5-headline', 'headline', 'Add headline', { x: 32, y: 590, w: 576, h: 70 }, { fontSize: 32, fontWeight: 700, color: INK, align: 'left' }),
        text('t5-price', 'price', 'Add price', { x: 32, y: 670, w: 200, h: 40 }, { fontSize: 24, fontWeight: 700, color: ACCENT, align: 'left' }),
        text('t5-cta', 'cta', 'Add CTA', { x: 32, y: 740, w: 220, h: 54 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 8, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-sale-strip-wide',
    name: 'Sale strip banner',
    category: 'salePromo',
    platformId: 'amazon',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-sale-strip-wide',
      size: { width: 1500, height: 300, label: 'Sale strip banner' },
      sizeClass: 'wide',
      ruleSetId: 'rs-amazon-brand-hero',
      adaptationNotes: [],
      elements: [
        shape('t6-bg', 'rect', { x: 0, y: 0, w: 1500, h: 300 }, { fill: '#fef3c7' }),
        img('t6-image', '/samples/beige_3.png', { x: 1100, y: 0, w: 400, h: 300 }),
        text('t6-badge', 'badge', 'Add badge', { x: 48, y: 40, w: 140, h: 36 }, { fontSize: 16, fontWeight: 700, color: '#ffffff', fill: ACCENT, radius: 18, align: 'center' }),
        text('t6-headline', 'headline', 'Add headline', { x: 48, y: 96, w: 700, h: 60 }, { fontSize: 38, fontWeight: 700, color: INK, align: 'left' }),
        text('t6-cta', 'cta', 'Add CTA', { x: 48, y: 190, w: 180, h: 48 }, { fontSize: 16, fontWeight: 600, color: '#ffffff', fill: INK, radius: 8, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-multi-grid-square',
    name: 'Multi-product grid',
    category: 'multiProduct',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-multi-grid-square',
      size: { width: 800, height: 800, label: 'Multi-product grid' },
      sizeClass: 'square',
      ruleSetId: 'rs-tiktok-product-card',
      adaptationNotes: [],
      elements: [
        text('t7-headline', 'headline', 'Add headline', { x: 40, y: 32, w: 720, h: 50 }, { fontSize: 28, fontWeight: 700, color: INK, align: 'left' }),
        img('t7-image-1', '/samples/blue_1.png', { x: 40, y: 110, w: 340, h: 340 }),
        img('t7-image-2', '/samples/red_3.png', { x: 420, y: 110, w: 340, h: 340 }),
        text('t7-cta', 'cta', 'Add CTA', { x: 300, y: 700, w: 200, h: 52 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 26, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-text-led-landscape',
    name: 'Statement — banner',
    category: 'textLed',
    platformId: 'yahoo',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-text-led-landscape',
      size: { width: 1200, height: 628, label: 'Statement banner' },
      sizeClass: 'landscape',
      ruleSetId: 'rs-yahoo-shopping-top',
      adaptationNotes: [],
      elements: [
        shape('t8-bg', 'rect', { x: 0, y: 0, w: 1200, h: 628 }, { fill: '#f4f4f5' }),
        text('t8-headline', 'headline', 'Add headline', { x: 100, y: 220, w: 1000, h: 140 }, { fontSize: 52, fontWeight: 700, color: INK, align: 'center' }),
        text('t8-sub', 'subMessage', 'Add sub message', { x: 200, y: 370, w: 800, h: 44 }, { fontSize: 20, fontWeight: 400, color: MUTED, align: 'center' }),
        text('t8-cta', 'cta', 'Add CTA', { x: 500, y: 440, w: 200, h: 52 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 26, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-hero-center-square',
    name: 'Product hero — centered',
    category: 'productHero',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-hero-center-square',
      size: { width: 600, height: 600, label: 'Product hero centered' },
      sizeClass: 'square',
      ruleSetId: 'rs-rakuten-shop-top',
      adaptationNotes: [],
      elements: [
        shape('t9-bg', 'ellipse', { x: 50, y: 50, w: 500, h: 500 }, { fill: '#f0fdf4' }),
        img('t9-image', '/samples/black_3.png', { x: 120, y: 100, w: 360, h: 340 }),
        text('t9-headline', 'headline', 'Add headline', { x: 40, y: 460, w: 520, h: 44 }, { fontSize: 24, fontWeight: 700, color: INK, align: 'center' }),
        text('t9-price', 'price', 'Add price', { x: 40, y: 508, w: 520, h: 34 }, { fontSize: 20, fontWeight: 600, color: ACCENT, align: 'center' }),
      ],
    },
  },
  {
    id: 'tpl-sale-flash-tall',
    name: 'Flash sale — tall',
    category: 'salePromo',
    platformId: 'tiktok',
    thumbnailFrom: 'render',
    layout: {
      id: 'tpl-sale-flash-tall',
      size: { width: 600, height: 1200, label: 'Flash sale tall' },
      sizeClass: 'tall',
      ruleSetId: 'rs-tiktok-live-cover',
      adaptationNotes: [],
      elements: [
        img('t10-image', '/samples/red_1.png', { x: 0, y: 300, w: 600, h: 600 }),
        text('t10-badge', 'badge', 'Add badge', { x: 40, y: 60, w: 180, h: 48 }, { fontSize: 20, fontWeight: 700, color: '#ffffff', fill: ACCENT, radius: 24, align: 'center' }),
        text('t10-headline', 'headline', 'Add headline', { x: 40, y: 940, w: 520, h: 90 }, { fontSize: 32, fontWeight: 700, color: INK, align: 'left' }),
        text('t10-cta', 'cta', 'Add CTA', { x: 40, y: 1050, w: 220, h: 56 }, { fontSize: 18, fontWeight: 600, color: '#ffffff', fill: INK, radius: 28, align: 'center' }),
      ],
    },
  },
];

export function getSavedTemplate(id: string): SavedTemplate | undefined {
  return savedTemplates.find((t) => t.id === id);
}
