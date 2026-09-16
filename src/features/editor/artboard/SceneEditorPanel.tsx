import { useEffect, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { Layout } from '@/types';
import { createAdaptedLayout } from '@/lib/create-layout';
import { getPreset } from '@/lib/mock';
import { autoMainSizeRename } from '@/lib/main-size-naming';
import {
  BORDER_STYLE_ICONS,
  CornerRadiusRow,
  INLINE_VALUE_COL_WIDTH as VALUE_COL_WIDTH,
  InlineColorField,
  InlineRow,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelExportFooter,
  PanelHeaderIcon,
  PanelSection,
  SegmentedControl,
} from './PanelKit';
import { SizeChangeMenu } from './SizeChangeMenu';
import type { QuickSizeResult } from './QuickSizeMenu';

type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';
/** The segmented control inside the (expanded) Border section only ever offers these three — "no
 * border" isn't a style choice in there, it's what collapsing the section back down means. */
type SolidBorderStyle = Exclude<BorderStyle, 'none'>;

const BORDER_STYLE_LABELS: Record<BorderStyle, string> = { none: 'None', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

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
  const strokeStyle: SolidBorderStyle = layout.borderStyle && layout.borderStyle !== 'none' ? layout.borderStyle : 'solid';

  // Whether the Border section shows its Style/Color/Weight fields — a border already present when
  // a scene is first selected starts expanded; one added fresh via the "+" toggle below does too.
  // Reset per scene (not just on mount), since this same panel instance carries over across a
  // plain selection change from one scene to another.
  const [borderExpanded, setBorderExpanded] = useState(() => (layout.borderWidth ?? 0) > 0);
  useEffect(() => {
    setBorderExpanded((layout.borderWidth ?? 0) > 0);
  }, [layout.id]);

  function toggleBorder() {
    if (borderExpanded) {
      updateLayoutStyle(layout.id, { borderWidth: 0 });
      setBorderExpanded(false);
    } else {
      updateLayoutStyle(layout.id, { borderWidth: layout.borderWidth || 1, borderStyle: strokeStyle });
      setBorderExpanded(true);
    }
  }

  const BORDER_OPTIONS: { value: SolidBorderStyle; label: string; icon: React.ReactNode }[] = (['solid', 'dashed', 'dotted'] as const).map((value) => ({
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
      <div className="flex items-center justify-between gap-1.5 px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* The glyph inside this asset's own canvas sits ~1.25px above its true center (more
              transparent padding below it than above) — the icon's own box is already centered
              against the title via `items-center`, this just recenters the glyph within that box. */}
          <PanelHeaderIcon src="/icons/banner%20edit%20panel.svg" style={{ transform: 'translateY(1.25px)' }} />
          <span className="min-w-0 truncate text-[13px] font-semibold text-white">{bannerName}</span>
        </div>
      </div>

      {/* PanelCard's own 16px inter-child gap is 4px more than this pair wants — pulled back in
          with a negative margin rather than touching that shared gap (every other pair of
          sections in this panel still wants the full 16px). */}
      <PanelSection label={t('Size')} style={{ marginTop: -4 }}>
        <SizeChangeMenu onSelect={handleChangeSize} currentWidth={layout.size.width} currentHeight={layout.size.height}>
          <button
            type="button"
            className="flex h-[35px] w-full items-center gap-2 rounded-lg px-2 text-sm text-white"
            style={{ background: '#26262C' }}
          >
            <span className="shrink-0">
              {layout.size.width}x{layout.size.height}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{currentSizeLabel}</span>
            <ChevronDown className="size-4 shrink-0 text-white" />
          </button>
        </SizeChangeMenu>
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <InlineRow label={t('Fill')}>
          <InlineColorField color={layout.backgroundColor ?? '#131316'} onChange={(backgroundColor) => updateLayoutStyle(layout.id, { backgroundColor })} />
        </InlineRow>
        <CornerRadiusRow value={layout.radius ?? 0} onCommit={(radius) => updateLayoutStyle(layout.id, { radius })} />
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
              <div style={{ width: VALUE_COL_WIDTH }}>
                <SegmentedControl options={BORDER_OPTIONS} value={strokeStyle} onChange={(borderStyle) => updateLayoutStyle(layout.id, { borderStyle })} />
              </div>
            </InlineRow>

            <InlineRow label={t('Color')}>
              <InlineColorField color={layout.borderColor ?? '#2f2f37'} onChange={(borderColor) => updateLayoutStyle(layout.id, { borderColor })} />
            </InlineRow>

            <InlineRow label={t('Weight')}>
              {/* Narrower than the shared value-column width, but still starting at its left edge
                  (not centered/right-pinned within it) — same left edge every other row's own
                  control starts from. */}
              <div className="flex" style={{ width: VALUE_COL_WIDTH }}>
                <NumberField
                  className="w-[72px]"
                  value={String(layout.borderWidth ?? 1)}
                  onCommit={(v) => updateLayoutStyle(layout.id, { borderWidth: Math.max(0, Number(v) || 0) })}
                />
              </div>
            </InlineRow>
          </div>
        )}
      </div>

      <PanelExportFooter layouts={[layout]} />
    </PanelCard>
  );
}
