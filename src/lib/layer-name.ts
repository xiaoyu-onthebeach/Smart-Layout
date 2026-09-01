import type { LayoutElement } from '@/types';

/** Synthesizes a human-readable layer name from an element's slot/kind — there's no explicit `name` field. */
export function layerName(el: LayoutElement): string {
  switch (el.slot) {
    case 'image':
      return 'Image';
    case 'headline':
      return 'Headline';
    case 'subMessage':
      return 'Sub message';
    case 'price':
      return 'Price';
    case 'cta':
      return 'Button';
    case 'badge':
      return 'Badge';
    default:
      return el.kind === 'shape' ? 'Shape' : el.kind === 'text' ? 'Text' : 'Image';
  }
}
