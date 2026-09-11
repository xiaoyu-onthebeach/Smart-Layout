import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { RatioIcon } from '@/components/RatioIcon';
import { PlatformMark } from '@/features/size-select/PlatformMark';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { nextId, createEmptyLayout } from '@/lib/create-layout';
import { nearestPreset } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { canvasRootOf, PAGE_GAP } from '@/lib/canvas-layout';
import { classifyRatioBucket, type RatioBucket } from '@/lib/size-class';
import type { BannerSet } from '@/types';
import type { AppState } from '@/store/types';

/** Disambiguates a new scene's name against every existing one — "Main Square", then "Main Square
 * 2", "Main Square 3", etc. — since standalone main sizes never share a real PageGroup (and so
 * never inherit a group's own naming) even when bundled onto one canvas view. */
function nextAvailableName(state: AppState, baseLabel: string): string {
  const existingNames = new Set(Object.values(state.setsById).map((s) => s.name));
  if (!existingNames.has(baseLabel)) return baseLabel;
  let n = 2;
  while (existingNames.has(`${baseLabel} ${n}`)) n++;
  return `${baseLabel} ${n}`;
}

/** The "Add a main banner size" dropdown's three options — each adds just that one new primary,
 * to the right of whatever's already on the current canvas view. */
const MAIN_SIZE_OPTIONS: { width: number; height: number; label: string }[] = [
  { width: 600, height: 600, label: 'Main Square' },
  { width: 1000, height: 600, label: 'Main Horizontal' },
  { width: 600, height: 1000, label: 'Main Vertical' },
];

const BUCKET_ORDER: RatioBucket[] = ['square', 'horizontal', 'vertical'];
const BUCKET_LABEL: Record<RatioBucket, string> = { square: 'Square sizes', horizontal: 'Horizontal sizes', vertical: 'Vertical sizes' };

/** The left panel's "+" — opens a small popover offering the three starting-primary ratios,
 * matching the same card shell (bg #19191D, inset box-shadow) used elsewhere in this panel. */
function AddMainSizeMenu({ onSelect }: { onSelect: (option: (typeof MAIN_SIZE_OPTIONS)[number]) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  return (
    <div ref={ref}>
      <button
        type="button"
        aria-label={t('Add banner')}
        onClick={() => setOpen((v) => !v)}
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-button-primary text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-opacity hover:opacity-80"
      >
        <Plus className="size-3.5" />
      </button>
      {open && (
        // Anchored to the whole "All banners" card (the nearest `relative` ancestor — see
        // LeftPanel), not this button — it should sit just outside the card's own right edge, not
        // float below the button and over the list underneath it.
        <div
          className="absolute top-0 left-full z-30 ml-2 flex w-[167px] flex-col items-start gap-1 rounded-xl p-2"
          style={{ background: '#19191D', boxShadow: 'inset -1px 1px 3px rgba(255,255,255,0.12)' }}
        >
          <span className="w-full truncate px-1 text-[11px] font-semibold tracking-[-0.01em] text-white/45 uppercase">{t('Add a main banner size')}</span>
          {MAIN_SIZE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
              className="flex h-12 w-full shrink-0 items-center gap-3 rounded-lg py-1 text-left transition-colors hover:bg-white/5"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ background: '#2F2F37' }}>
                <RatioIcon width={option.width} height={option.height} />
              </div>
              <span className="truncate text-[13px] text-white">{t(option.label)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BannerRow({
  width,
  height,
  name,
  isPrimary,
  selected,
  platformId,
  onClick,
}: {
  width: number;
  height: number;
  name: string;
  isPrimary: boolean;
  selected: boolean;
  /** The size's own group platform, if any (set when it was added via a platform's size picker) —
   * shown in place of the generic ratio glyph so the row reads as "which platform", not just "what shape". */
  platformId?: string;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex h-10 w-full shrink-0 items-center gap-2 rounded-lg pl-7 pr-3 text-left transition-colors hover:bg-white/5', selected && 'bg-white/5')}
    >
      {platformId ? <PlatformMark platformId={platformId} className="size-6 shrink-0" /> : <RatioIcon width={width} height={height} />}
      <span className="shrink-0 text-sm text-chrome-fg">
        {width}x{height}
      </span>
      {isPrimary && <span className="flex h-[19px] shrink-0 items-center justify-center rounded-md bg-button-primary px-1.5 text-[10px] text-white">{t('Primary')}</span>}
      <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{name}</span>
    </button>
  );
}

/**
 * A "Square/Horizontal/Vertical sizes" group row — the ratio icon and size caption reflect
 * whichever page in the bucket happens to be first (its own representative), which the caller
 * excludes from `children` since a plain child row for that same size would just repeat this
 * header. Clicking the row itself always opens that representative size, same as any other row;
 * the chevron is a separate hit target that only toggles expand/collapse, once a second size lands
 * in the same bucket and there's actually something to expand into.
 */
function CategoryRow({
  bucket,
  representativeWidth,
  representativeHeight,
  hasMultiple,
  expanded,
  selected,
  onToggle,
  onSelectSingle,
  children,
}: {
  bucket: RatioBucket;
  representativeWidth: number;
  representativeHeight: number;
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
        className={cn('flex h-10 w-full shrink-0 items-center gap-2 rounded-xl px-1 text-left transition-colors hover:bg-white/5', selected && 'bg-white/5')}
      >
        {hasMultiple && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex size-4 shrink-0 items-center justify-center"
          >
            <ChevronDown className={cn('size-4 text-white transition-transform', !expanded && '-rotate-90')} />
          </span>
        )}
        <RatioIcon width={representativeWidth} height={representativeHeight} />
        <span className="min-w-0 flex-1 truncate text-sm text-white">{t(BUCKET_LABEL[bucket])}</span>
        <span className="shrink-0 text-xs text-white/45">
          {representativeWidth}x{representativeHeight}
        </span>
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
  const loadSet = useAppStore((s) => s.loadSet);
  const attachStandalonePage = useAppStore((s) => s.attachStandalonePage);

  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<RatioBucket>>(new Set());

  function handleRowClick(setId: string) {
    selectPage(setId);
    selectScene(setId);
    setActiveCanvas(canvasRootOf(useAppStore.getState(), setId));
  }

  function toggleBucket(bucket: RatioBucket) {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
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
  function handleAddMainSize(option: (typeof MAIN_SIZE_OPTIONS)[number]) {
    const state = useAppStore.getState();
    const setId = nextId('set');
    const productId = nextId('product');
    // A second "Main Square" (etc.) never joins the first as a real PageGroup — see the anchor
    // logic below, which only ever shares a *canvas view*, not pack membership — so its name needs
    // its own disambiguation instead of the collision a real group's siblings would otherwise avoid
    // by not needing distinct names at all.
    const label = nextAvailableName(state, t(option.label));
    const layout = createEmptyLayout({
      setId,
      productId,
      width: option.width,
      height: option.height,
      label,
      presetId: undefined,
      ruleSetId: nearestPreset(option.width, option.height)?.preset.ruleSetId ?? NO_RULES_ID,
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
    const group = pageGroups[pageGroupIdByPage[setId]];
    const isPrimary = group?.memberIds[0] === setId;
    return (
      <BannerRow
        key={setId}
        width={layout.size.width}
        height={layout.size.height}
        name={bannerSet.name}
        isPrimary={isPrimary}
        selected={selectedSceneIds.includes(setId)}
        platformId={group?.platformId}
        onClick={() => handleRowClick(setId)}
      />
    );
  }

  const buckets = new Map<RatioBucket, string[]>();
  for (const id of pageOrder) {
    const bannerSet = setsById[id];
    const layout = bannerSet ? layoutsById[bannerSet.sourceLayoutId] : null;
    if (!bannerSet || !layout) continue;
    const bucket = classifyRatioBucket(layout.size.width, layout.size.height);
    const list = buckets.get(bucket) ?? [];
    list.push(id);
    buckets.set(bucket, list);
  }

  // Only buckets with more than one size are actually collapsible — a lone primary has no chevron
  // at all (see CategoryRow), so it shouldn't count against "everything is collapsed".
  const collapsibleBuckets = BUCKET_ORDER.filter((b) => (buckets.get(b)?.length ?? 0) > 1);
  const allCollapsed = collapsibleBuckets.length > 0 && collapsibleBuckets.every((b) => collapsedBuckets.has(b));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex h-6 w-full shrink-0 items-center justify-between gap-[44px] px-1">
        <span className="truncate text-[11px] font-semibold tracking-[-0.01em] text-white/45 uppercase">{t('All banners')}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={allCollapsed ? t('Expand all') : t('Collapse all')}
            onClick={() => setCollapsedBuckets(allCollapsed ? new Set() : new Set(collapsibleBuckets))}
            className="flex size-6 shrink-0 items-center justify-center text-white/45 transition-colors hover:text-white"
          >
            {allCollapsed ? <ChevronsUpDown className="size-3" /> : <ChevronsDownUp className="size-3" />}
          </button>
          <AddMainSizeMenu onSelect={handleAddMainSize} />
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col gap-1 pt-1">
        {BUCKET_ORDER.map((bucket) => {
          const ids = buckets.get(bucket);
          if (!ids || ids.length === 0) return null;
          const first = setsById[ids[0]];
          const firstLayout = first ? layoutsById[first.sourceLayoutId] : null;
          if (!firstLayout) return null;
          return (
            <CategoryRow
              key={bucket}
              bucket={bucket}
              representativeWidth={firstLayout.size.width}
              representativeHeight={firstLayout.size.height}
              hasMultiple={ids.length > 1}
              expanded={!collapsedBuckets.has(bucket)}
              selected={selectedSceneIds.includes(ids[0])}
              onToggle={() => toggleBucket(bucket)}
              onSelectSingle={() => handleRowClick(ids[0])}
            >
              {ids.slice(1).map((id) => renderRow(id))}
            </CategoryRow>
          );
        })}
        {pageOrder.length === 0 && <span className="px-1 text-xs text-white/45">{t('No banners yet.')}</span>}
      </div>
    </div>
  );
}
