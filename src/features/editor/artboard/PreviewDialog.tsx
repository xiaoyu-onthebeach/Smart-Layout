import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import type { Layout } from '@/types';
import { ArtboardFrame } from './ArtboardFrame';

const MAX_WIDTH = 720;
const MAX_HEIGHT = 640;

/** A read-only "quick look" at a scene, full size within reason — no editing affordances, no
 * activation, just the rendered banner (reuses `ArtboardFrame` itself so it can never drift from
 * what the real canvas shows). */
export function PreviewDialog({ layout, open, onOpenChange }: { layout: Layout; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { width: nativeWidth, height: nativeHeight } = layout.size;
  const ratio = nativeWidth / nativeHeight;
  let width = Math.min(MAX_WIDTH, nativeWidth);
  let height = width / ratio;
  if (height > MAX_HEIGHT) {
    height = MAX_HEIGHT;
    width = height * ratio;
  }
  const scale = width / nativeWidth;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-none border-chrome-border bg-[#131316] p-6">
        <DialogTitle className="sr-only">{t('Preview')}</DialogTitle>
        <ArtboardFrame layout={layout} scale={scale} width={width} height={height} active={false} showEmptyStateHint={false} />
      </DialogContent>
    </Dialog>
  );
}
