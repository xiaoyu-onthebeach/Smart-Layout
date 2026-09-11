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

export type RatioBucket = 'square' | 'horizontal' | 'vertical';

/**
 * Coarser 3-way bucket used by the left panel's "Square/Horizontal/Vertical sizes" grouping and by
 * the "add more sizes" picker's own filtering (only sizes in the same bucket as the scene the
 * picker was opened from are offered) — deliberately separate from `classify`'s finer 5-way
 * `SizeClass`, which drives rule-set adaptation elsewhere and isn't about panel organization.
 */
export function classifyRatioBucket(width: number, height: number): RatioBucket {
  const ratio = width / height;
  if (ratio > 1.5) return 'horizontal';
  if (ratio < 1 / 1.5) return 'vertical';
  return 'square';
}
