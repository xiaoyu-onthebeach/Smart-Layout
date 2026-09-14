import type { Layout, LayoutElement } from '@/types';

export type ExportFileType = 'PNG' | 'JPG';

// The exact strings `create-layout.ts` seeds an empty slot with — an export should only ever
// include real content, never the editor's own "still needs filling in" hints.
const PLACEHOLDER_TEXT_VALUES = new Set([
  'Add headline',
  'Add sub message',
  'Add price',
  'Add CTA',
  '見出しを追加',
  'サブメッセージを追加',
  '価格を追加',
  'CTAを追加',
]);

function isPlaceholderElement(element: LayoutElement): boolean {
  if (element.kind === 'image') return !element.imageUrl;
  if (element.kind === 'text') return PLACEHOLDER_TEXT_VALUES.has(element.content ?? '');
  return false;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Maps a 0-1 focal coordinate to the nearest `preserveAspectRatio` alignment bucket — an
 * approximation of CSS `background-position` cover-cropping using only native SVG (no
 * `foreignObject`, which taints the canvas on rasterization regardless of same-origin content). */
function alignBucket(focal: number, min: string, mid: string, max: string): string {
  return focal < 1 / 3 ? min : focal > 2 / 3 ? max : mid;
}

let clipIdCounter = 0;

/** Mirrors ElementRenderer's visuals (see ElementRenderer.tsx) using plain SVG primitives, in real
 * px rather than the live artboard's percentage/cqw units — an export is always rendered at its
 * own final size, so there's no responsive container to scale against. */
function elementSvg(element: LayoutElement): string {
  const { frame, style } = element;
  const opacity = style.opacity !== undefined ? style.opacity / 100 : undefined;
  const opacityAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';

  if (element.kind === 'image') {
    const focal = element.focalPoint ?? { x: 0.5, y: 0.5 };
    const align = `x${alignBucket(focal.x, 'Min', 'Mid', 'Max')}Y${alignBucket(focal.y, 'Min', 'Mid', 'Max')} slice`;
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const flip = [element.flipX && `translate(${cx} 0) scale(-1 1) translate(${-cx} 0)`, element.flipY && `translate(0 ${cy}) scale(1 -1) translate(0 ${-cy})`]
      .filter(Boolean)
      .join(' ');
    const clipId = `export-clip-${clipIdCounter++}`;
    const border = style.strokeWidth
      ? `<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${style.radius ?? 0}" fill="none" stroke="${style.strokeColor ?? '#000000'}" stroke-width="${style.strokeWidth}" />`
      : '';
    return `<g${opacityAttr}${flip ? ` transform="${flip}"` : ''}>
      <clipPath id="${clipId}"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${style.radius ?? 0}" /></clipPath>
      <g clip-path="url(#${clipId})">
        <image href="${escapeXml(element.imageUrl ?? '')}" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" preserveAspectRatio="${align}" />
      </g>
      ${border}
    </g>`;
  }

  if (element.kind === 'shape') {
    const fill = style.fill ?? '#d4d4d8';
    const stroke = style.strokeWidth ? ` stroke="${style.strokeColor ?? '#000000'}" stroke-width="${style.strokeWidth}"` : '';
    if (element.shape === 'ellipse') {
      return `<ellipse cx="${frame.x + frame.w / 2}" cy="${frame.y + frame.h / 2}" rx="${frame.w / 2}" ry="${frame.h / 2}" fill="${fill}"${stroke}${opacityAttr} />`;
    }
    return `<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${style.radius ?? 0}" fill="${fill}"${stroke}${opacityAttr} />`;
  }

  // text
  const align = style.align === 'center' ? 'center' : style.align === 'right' ? 'right' : 'left';
  const textAnchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? frame.x + frame.w / 2 : align === 'right' ? frame.x + frame.w : frame.x;
  const y = frame.y + frame.h / 2;
  const decoration = style.textDecoration && style.textDecoration !== 'none' ? ` text-decoration="${style.textDecoration}"` : '';
  const letterSpacing = style.letterSpacing ? ` letter-spacing="${style.letterSpacing}px"` : '';
  const writingMode = style.writingMode ? ` writing-mode="${style.writingMode}"` : '';
  const stretchTransform = style.stretch ? ` transform="translate(${x} ${y}) scale(${1 + style.stretch / 100} 1) translate(${-x} ${-y})"` : '';
  const pillFill = style.fill ? `<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${style.radius ?? 0}" fill="${style.fill}" />` : '';
  return `${pillFill}<text x="${x}" y="${y}" text-anchor="${textAnchor}" dominant-baseline="central" fill="${style.color ?? '#18181b'}" font-weight="${style.fontWeight ?? 400}"${
    style.fontFamily ? ` font-family="${escapeXml(style.fontFamily)}"` : ''
  } font-size="${style.fontSize ?? 16}"${letterSpacing}${decoration}${writingMode}${stretchTransform}>${escapeXml(element.content ?? '')}</text>`;
}

/** Builds a self-contained, pure-SVG rendering of `layout` (no `foreignObject` — browsers taint any
 * canvas rasterized from an SVG containing one, even for entirely same-origin content), so it
 * doubles as both the ".svg" export and the source image for the ".png" rasterization path. */
function buildSvgMarkup(layout: Layout): string {
  const { width, height } = layout.size;
  const background = layout.backgroundColor ?? '#131316';
  const border = layout.borderWidth ? ` stroke="${layout.borderColor ?? '#2f2f37'}" stroke-width="${layout.borderWidth}"` : '';
  const elementsSvg = layout.elements.filter((el) => !isPlaceholderElement(el)).map(elementSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${background}"${border} />
    ${elementsSvg}
  </svg>`;
}

/** JPG has no transparency, so it needs its own opaque background painted before the layout draws
 * on top — canvas defaults to transparent black otherwise, which would show through as black. */
function rasterizeToRaster(layout: Layout, mime: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const svgUrl = URL.createObjectURL(new Blob([buildSvgMarkup(layout)], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = layout.size.width;
      canvas.height = layout.size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      if (mime === 'image/jpeg') {
        ctx.fillStyle = layout.backgroundColor ?? '#131316';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(svgUrl);
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode image'));
        },
        mime,
        mime === 'image/jpeg' ? 0.92 : undefined,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to rasterize layout'));
    };
    img.src = svgUrl;
  });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Renders `layout` to `fileType` and hands the result straight to the browser's own download flow. */
export async function exportLayout(layout: Layout, fileType: ExportFileType): Promise<void> {
  const filename = `${layout.size.label || 'banner'}.${fileType.toLowerCase()}`;
  const blob = await rasterizeToRaster(layout, fileType === 'JPG' ? 'image/jpeg' : 'image/png');
  triggerBlobDownload(blob, filename);
}
