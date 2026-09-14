import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { Layout } from '@/types';
import { createAdaptedLayout } from '@/lib/create-layout';
import { getPreset } from '@/lib/mock';
import { autoMainSizeRename } from '@/lib/main-size-naming';
import { BORDER_STYLE_ICONS, PanelCard, PanelDivider, PanelExportFooter, PanelHeaderIcon, PanelSection, SegmentedControl } from './PanelKit';
import { ColorPickerPopover } from './ColorPickerPopover';
import { SizeChangeMenu } from './SizeChangeMenu';
import type { QuickSizeResult } from './QuickSizeMenu';

type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

const BORDER_STYLE_LABELS: Record<BorderStyle, string> = { none: 'None', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/** Every Fill/Border/Style/Radius control shares this width so their left edges line up — each
 * one's natural content width differs (a color pill vs. a segmented control vs. a number field +
 * toggle), so without a shared width only their *right* edges (pinned by the row's own
 * `justify-between`) would ever align. */
const VALUE_COL_WIDTH = 164;

/** A "label left, control right, one row" field — the banner panel's own layout for Fill/Border/
 * Style/Radius, distinct from the other editor panels' stacked `PanelSection` (label above). */
function InlineRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4">
      <span className="shrink-0 text-xs text-white/65">{label}</span>
      {children}
    </div>
  );
}

/** Fill/Border's value control — swatch, hex, and opacity all inside one pill, divided by a
 * hairline, rather than a separate swatch button beside a field (the shared `ColorRow`'s layout). */
function InlineColorField({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useT();
  return (
    <div className="flex h-9 shrink-0 items-center justify-between rounded-lg px-2" style={{ width: VALUE_COL_WIDTH, background: '#26262C' }}>
      <div className="flex min-w-0 items-center gap-2">
        <ColorPickerPopover color={color} onChange={onChange}>
          <button type="button" aria-label={t('Color')} className="size-6 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
        </ColorPickerPopover>
        <span className="truncate text-sm text-white uppercase">{color}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-4 w-px shrink-0" style={{ background: '#40404A' }} />
        <span className="text-sm text-white/65">100%</span>
      </div>
    </div>
  );
}

/** "Radius" row for the banner panel — clicking "per-corner" reveals a second row of four corner
 * fields below it, each its own rounded box within the panel's own padding (not a joined pill, so
 * nothing can overflow the panel edge the way an unbroken 4-way pill at this width would). Both
 * the toggle and the four fields are decorative, same as the per-corner *button* on the shared
 * `RadiusRow` — no per-corner radius concept exists in the layout engine yet. */
function BannerRadiusRow({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const t = useT();
  const [mode, setMode] = useState<'uniform' | 'corners'>('uniform');
  return (
    <div className="flex flex-col gap-2">
      <InlineRow label={t('Radius')}>
        <div className="flex items-center justify-between" style={{ width: VALUE_COL_WIDTH }}>
          <input
            defaultValue={String(value)}
            key={value}
            onBlur={(e) => onCommit(Math.max(0, Number(e.target.value) || 0))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="flex h-8 w-[68px] items-center justify-center rounded-md bg-[#26262C] text-center text-base font-bold text-white outline-none"
          />
          <div className="flex items-center gap-1 rounded-md p-0.5" style={{ background: '#26262C' }}>
            <button
              type="button"
              aria-label={t('Uniform radius')}
              onClick={() => setMode('uniform')}
              className="flex size-7 items-center justify-center rounded-[5.6px]"
              style={{ background: mode === 'uniform' ? '#131316' : 'transparent' }}
            >
              <img src="/icons/edit_panel/radius_all.svg" alt="" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('Per-corner radius')}
              onClick={() => setMode('corners')}
              className="flex size-7 items-center justify-center rounded-[5.6px]"
              style={{ background: mode === 'corners' ? '#131316' : 'transparent' }}
            >
              <img src="/icons/radius_4.svg" alt="" className="size-3.5" />
            </button>
          </div>
        </div>
      </InlineRow>
      {mode === 'corners' && (
        <div className="flex items-center gap-1 px-4">
          {[0, 1, 2, 3].map((i) => (
            <input key={i} defaultValue="0" className="h-8 min-w-0 flex-1 rounded-md bg-[#26262C] text-center text-sm font-bold text-white outline-none" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Right-corner panel shown while the scene/frame itself (not a child element) is selected. */
export function SceneEditorPanel({ layout, setId }: { layout: Layout; setId: string | undefined }) {
  const t = useT();
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);
  const setsById = useAppStore((s) => s.setsById);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const renamePage = useAppStore((s) => s.renamePage);
  const upsertLayout = useAppStore((s) => s.upsertLayout);

  const bannerName = (setId ? setsById[setId]?.name : undefined) ?? t('New Banner');
  const strokeStyle: BorderStyle = layout.borderStyle ?? 'solid';

  const BORDER_OPTIONS: { value: BorderStyle; label: string; icon: React.ReactNode }[] = (['none', 'solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  // Replaces this banner's own size in place — reuses the same adaptation pass a fresh sibling
  // size gets (reflowing every element's frame to the new dimensions), but keeps this layout's own
  // id so it stays the same scene (and the set's `sourceLayoutId` doesn't need updating).
  function handleChangeSize(result: QuickSizeResult) {
    const adapted = createAdaptedLayout(layout, {
      setId: layout.setId,
      productId: layout.productId,
      width: result.width,
      height: result.height,
      label: result.label,
      presetId: result.presetId,
      ruleSetId: result.ruleSetId,
    });
    upsertLayout({ ...adapted, id: layout.id });

    // A main-size banner's own auto-generated name ("Main Square", "Main Square 2", ...) tracks
    // its shape — but only a cluster root (a bare primary, never one of its own added/sibling
    // sizes), and only while the name still looks auto-generated (see autoMainSizeRename), so a
    // name typed in by hand is never overwritten.
    if (!setId) return;
    const group = pageGroups[pageGroupIdByPage[setId]];
    const isSibling = Boolean(group && group.memberIds.length > 1 && group.memberIds[0] !== setId);
    if (isSibling) return;
    const currentName = setsById[setId]?.name;
    if (!currentName) return;
    const renamed = autoMainSizeRename({ setsById }, currentName, result.width, result.height);
    if (renamed) renamePage(setId, renamed);
  }

  const currentSizeLabel = layout.size.presetId ? (getPreset(layout.size.presetId)?.label ?? layout.size.label) : layout.size.label;

  return (
    <PanelCard gap={16}>
      <div className="flex items-center justify-between gap-1.5 px-4 pb-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <PanelHeaderIcon src="/icons/edit_panel/banner%20header.svg" />
          <span className="min-w-0 truncate text-[13px] font-semibold text-white">{bannerName}</span>
        </div>
      </div>

      <PanelSection label={t('Size')}>
        <SizeChangeMenu onSelect={handleChangeSize}>
          <button
            type="button"
            className="flex h-[35px] w-full items-center gap-2 rounded-lg px-2 text-sm text-white"
            style={{ background: '#26262C' }}
          >
            <span className="min-w-0 flex-1 truncate text-left">{currentSizeLabel}</span>
            <span className="shrink-0 text-xs text-white/45">
              {layout.size.width}x{layout.size.height}
            </span>
            <ChevronDown className="size-4 shrink-0 text-white" />
          </button>
        </SizeChangeMenu>
      </PanelSection>

      <PanelDivider />

      <InlineRow label={t('Fill')}>
        <InlineColorField color={layout.backgroundColor ?? '#131316'} onChange={(backgroundColor) => updateLayoutStyle(layout.id, { backgroundColor })} />
      </InlineRow>

      <InlineRow label={t('Border')}>
        <InlineColorField color={layout.borderColor ?? '#2f2f37'} onChange={(borderColor) => updateLayoutStyle(layout.id, { borderColor })} />
      </InlineRow>

      <InlineRow label={t('Style')}>
        <div style={{ width: VALUE_COL_WIDTH }}>
          <SegmentedControl options={BORDER_OPTIONS} value={strokeStyle} onChange={(borderStyle) => updateLayoutStyle(layout.id, { borderStyle })} />
        </div>
      </InlineRow>

      <BannerRadiusRow value={layout.radius ?? 0} onCommit={(radius) => updateLayoutStyle(layout.id, { radius })} />

      <PanelExportFooter layouts={[layout]} />
    </PanelCard>
  );
}
