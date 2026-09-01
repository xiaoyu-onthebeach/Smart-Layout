import type { Layout, LayoutElement, SavedTemplate } from '@/types';
import type { Language } from '@/store/types';
import { classify } from './size-class';
import { adaptElementsToSize } from './adapt-elements';

const PLACEHOLDER_TEXT = {
  en: { headline: 'Add headline', subMessage: 'Add sub message', price: 'Add price', cta: 'Add CTA' },
  ja: { headline: '見出しを追加', subMessage: 'サブメッセージを追加', price: '価格を追加', cta: 'CTAを追加' },
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/**
 * Default arrangement for a brand-new empty-slot layout (preset or custom size,
 * no template). This is intentionally simple — the real per-size-class
 * arrangement logic lands in `size-templates.ts` (stage 4) and drives
 * adaptation targets. This only shapes the very first, single source layout.
 */
function emptySlotElements(width: number, height: number, language: Language): LayoutElement[] {
  const sizeClass = classify(width, height);
  const sideBySide = sizeClass === 'wide' || sizeClass === 'landscape';
  const margin = Math.round(Math.min(width, height) * 0.06);
  const ph = PLACEHOLDER_TEXT[language];

  if (sideBySide) {
    const imageW = Math.round(width * 0.5);
    const textX = imageW + margin;
    const textW = width - textX - margin;
    return [
      { id: nextId('el'), kind: 'image', slot: 'image', focalPoint: { x: 0.5, y: 0.5 }, frame: { x: 0, y: 0, w: imageW, h: height }, style: {}, visible: true },
      { id: nextId('el'), kind: 'text', slot: 'headline', content: ph.headline, frame: { x: textX, y: Math.round(height * 0.32), w: textW, h: Math.round(height * 0.16) }, style: { fontSize: Math.round(height * 0.09), fontWeight: 700, color: '#18181b', align: 'left' }, visible: true },
      { id: nextId('el'), kind: 'text', slot: 'subMessage', content: ph.subMessage, frame: { x: textX, y: Math.round(height * 0.5), w: textW, h: Math.round(height * 0.1) }, style: { fontSize: Math.round(height * 0.045), fontWeight: 400, color: '#52525b', align: 'left' }, visible: true },
      { id: nextId('el'), kind: 'text', slot: 'price', content: ph.price, frame: { x: textX, y: Math.round(height * 0.62), w: Math.round(textW * 0.4), h: Math.round(height * 0.08) }, style: { fontSize: Math.round(height * 0.05), fontWeight: 700, color: '#c2410c', align: 'left' }, visible: true },
      { id: nextId('el'), kind: 'text', slot: 'cta', content: ph.cta, frame: { x: textX, y: Math.round(height * 0.74), w: Math.round(textW * 0.5), h: Math.round(height * 0.12) }, style: { fontSize: Math.round(height * 0.045), fontWeight: 600, color: '#ffffff', fill: '#18181b', radius: 8, align: 'center' }, visible: true },
    ];
  }

  const imageH = Math.round(height * 0.58);
  const textY = imageH + margin;
  return [
    { id: nextId('el'), kind: 'image', slot: 'image', focalPoint: { x: 0.5, y: 0.5 }, frame: { x: 0, y: 0, w: width, h: imageH }, style: {}, visible: true },
    { id: nextId('el'), kind: 'text', slot: 'headline', content: ph.headline, frame: { x: margin, y: textY, w: width - margin * 2, h: Math.round(height * 0.1) }, style: { fontSize: Math.round(width * 0.06), fontWeight: 700, color: '#18181b', align: 'left' }, visible: true },
    { id: nextId('el'), kind: 'text', slot: 'subMessage', content: ph.subMessage, frame: { x: margin, y: textY + Math.round(height * 0.12), w: width - margin * 2, h: Math.round(height * 0.08) }, style: { fontSize: Math.round(width * 0.035), fontWeight: 400, color: '#52525b', align: 'left' }, visible: true },
    { id: nextId('el'), kind: 'text', slot: 'price', content: ph.price, frame: { x: margin, y: textY + Math.round(height * 0.21), w: Math.round(width * 0.35), h: Math.round(height * 0.07) }, style: { fontSize: Math.round(width * 0.045), fontWeight: 700, color: '#c2410c', align: 'left' }, visible: true },
    { id: nextId('el'), kind: 'text', slot: 'cta', content: ph.cta, frame: { x: margin, y: textY + Math.round(height * 0.29), w: Math.round(width * 0.4), h: Math.round(height * 0.09) }, style: { fontSize: Math.round(width * 0.04), fontWeight: 600, color: '#ffffff', fill: '#18181b', radius: 8, align: 'center' }, visible: true },
  ];
}

export function createEmptyLayout(opts: {
  setId: string;
  productId: string;
  width: number;
  height: number;
  label: string;
  presetId?: string;
  ruleSetId: string;
  language?: Language;
}): Layout {
  return {
    id: nextId('layout'),
    setId: opts.setId,
    productId: opts.productId,
    size: { width: opts.width, height: opts.height, presetId: opts.presetId, label: opts.label },
    sizeClass: classify(opts.width, opts.height),
    ruleSetId: opts.ruleSetId,
    elements: emptySlotElements(opts.width, opts.height, opts.language ?? 'en'),
    isSource: true,
    detached: false,
    adaptationNotes: [],
  };
}

/** Copies a source layout's elements into a fresh layout at a new size, scaled to fit. */
export function createAdaptedLayout(
  source: Layout,
  opts: { setId: string; productId: string; width: number; height: number; label: string; presetId?: string; ruleSetId: string },
): Layout {
  return {
    id: nextId('layout'),
    setId: opts.setId,
    productId: opts.productId,
    size: { width: opts.width, height: opts.height, presetId: opts.presetId, label: opts.label },
    sizeClass: classify(opts.width, opts.height),
    ruleSetId: opts.ruleSetId,
    elements: adaptElementsToSize(source.elements, source.size, { width: opts.width, height: opts.height }),
    isSource: true,
    detached: false,
    adaptationNotes: [],
  };
}

export function createLayoutFromTemplate(template: SavedTemplate, opts: { setId: string; productId: string }): Layout {
  const idMap = new Map<string, string>();
  const elements = template.layout.elements.map((el) => {
    const id = nextId('el');
    idMap.set(el.id, id);
    return { ...el, id };
  });
  return {
    ...template.layout,
    id: nextId('layout'),
    setId: opts.setId,
    productId: opts.productId,
    elements,
    isSource: true,
    detached: false,
    adaptationNotes: [],
  };
}
