import type { MouseEvent as ReactMouseEvent } from 'react';
import { ChevronLeft, EyeOff, Image as ImageIcon, Lock } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import type { Layout, LayoutElement } from '@/types';

/** Fits inside the 32px thumbnail box with a little margin on every side. */
const SHAPE_THUMB_MAX = 20;

function ShapeThumb({ element }: { element: LayoutElement }) {
  const { frame, shape, style } = element;
  const ratio = frame.w / Math.max(frame.h, 1);
  const w = Math.max(4, ratio >= 1 ? SHAPE_THUMB_MAX : SHAPE_THUMB_MAX * ratio);
  const h = Math.max(4, ratio >= 1 ? SHAPE_THUMB_MAX / ratio : SHAPE_THUMB_MAX);
  // The stroke preview scales down with the shape itself, so a big soft-rounded rect on the
  // canvas still reads as a rounded rect here rather than looking like a plain circle.
  const scale = w / frame.w;
  const radius = shape === 'ellipse' ? 9999 : Math.min((style.radius ?? 0) * scale, Math.min(w, h) / 2);
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: '#26262C' }}>
      <div className="shrink-0 border-[1.5px] border-white/45" style={{ width: w, height: h, borderRadius: radius }} />
    </div>
  );
}

function LayerThumb({ element }: { element: LayoutElement }) {
  if (element.kind === 'image') {
    if (element.imageUrl) {
      return <div className="size-8 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${element.imageUrl})` }} />;
    }
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/45">
        <ImageIcon className="size-4" />
      </div>
    );
  }
  if (element.kind === 'shape') {
    return <ShapeThumb element={element} />;
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: '#26262C' }}>
      <img src="/icons/layer list/text.svg" alt="" className="size-4" />
    </div>
  );
}

function LayerRow({
  element,
  layoutId,
  selected,
  onClick,
}: {
  element: LayoutElement;
  layoutId: string;
  selected: boolean;
  onClick: (e: ReactMouseEvent) => void;
}) {
  const t = useT();
  const updateElement = useAppStore((s) => s.updateElement);
  const locked = Boolean(element.locked);
  const visible = element.visible;
  // Locked/hidden layers keep their toggle icons visible at all times (otherwise there'd be no way
  // to tell, or undo, either state without first hovering) — every other row only reveals them on hover.
  const iconsAlwaysShown = locked || !visible;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={locked ? undefined : onClick}
      onKeyDown={(e) => {
        if (!locked && (e.key === 'Enter' || e.key === ' ')) onClick(e as unknown as ReactMouseEvent);
      }}
      className={cn(
        'group/row flex h-10 w-full shrink-0 items-center gap-2 rounded-lg py-1 pr-4 pl-1 text-left transition-colors',
        locked ? 'cursor-not-allowed' : 'cursor-pointer',
        selected ? 'bg-button-primary' : !locked && 'hover:bg-[#26262C]',
      )}
    >
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', !visible && 'opacity-45')}>
        <LayerThumb element={element} />
        <span className="min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-white">{t(layerName(element))}</span>
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center justify-end gap-3 transition-opacity',
          iconsAlwaysShown ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
      >
        <button
          type="button"
          aria-label={locked ? t('Unlock layer') : t('Lock layer')}
          onClick={(e) => {
            e.stopPropagation();
            updateElement(layoutId, element.id, { locked: !locked });
          }}
          className="flex size-4 shrink-0 items-center justify-center text-white/85 transition-colors hover:text-white"
        >
          {locked ? <Lock className="size-4" /> : <img src="/icons/layer list/Unlock .svg" alt="" className="size-4" />}
        </button>
        <button
          type="button"
          aria-label={visible ? t('Hide layer') : t('Show layer')}
          onClick={(e) => {
            e.stopPropagation();
            updateElement(layoutId, element.id, { visible: !visible });
          }}
          className="flex size-4 shrink-0 items-center justify-center text-white/85 transition-colors hover:text-white"
        >
          {visible ? <img src="/icons/layer list/see.svg" alt="" className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
    </div>
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
    <div className="flex h-10 w-full shrink-0 items-center gap-2 rounded-lg py-1 pr-4 pl-1 text-left">
      <div className="size-8 shrink-0 rounded-lg border border-white/10" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-white">{t('Background')}</span>
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
      {/* Newest-added element first — `elements` itself stays oldest-to-newest (that order is
          also z-stacking order, back-to-front, for ElementRenderer), so only the list's own
          display order is reversed here, not the underlying data. */}
      {layout.elements
        .filter(isRealLayer)
        .slice()
        .reverse()
        .map((el) => (
          <LayerRow key={el.id} element={el} layoutId={layout.id} selected={isSelected(el.id)} onClick={(e) => onSelectElement(el.id, e)} />
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
        <span className="min-w-0 truncate text-[11px] font-semibold tracking-[-0.01em] text-white uppercase">{bannerSet?.name ?? t('Layers')}</span>
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
