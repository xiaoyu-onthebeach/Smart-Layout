import type { TextAutoLayout } from '@/types';

/** What turning the "Auto Layout" section on starts from — no padding, still hugging both ways. */
export const DEFAULT_TEXT_AUTO_LAYOUT: TextAutoLayout = {
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  hugWidth: true,
  hugHeight: true,
};

/** CSS `padding` in the artboard's own `cqw` units — scaled against `layoutWidth` the same way a
 * text element's font size is, so padding and glyphs zoom together. */
export function autoLayoutPaddingCss(autoLayout: TextAutoLayout, layoutWidth: number): string {
  const { top, right, bottom, left } = autoLayout.padding;
  return [top, right, bottom, left].map((v) => `${(v / layoutWidth) * 100}cqw`).join(' ');
}
