import { hexToRgb } from './color';
import type { ShadowStyle } from '@/types';

function shadowColor(shadow: ShadowStyle): string {
  const [r, g, b] = hexToRgb(shadow.color);
  return `rgba(${r}, ${g}, ${b}, ${shadow.opacity / 100})`;
}

/** `box-shadow` value for an image/shape element — real boxes, so both a drop (outer) and inset
 * (inner) shadow render correctly. Returns undefined when neither is enabled. */
export function boxShadowCss(dropShadow?: ShadowStyle, innerShadow?: ShadowStyle): string | undefined {
  const layers: string[] = [];
  if (dropShadow?.enabled) layers.push(`${dropShadow.x}px ${dropShadow.y}px ${dropShadow.blur}px ${shadowColor(dropShadow)}`);
  if (innerShadow?.enabled) layers.push(`inset ${innerShadow.x}px ${innerShadow.y}px ${innerShadow.blur}px ${shadowColor(innerShadow)}`);
  return layers.length ? layers.join(', ') : undefined;
}

/** `text-shadow` value for a text element — CSS has no `inset` text-shadow, so only the drop
 * shadow has a visual equivalent there; an enabled inner shadow on text is stored but no-op. */
export function textShadowCss(dropShadow?: ShadowStyle): string | undefined {
  if (!dropShadow?.enabled) return undefined;
  return `${dropShadow.x}px ${dropShadow.y}px ${dropShadow.blur}px ${shadowColor(dropShadow)}`;
}
