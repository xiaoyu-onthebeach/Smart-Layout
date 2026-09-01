import { SAMPLE_IMAGES } from '@/lib/sample-images';
import { useT } from '@/lib/i18n';

/** Left panel's Assets card: a scrollable grid of stock photos — drag one onto any banner frame
 * on the canvas to add it as a new image layer there. */
export function AssetsPanel() {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border border-chrome-border p-2" style={{ background: '#19191D' }}>
      <span className="px-1 text-[11px] font-semibold tracking-[-0.01em] text-white/70 uppercase">{t('Assets')}</span>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="columns-2 gap-2">
          {SAMPLE_IMAGES.map((item) => (
            <div
              key={item.file}
              title={item.label}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.url);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="mb-2 block w-full cursor-grab overflow-hidden rounded-lg active:cursor-grabbing"
              style={{ breakInside: 'avoid' }}
            >
              <img src={item.url} alt={item.label} draggable={false} className="block w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
