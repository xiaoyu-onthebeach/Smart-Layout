import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RatioIcon } from '@/components/RatioIcon';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { nextId, createEmptyLayout } from '@/lib/create-layout';
import { nearestPreset } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { canvasRootOf, PAGE_GAP } from '@/lib/canvas-layout';
import { nextAvailableName } from '@/lib/main-size-naming';
import type { BannerSet } from '@/types';

/** Every new main size added via the left panel's "+" starts at this size — a plain empty frame,
 * disambiguated against existing names (see nextAvailableName) rather than offering a choice of
 * starting ratio. */
const DEFAULT_MAIN_SIZE = { width: 600, height: 600, label: 'Main Square' };

function BannerRow({
  width,
  height,
  name,
  selected,
  hidden,
  onClick,
  onToggleHidden,
}: {
  width: number;
  height: number;
  name: string;
  selected: boolean;
  hidden: boolean;
  onClick: () => void;
  onToggleHidden: () => void;
}) {
  const t = useT();
  const displayName = name || `${width}x${height}`;
  return (
    <div
      className={cn(
        'group/row flex h-10 w-full shrink-0 items-center gap-2 rounded-lg py-2 pr-3 pl-[25px] transition-colors hover:bg-[#26262C]',
        selected && 'bg-[#26262C]',
      )}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex shrink-0 items-center gap-1">
          <RatioIcon width={width} height={height} />
          {/* Fixed width, not just shrink-0 — so the name after it always starts at the same x
              regardless of how many digits this particular size's own width x height needs. */}
          <span className="w-[60px] shrink-0 text-sm text-chrome-fg">
            {width}x{height}
          </span>
        </div>
        <span className="min-w-0 truncate text-left text-xs text-white/45">{displayName}</span>
      </button>
      <span
        role="button"
        tabIndex={0}
        aria-label={hidden ? t('Show banner') : t('Hide banner')}
        onClick={(e) => {
          e.stopPropagation();
          onToggleHidden();
        }}
        className={cn(
          'flex shrink-0 cursor-pointer items-center justify-center transition-opacity',
          hidden ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
      >
        <img src={hidden ? '/icons/hide.svg' : '/icons/see.svg'} alt="" className="size-3" />
      </span>
    </div>
  );
}

/**
 * One primary's own row, plus every size that's actually been added *from* it (its real
 * `PageGroup` siblings — never a ratio/shape grouping, and never another primary's own sizes).
 * The ratio icon, size caption, and displayed name reflect the primary itself; clicking the row
 * always opens it, same as any other row; the chevron is a separate hit target that only toggles
 * expand/collapse, once it actually has added sizes to expand into.
 */
function CategoryRow({
  representativeWidth,
  representativeHeight,
  representativeName,
  hasMultiple,
  expanded,
  selected,
  onToggle,
  onSelectSingle,
  children,
}: {
  representativeWidth: number;
  representativeHeight: number;
  /** The primary scene's own name — the row always reads as "which scene", matching what it links to. */
  representativeName: string;
  hasMultiple: boolean;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelectSingle: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex w-full shrink-0 flex-col gap-1">
      <button
        type="button"
        onClick={onSelectSingle}
        aria-label={representativeName}
        className={cn('flex h-10 w-full shrink-0 items-center gap-2 rounded-lg py-2 pr-3 pl-1 text-left transition-colors hover:bg-[#26262C]', selected && 'bg-[#26262C]')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {hasMultiple ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={representativeName}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="flex size-4 shrink-0 items-center justify-center"
            >
              <ChevronDown className={cn('size-4 text-white transition-transform', !expanded && '-rotate-90')} />
            </span>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <div className="flex shrink-0 items-center gap-1">
            <RatioIcon width={representativeWidth} height={representativeHeight} />
            <span className="shrink-0 text-sm text-white">
              {representativeWidth}x{representativeHeight}
            </span>
          </div>
        </div>
        <img src="/icons/primary%20label.svg" alt={t('Primary')} className="h-[19px] w-auto shrink-0" />
      </button>
      {hasMultiple && expanded && <div className="flex w-full shrink-0 flex-col gap-0.5">{children}</div>}
    </div>
  );
}

/** Left panel's default view: every size bucketed into a collapsible Square/Horizontal/Vertical
 * sizes group by its own aspect ratio. */
export function BannersTab() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const pageOrder = useAppStore((s) => s.pageOrder);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectPage = useAppStore((s) => s.selectPage);
  const selectScene = useAppStore((s) => s.selectScene);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);
  const upsertLayout = useAppStore((s) => s.upsertLayout);
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);
  const loadSet = useAppStore((s) => s.loadSet);
  const attachStandalonePage = useAppStore((s) => s.attachStandalonePage);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function handleRowClick(setId: string) {
    selectPage(setId);
    selectScene(setId);
    setActiveCanvas(canvasRootOf(useAppStore.getState(), setId));
  }

  function toggleGroup(primaryId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(primaryId)) next.delete(primaryId);
      else next.add(primaryId);
      return next;
    });
  }

  // Adds one new primary size, positioned to the right of whatever's already sharing the current
  // canvas view (or, if nothing exists yet, as the very first scene). The exact x doesn't need to
  // be tight against real pack widths — MultiPageCanvas's own reflow pass recomputes final
  // cluster-root positions from actual current footprints on every render regardless (see its
  // Pass 2) — it just needs to sort after everything already there.
  //
  // The anchor page/root is "locked in" as an explicit canvasRootByPage entry (pointing at itself)
  // the first time a second scene joins it, rather than reusing its bare id as the shared root
  // going forward: the moment that specific page later grows its own "all sizes" pack, its own id
  // becomes a real PageGroup id, which is a wholly separate concern from *canvas-root* membership
  // (see canvasRootOf) — without this lock, the bundle would fall apart the instant that happens.
  function handleAddMainSize() {
    const state = useAppStore.getState();
    const setId = nextId('set');
    const productId = nextId('product');
    // A second "Main Square" never joins the first as a real PageGroup — see the anchor logic
    // below, which only ever shares a *canvas view*, not pack membership — so its name needs its
    // own disambiguation instead of the collision a real group's siblings would otherwise avoid by
    // not needing distinct names at all.
    const label = nextAvailableName(state, t(DEFAULT_MAIN_SIZE.label));
    const layout = createEmptyLayout({
      setId,
      productId,
      width: DEFAULT_MAIN_SIZE.width,
      height: DEFAULT_MAIN_SIZE.height,
      label,
      presetId: undefined,
      ruleSetId: nearestPreset(DEFAULT_MAIN_SIZE.width, DEFAULT_MAIN_SIZE.height)?.preset.ruleSetId ?? NO_RULES_ID,
      language,
    });
    const bannerSet: BannerSet = { id: setId, name: label, sourceLayoutId: layout.id, layoutIds: [layout.id], productIds: [] };
    upsertLayout(layout);

    if (state.pageOrder.length === 0) {
      loadSet(bannerSet);
      setActiveCanvas(setId);
      return;
    }

    const anchorRoot = state.activeCanvasRootId ?? canvasRootOf(state, state.pageOrder[0]);
    let cursorX = 0;
    let anchorY = 0;
    let foundAny = false;
    for (const id of state.pageOrder) {
      if (canvasRootOf(state, id) !== anchorRoot) continue;
      // A pack sibling shares its primary's resolved canvas root too — skip it here, or whichever
      // sibling happens to sort last in pageOrder would hand its own (irrelevant, often far-away)
      // position to `anchorY`/`cursorX` instead of the actual cluster-root column it belongs to.
      const memberGroup = state.pageGroups[state.pageGroupIdByPage[id]];
      if (memberGroup && memberGroup.memberIds.length > 1 && memberGroup.memberIds[0] !== id) continue;
      const otherSet = state.setsById[id];
      const otherLayout = otherSet ? state.layoutsById[otherSet.sourceLayoutId] : null;
      const pos = state.pagePositions[id] ?? { x: 0, y: 0 };
      const right = pos.x + (otherLayout?.size.width ?? 0);
      if (!foundAny || right > cursorX) cursorX = right;
      anchorY = pos.y;
      foundAny = true;
    }
    if (foundAny) cursorX += PAGE_GAP;

    loadSet(bannerSet, { x: cursorX, y: anchorY });
    // The very first time a second column joins `anchorRoot`, canvasRootOrder needs seeding with
    // whichever page is *actually* anchoring that canvas view — anchorRoot itself when it's a bare
    // page, but a real PageGroup's own primary page id when `anchorRoot` already resolved to that
    // group's id (canvasRootOf returns the groupId, not the primary's page id, the moment a pack
    // forms) — otherwise the primary's own id never lands in the order at all and it always sorts
    // last instead of staying the leftmost column.
    if (!state.canvasRootOrder[anchorRoot]?.length) {
      const anchorPrimaryId = state.pageGroups[anchorRoot]?.memberIds[0] ?? anchorRoot;
      attachStandalonePage(anchorPrimaryId, anchorRoot);
    }
    attachStandalonePage(setId, anchorRoot);
    setActiveCanvas(anchorRoot);
  }

  function renderRow(setId: string) {
    const bannerSet = setsById[setId];
    const layout = bannerSet ? layoutsById[bannerSet.sourceLayoutId] : null;
    if (!bannerSet || !layout) return null;
    return (
      <BannerRow
        key={setId}
        width={layout.size.width}
        height={layout.size.height}
        name={bannerSet.name}
        selected={selectedSceneIds.includes(setId)}
        hidden={Boolean(layout.hidden)}
        onClick={() => handleRowClick(setId)}
        onToggleHidden={() => updateLayoutStyle(layout.id, { hidden: !layout.hidden })}
      />
    );
  }

  // Every top-level "cluster root" — a bare standalone page, or a real PageGroup's own primary —
  // gets exactly one row, with that group's actual added sizes (its real siblings) as children.
  // Deliberately NOT grouped by shape/ratio: two unrelated square primaries stay two separate rows,
  // and a primary's own added sizes never get split off into a same-ratio bucket elsewhere.
  const groups: { primaryId: string; siblingIds: string[] }[] = [];
  const seen = new Set<string>();
  for (const id of pageOrder) {
    if (seen.has(id)) continue;
    const group = pageGroups[pageGroupIdByPage[id]];
    const isMultiMemberGroup = Boolean(group && group.memberIds.length > 1);
    if (isMultiMemberGroup && group!.memberIds[0] === id) {
      groups.push({ primaryId: id, siblingIds: group!.memberIds.slice(1) });
      for (const memberId of group!.memberIds) seen.add(memberId);
    } else if (!isMultiMemberGroup) {
      groups.push({ primaryId: id, siblingIds: [] });
      seen.add(id);
    }
    // Otherwise `id` is a sibling whose own primary hasn't been visited yet — shouldn't happen in
    // practice (a primary is always created before its own siblings), so just skip; it'll be
    // captured once its primary's own turn comes up.
  }

  // Only groups that actually have added sizes are collapsible — a lone primary has no chevron at
  // all (see CategoryRow), so it shouldn't count against "everything is collapsed".
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex h-6 w-full shrink-0 items-center justify-between gap-[44px] px-1">
        <span className="truncate text-[11px] font-semibold tracking-[-0.01em] text-white/45 uppercase">{t('Banners')}</span>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('Add banner')}
                onClick={handleAddMainSize}
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2F2F37] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-opacity hover:opacity-80"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('Add new main banner')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col gap-1 pt-1">
        {groups.map(({ primaryId, siblingIds }) => {
          const primarySet = setsById[primaryId];
          const primaryLayout = primarySet ? layoutsById[primarySet.sourceLayoutId] : null;
          if (!primarySet || !primaryLayout) return null;
          return (
            <CategoryRow
              key={primaryId}
              representativeWidth={primaryLayout.size.width}
              representativeHeight={primaryLayout.size.height}
              representativeName={primarySet.name}
              hasMultiple={siblingIds.length > 0}
              expanded={!collapsedGroups.has(primaryId)}
              selected={selectedSceneIds.includes(primaryId)}
              onToggle={() => toggleGroup(primaryId)}
              onSelectSingle={() => handleRowClick(primaryId)}
            >
              {siblingIds.map((id) => renderRow(id))}
            </CategoryRow>
          );
        })}
        {pageOrder.length === 0 && <span className="px-1 text-xs text-white/45">{t('No banners yet.')}</span>}
      </div>
    </div>
  );
}
