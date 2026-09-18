import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  BORDER_STYLE_ICONS,
  CornerRadiusRow,
  ImageHoverReplace,
  INLINE_VALUE_COL_WIDTH,
  InlineColorField,
  InlineRow,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  MatchSelectButton,
  PositionSection,
  SegmentedControl,
  ShadowSection,
  type EditorTarget,
} from './PanelKit';
import { ImagePickerDialog } from './ImagePickerDialog';

type SolidBorderStyle = 'solid' | 'dashed' | 'dotted';
const BORDER_STYLE_LABELS: Record<SolidBorderStyle, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/**
 * The Image panel's own "Fill" control — an image's fill *is* the image itself, so the swatch is a
 * small rounded-rect thumbnail of it (not a color circle), the label just reads "Image" (there's no
 * hex code to show), and clicking the thumbnail opens a preview of the full image with a "Replace"
 * button, not a color picker. Opacity is real here (backed by `style.opacity`, which `ImageBox`
 * already renders) — unlike the same-looking opacity field on a plain color fill elsewhere, which
 * has no per-fill alpha to actually change.
 */
function ImageFillField({
  imageUrl,
  opacity,
  onOpacityCommit,
  onReplace,
}: {
  imageUrl: string | undefined;
  opacity: number;
  onOpacityCommit: (value: number) => void;
  onReplace: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  // Same virtual-anchor technique ColorPickerPopover uses — decouples the popover's floating
  // position from the trigger's own varying indent, and recomputed fresh every render so Popper's
  // reference-equality check re-feeds floating-ui a current rect.
  const virtualAnchorRef = useRef({ getBoundingClientRect: () => new DOMRect() });
  if (anchor) {
    const { left, top } = anchor;
    virtualAnchorRef.current = { getBoundingClientRect: () => new DOMRect(left, top, 1, 1) };
  }

  // Floats outside the panel to its left (8px gap), top-aligned with the *Styles section* this
  // field lives in — not with this specific row, the way ColorPickerPopover aligns to its own
  // trigger row — since a full image preview reads better anchored to the section's own top than
  // wherever "Fill" happens to fall inside it.
  function handleOpenChange(next: boolean) {
    if (next) {
      const trigger = triggerRef.current;
      const panel = trigger?.closest('[data-panel-card]');
      const section = trigger?.closest('[data-panel-section]');
      const panelRect = (panel ?? trigger)?.getBoundingClientRect();
      const sectionRect = (section ?? trigger)?.getBoundingClientRect();
      if (panelRect && sectionRect) setAnchor({ left: panelRect.left, top: sectionRect.top });
    }
    setOpen(next);
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg pr-2 pl-1" style={{ width: INLINE_VALUE_COL_WIDTH, background: '#26262C' }}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t('Image')}
            className="size-6 shrink-0 rounded-[4px] border border-black/20 bg-cover bg-center"
            style={{ backgroundColor: '#40404A', backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}
          />
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="start"
          sideOffset={8}
          className="border-[#2F2F37] p-4 text-chrome-fg"
          style={{ width: 279, background: '#19191D', borderRadius: 16, boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)' }}
        >
          <ImageHoverReplace onReplace={onReplace}>
            <div
              className="h-[238px] w-[247px] rounded-2xl border bg-cover bg-center"
              style={{ backgroundColor: '#26262C', backgroundImage: imageUrl ? `url(${imageUrl})` : undefined, borderColor: '#40404A' }}
            />
          </ImageHoverReplace>
        </PopoverContent>
      </Popover>
      <span className="min-w-0 flex-1 truncate text-sm text-white">{t('Image')}</span>
      <div className="h-4 w-px shrink-0" style={{ background: '#40404A' }} />
      <div className="flex shrink-0 items-center">
        <input
          defaultValue={String(opacity)}
          key={opacity}
          onBlur={(e) => onOpacityCommit(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-6 bg-transparent text-right text-sm text-white outline-none"
        />
        <span className="text-sm text-white/65">%</span>
      </div>
    </div>
  );
}

/** Right-corner panel shown while one or more image elements are selected — edits broadcast to every target. */
export function ImageEditorPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const [aspectLocked, setAspectLocked] = useState(false);
  const [replacingImage, setReplacingImage] = useState(false);

  function replaceImageUrl(url: string) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { imageUrl: url });
    setReplacingImage(false);
  }

  // Same collapsed-by-default, reset-per-selection convention as the text panel's own Border section.
  const [borderExpanded, setBorderExpanded] = useState(() => (primary.style.strokeWidth ?? 0) > 0);

  const title =
    targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個の画像レイヤー` : `${targets.length} image layers`;

  function patchStyle(patch: Partial<LayoutElement['style']>) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, ...patch } });
  }
  function patchRotation(rotation: number) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { rotation });
  }
  function commitWidth(raw: string) {
    const nextW = Math.max(1, Math.round(Number(raw) || primary.frame.w));
    for (const tgt of targets) {
      const f = tgt.element.frame;
      const nextH = aspectLocked ? Math.max(1, Math.round(f.h * (nextW / f.w))) : f.h;
      updateElement(tgt.layoutId, tgt.element.id, { frame: { ...f, w: nextW, h: nextH } });
    }
  }
  function commitHeight(raw: string) {
    const nextH = Math.max(1, Math.round(Number(raw) || primary.frame.h));
    for (const tgt of targets) {
      const f = tgt.element.frame;
      const nextW = aspectLocked ? Math.max(1, Math.round(f.w * (nextH / f.h))) : f.w;
      updateElement(tgt.layoutId, tgt.element.id, { frame: { ...f, w: nextW, h: nextH } });
    }
  }

  function toggleBorder() {
    if (borderExpanded) {
      patchStyle({ strokeWidth: 0 });
      setBorderExpanded(false);
    } else {
      patchStyle({ strokeWidth: primary.style.strokeWidth || 1, strokeStyle: primary.style.strokeStyle ?? 'solid' });
      setBorderExpanded(true);
    }
  }

  const strokeStyle: SolidBorderStyle = primary.style.strokeStyle ?? 'solid';
  const borderStyleOptions: { value: SolidBorderStyle; label: string; icon: React.ReactNode }[] = (['solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  return (
    <PanelCard gap={16}>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/edit_panel/image%20header.svg" />} title={title} trailing={<MatchSelectButton targets={targets} />} />

      <PositionSection x={primary.frame.x} y={primary.frame.y} showPositionMode={false} resetKey={primary.id} />

      {/* Appended to the same visual section as Position/Alignment above (no divider in between) —
          same Size/Rotation block as the shape panel's own, with a lock toggle to scale W/H together. */}
      <div className="flex flex-col gap-3 px-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/65">{t('Size')}</span>
          <div className="flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm">
              <span className="shrink-0 text-white/65">W</span>
              <input
                type="text"
                defaultValue={String(Math.round(primary.frame.w))}
                key={`${primary.id}-w-${Math.round(primary.frame.w)}`}
                onBlur={(e) => commitWidth(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-0 min-w-0 flex-1 bg-transparent text-right text-white outline-none"
              />
            </div>
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm">
              <span className="shrink-0 text-white/65">H</span>
              <input
                type="text"
                defaultValue={String(Math.round(primary.frame.h))}
                key={`${primary.id}-h-${Math.round(primary.frame.h)}`}
                onBlur={(e) => commitHeight(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-0 min-w-0 flex-1 bg-transparent text-right text-white outline-none"
              />
            </div>
            <button
              type="button"
              aria-label={aspectLocked ? t('Unlock aspect ratio') : t('Lock aspect ratio')}
              onClick={() => setAspectLocked((v) => !v)}
              className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors', aspectLocked ? 'bg-white/15' : 'hover:bg-white/10')}
            >
              <img src="/icons/layer%20list/Unlock%20.svg" alt="" className={cn('size-3.5 transition-opacity', aspectLocked ? 'opacity-100' : 'opacity-45')} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/65">{t('Rotation')}</span>
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm" style={{ width: 119 }}>
            <img src="/icons/angle.svg" alt="" className="size-4 shrink-0" />
            <input
              type="text"
              defaultValue={String(Math.round(primary.rotation ?? 0))}
              key={`${primary.id}-rot-${Math.round(primary.rotation ?? 0)}`}
              onBlur={(e) => patchRotation(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-0 min-w-0 flex-1 bg-transparent text-white outline-none"
            />
            <span className="shrink-0 text-white">°</span>
          </div>
        </div>
      </div>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <InlineRow label={t('Fill')}>
          <ImageFillField
            imageUrl={primary.imageUrl}
            opacity={primary.style.opacity ?? 100}
            onOpacityCommit={(opacity) => patchStyle({ opacity })}
            onReplace={() => setReplacingImage(true)}
          />
        </InlineRow>

        <CornerRadiusRow value={primary.style.radius ?? 0} onCommit={(radius) => patchStyle({ radius })} max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)} />
      </PanelSection>

      <PanelDivider />

      <div className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Border')}</span>
          <button
            type="button"
            aria-label={borderExpanded ? t('Remove border') : t('Add border')}
            onClick={toggleBorder}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {borderExpanded ? <Minus className="size-4" /> : <Plus className="size-4" />}
          </button>
        </div>
        {borderExpanded && (
          <div className="flex flex-col gap-3">
            <InlineRow label={t('Style')}>
              <div style={{ width: INLINE_VALUE_COL_WIDTH }}>
                <SegmentedControl options={borderStyleOptions} value={strokeStyle} onChange={(v) => patchStyle({ strokeStyle: v })} />
              </div>
            </InlineRow>

            <InlineRow label={t('Color')}>
              <InlineColorField color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} />
            </InlineRow>

            <InlineRow label={t('Weight')}>
              <div className="flex" style={{ width: INLINE_VALUE_COL_WIDTH }}>
                <NumberField
                  className="w-[72px]"
                  value={String(primary.style.strokeWidth ?? 1)}
                  onCommit={(v) => patchStyle({ strokeWidth: Math.max(0, Number(v) || 0) })}
                />
              </div>
            </InlineRow>
          </div>
        )}
      </div>

      <PanelDivider />

      <ShadowSection dropShadow={primary.style.dropShadow} innerShadow={primary.style.innerShadow} onPatch={patchStyle} />

      {replacingImage && (
        <ImagePickerDialog open onOpenChange={(open) => !open && setReplacingImage(false)} onSelect={replaceImageUrl} />
      )}
    </PanelCard>
  );
}
