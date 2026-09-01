import { classify } from './size-class';
import type { Language } from '@/store/types';

/** Fallback label for a custom size with no named preset/ratio behind it — reflects the active
 * UI language at creation time, same as any other default content a fresh banner starts with. */
export function genericSizeName(width: number, height: number, language: Language = 'en'): string {
  const sizeClass = classify(width, height);
  if (sizeClass === 'square') return language === 'ja' ? '正方形レイアウト' : 'Square layout';
  if (sizeClass === 'landscape' || sizeClass === 'wide') return language === 'ja' ? '横型レイアウト' : 'Horizontal layout';
  return language === 'ja' ? '縦型レイアウト' : 'Vertical layout';
}
