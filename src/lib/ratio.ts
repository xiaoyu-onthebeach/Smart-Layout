function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Simplified integer ratio label (e.g. "3:2"), falling back to a rounded decimal for awkward ratios. */
export function simplifyRatio(width: number, height: number): string {
  const divisor = gcd(Math.round(width), Math.round(height));
  const w = Math.round(width / divisor);
  const h = Math.round(height / divisor);
  if (w <= 24 && h <= 24) return `${w}:${h}`;
  const ratio = width / height;
  return ratio >= 1 ? `${Math.round(ratio * 10) / 10}:1` : `1:${Math.round((1 / ratio) * 10) / 10}`;
}
