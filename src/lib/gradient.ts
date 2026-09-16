/** A gradient fill is stored as a plain CSS `linear-gradient(...)` string in the very same `string`
 * fields that otherwise hold a solid hex color (`Layout.backgroundColor`, `style.fill`,
 * `style.color`, ...) — no separate "kind" flag anywhere in the data model. `isGradient` is how
 * every read site (rendering, the color picker) tells which of the two a given value actually is. */
export type GradientStop = { position: number; color: string };

const GRADIENT_RE = /^linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)$/i;
const STOP_RE = /^(#[0-9a-fA-F]{3,8})\s+([\d.]+)%$/;

export function isGradient(value: string | undefined): value is string {
  return !!value && GRADIENT_RE.test(value.trim());
}

export function serializeGradient(stops: GradientStop[], angle: number): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  return `linear-gradient(${angle}deg, ${sorted.map((s) => `${s.color} ${s.position}%`).join(', ')})`;
}

export function parseGradient(value: string): { angle: number; stops: GradientStop[] } | null {
  const match = value.trim().match(GRADIENT_RE);
  if (!match) return null;
  const stops = match[2].split(',').map((part) => {
    const m = part.trim().match(STOP_RE);
    return m ? { color: m[1].toUpperCase(), position: Number(m[2]) } : null;
  });
  if (stops.some((s) => s === null) || stops.length === 0) return null;
  return { angle: Number(match[1]), stops: stops as GradientStop[] };
}
