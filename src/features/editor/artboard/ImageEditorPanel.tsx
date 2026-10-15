import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import {
  BORDER_STYLE_ICONS,
  CornerRadiusRow,
  FIELD_ACTIVE_BORDER,
  FIELD_HOVER_BG,
  GridFieldRow,
  IconSlot,
  ImageHoverReplace,
  InlineColorField,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  MatchSelectButton,
  PositionSection,
  RotationRow,
  SectionIconBadge,
  SegmentedControl,
  ShadowSection,
  type EditorTarget,
} from './PanelKit';
import { EditableDimensionsBlock, LayoutShell } from './AutoLayoutSection';
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
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

  const active = open || focused;
  const highlighted = active || hovered;
  return (
    <div
      className="flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border px-1 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: highlighted ? FIELD_HOVER_BG : '#26262C',
        borderColor: active ? FIELD_ACTIVE_BORDER : 'transparent',
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverAnchor virtualRef={virtualAnchorRef} />
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label={t('Image')}
              className="size-[18px] shrink-0 rounded-[4px] border border-black/20 bg-cover bg-center"
              style={{ backgroundColor: '#40404A', backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}
            />
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="start"
            sideOffset={8}
            className="flex flex-col gap-2 border-[#2F2F37] p-4 text-chrome-fg"
            style={{ width: 279, background: '#19191D', borderRadius: 16, boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)' }}
          >
            <div className="flex h-6 items-center gap-1">
              <SectionIconBadge>
                <img src="/icons/edit_panel/image%20header.svg" alt="" className="size-3.5" />
              </SectionIconBadge>
              <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Image')}</span>
            </div>
            <ImageHoverReplace onReplace={onReplace}>
              <div
                className="h-[238px] w-[247px] rounded-2xl border bg-cover bg-center"
                style={{ backgroundColor: '#26262C', backgroundImage: imageUrl ? `url(${imageUrl})` : undefined, borderColor: '#40404A' }}
              />
            </ImageHoverReplace>
          </PopoverContent>
        </Popover>
        <span className="truncate text-[11px] tracking-[-0.01em] text-white">{t('Image')}</span>
      </div>
      <div className="w-px self-stretch shrink-0" style={{ background: '#40404A' }} />
      <div className="flex w-7 shrink-0 items-center">
        <input
          defaultValue={String(opacity)}
          key={opacity}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            onOpacityCommit(Math.min(100, Math.max(0, Number(e.target.value) || 0)));
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-[18px] shrink-0 bg-transparent text-right text-[11px] tracking-[-0.01em] text-white outline-none"
        />
        <span className="shrink-0 text-[11px] tracking-[-0.01em] text-white/65">%</span>
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
    <PanelCard gap={0}>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/edit_panel/panel_image.svg" />} title={title} trailing={<MatchSelectButton targets={targets} />} />

      <PositionSection
        x={primary.frame.x}
        y={primary.frame.y}
        w={primary.frame.w}
        h={primary.frame.h}
        rotation={primary.rotation ?? 0}
        showPositionMode={false}
        resetKey={primary.id}
        extra={<RotationRow rotation={primary.rotation ?? 0} onCommit={patchRotation} />}
      />

      <PanelDivider />

      {/* Unlike text (which fits its content), this box is the thing being sized directly, so W/H
          stay real and editable here, with a lock toggle to scale them together. */}
      <LayoutShell>
        <EditableDimensionsBlock
          w={primary.frame.w}
          h={primary.frame.h}
          locked={aspectLocked}
          onToggleLock={() => setAspectLocked((v) => !v)}
          onCommitW={commitWidth}
          onCommitH={commitHeight}
          resetKey={primary.id}
        />
      </LayoutShell>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2">
            <span className="text-[9px] leading-4 text-white/65">{t('Fill')}</span>
            <ImageFillField
              imageUrl={primary.imageUrl}
              opacity={primary.style.opacity ?? 100}
              onOpacityCommit={(opacity) => patchStyle({ opacity })}
              onReplace={() => setReplacingImage(true)}
            />
          </div>
          <IconSlot />
        </div>

        <CornerRadiusRow value={primary.style.radius ?? 0} onCommit={(radius) => patchStyle({ radius })} max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)} />
      </PanelSection>

      <PanelDivider />

      <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Border')}</span>
          <button
            type="button"
            aria-label={borderExpanded ? t('Remove border') : t('Add border')}
            onClick={toggleBorder}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {borderExpanded ? <Minus className="size-4" /> : <Plus className="size-4" />}
          </button>
        </div>
        {borderExpanded && (
          <div className="flex flex-col gap-2">
            <GridFieldRow label={t('Style')}>
              <SegmentedControl options={borderStyleOptions} value={strokeStyle} onChange={(v) => patchStyle({ strokeStyle: v })} />
            </GridFieldRow>

            <GridFieldRow label={t('Color')}>
              <InlineColorField color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} width={101.5} compact />
            </GridFieldRow>

            <GridFieldRow label={t('Weight')}>
              <NumberField
                scrubbable
                className="w-full bg-[#26262C] text-[11px] font-normal"
                value={String(primary.style.strokeWidth ?? 1)}
                onCommit={(v) => patchStyle({ strokeWidth: Math.max(0, Number(v) || 0) })}
              />
            </GridFieldRow>
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
