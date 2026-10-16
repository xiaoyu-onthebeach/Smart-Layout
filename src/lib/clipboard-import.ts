// Shared with ArtboardFrame's real 'paste' keydown handler and the scene right-click menu's "Paste
// here" item — both need to answer "is there something this app's SVG/image import could actually
// use on the clipboard right now", just triggered by a different gesture (a real paste event already
// carries its own `clipboardData`; a menu click has to go ask the async Clipboard API instead).

export type ClipboardImportContent = { kind: 'svg'; text: string } | { kind: 'image'; blob: Blob };

/**
 * Reads the system clipboard (async Clipboard API — the only way to inspect it outside a real paste
 * event) looking for something importable, in the same priority order the real paste handler uses:
 * real SVG markup (its own `image/svg+xml` clipboard type) first, then a plain image (what a design
 * tool's ordinary layer copy puts there, since it doesn't write real vector data), then markup
 * embedded inside plain text/html (e.g. a `<svg>` copied from devtools, or a tool's explicit "copy as
 * SVG" text action). Returns null if nothing usable is found, the API isn't available, or the
 * permission is denied/unavailable — callers treat that as "nothing to paste" rather than erroring.
 */
export async function readPasteableClipboardContent(): Promise<ClipboardImportContent | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (!item.types.includes('image/svg+xml')) continue;
      const text = await (await item.getType('image/svg+xml')).text();
      return { kind: 'svg', text };
    }
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) return { kind: 'image', blob: await item.getType(imageType) };
    }
    for (const item of items) {
      const textType = item.types.includes('text/html') ? 'text/html' : item.types.includes('text/plain') ? 'text/plain' : null;
      if (!textType) continue;
      const text = await (await item.getType(textType)).text();
      const match = text.match(/<svg[\s\S]*?<\/svg>/i);
      if (match) return { kind: 'svg', text: match[0] };
    }
    return null;
  } catch {
    return null;
  }
}
