import type { SizeClass } from '@/types';

/** classify(w, h) => SizeClass — pure, no React. Thresholds per brief §Screen 6. */
export function classify(width: number, height: number): SizeClass {
  const ratio = width / height;
  if (ratio >= 2) return 'wide';
  if (ratio <= 0.5) return 'tall';
  if (ratio >= 0.9 && ratio <= 1.11) return 'square';
  if (ratio > 1.11) return 'landscape';
  return 'portrait';
}
