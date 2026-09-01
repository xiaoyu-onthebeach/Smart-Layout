import type { MouseEvent as ReactMouseEvent } from 'react';
import { ChevronLeft, Image as ImageIcon, Type } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import type { Layout, LayoutElement } from '@/types';

function LayerThumb({ element }: { element: LayoutElement }) {
  if (element.kind === 'image') {
    if (element.imageUrl) {
      return <div className="size-8 shrink-0 rounded-md bg-cover bg-center" style={{ backgroundImage: `url(${element.imageUrl})` }} />;
    }
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/45">
        <ImageIcon className="size-4" />
      </div>
    );
  }
  if (element.kind === 'shape' || element.style.fill) {
    return <div className="size-8 shrink-0 rounded-md border border-white/10" style={{ background: element.style.fill || '#FFFFFF' }} />;
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/45">
      <Type className="size-4" />
    </div>
  );
}

function LayerRow({ element, selected, onClick }: { element: LayoutElement; selected: boolean; onClick: (e: ReactMouseEvent) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex h-10 w-full shrink-0 items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-white/5', selected && 'bg-white/5')}
    >
      <LayerThumb element={element} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-white">{t(layerName(element))}</span>
    </button>
  );
}

// The default template pre-populates a blank image slot and a few "Add headline"-style text
// stubs so there's somewhere to click/type from the start — but until they actually hold
// something, they aren't real layers yet and shouldn't clutter this list.
const PLACEHOLDER_TEXT = new Set(['Add headline', 'Add sub message', 'Add price', 'Add CTA']);

function isRealLayer(element: LayoutElement): boolean {
  if (element.kind === 'image') return Boolean(element.imageUrl);
  if (element.kind === 'text') return Boolean(element.content) && !PLACEHOLDER_TEXT.has(element.content ?? '');
  return true;
}

function BackgroundRow({ color }: { color: string }) {
  const t = useT();
  return (
    <div className="flex h-10 w-full shrink-0 items-center gap-2 rounded-lg p-1 text-left">
      <div className="size-8 shrink-0 rounded-md border border-white/10" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-white">{t('Background')}</span>
    </div>
  );
}

function SceneLayerRows({
  layout,
  isSelected,
  onSelectElement,
}: {
  layout: Layout;
  isSelected: (elementId: string) => boolean;
  onSelectElement: (elementId: string, e: ReactMouseEvent) => void;
}) {
  return (
    <>
      <BackgroundRow color={layout.backgroundColor || '#FFFFFF'} />
      {layout.elements.filter(isRealLayer).map((el) => (
        <LayerRow key={el.id} element={el} selected={isSelected(el.id)} onClick={(e) => onSelectElement(el.id, e)} />
      ))}
    </>
  );
}

/** Left panel's per-scene view: the selected scene's own layer stack, shown in place of the banner list. */
export function LayersTab({ setId, onBack }: { setId: string; onBack: () => void }) {
  const t = useT();
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const selectElement = useAppStore((s) => s.selectElement);

  const bannerSet = setsById[setId];
  const layout = bannerSet ? layoutsById[bannerSet.sourceLayoutId] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <button type="button" onClick={onBack} className="flex h-6 w-full shrink-0 items-center gap-1 px-1 text-left transition-colors hover:text-white">
        <span className="text-[11px] font-semibold tracking-[-0.01em] text-white/70 uppercase">{t('Back')}</span>
        <ChevronLeft className="size-3 shrink-0 text-white/45" />
        <span className="text-[11px] font-semibold tracking-[-0.01em] text-white uppercase">{t('Layers')}</span>
      </button>
      <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

      {!layout ? (
        <div className="flex flex-1 items-center justify-center px-2 text-center text-xs text-white/45">{t('Select a banner to see its layers')}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          <SceneLayerRows
            layout={layout}
            isSelected={(elementId) => selectedElements.some((r) => r.layoutId === layout.id && r.elementId === elementId)}
            onSelectElement={(elementId, e) => selectElement({ layoutId: layout.id, elementId }, e.shiftKey)}
          />
        </div>
      )}
    </div>
  );
}
