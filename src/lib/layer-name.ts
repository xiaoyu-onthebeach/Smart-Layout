import type { LayoutElement } from '@/types';

/** Synthesizes a human-readable layer name from an element's slot/kind, or an explicit `name` when
 * one was given at creation (SVG-imported/drawn vectors — see svg-import.ts). */
export function layerName(el: LayoutElement): string {
  if (el.name) return el.name;
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
      return el.kind === 'shape' ? 'Shape' : el.kind === 'text' ? 'Text' : el.kind === 'vector' ? 'Vector' : 'Image';
  }
}
