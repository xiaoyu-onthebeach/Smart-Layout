import { useEffect, useMemo, useRef, useState, cloneElement, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { Search, Check, ChevronDown, Plus, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { RatioIcon } from '@/components/RatioIcon';
import { nearestPreset, platforms, sizePresets } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { STANDARD_RATIOS } from '@/features/size-select/standard-ratios';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export type QuickSizeResult = { width: number; height: number; label: string; presetId?: string; ruleSetId: string; platformId?: string };

export type ListItem = { id: string; label: string; width: number; height: number; presetId?: string; ruleSetId: string; platformId?: string };
export type ItemGroup = { id: string; name: string; items: ListItem[] };

function buildGroups(): ItemGroup[] {
  const platformGroups: ItemGroup[] = platforms
    .map((platform) => ({
      id: platform.id,
      name: platform.name,
      items: sizePresets
        .filter((p) => p.platformId === platform.id)
        .map((p) => ({ id: `preset-${p.id}`, label: p.label, width: p.width, height: p.height, presetId: p.id, ruleSetId: p.ruleSetId, platformId: platform.id })),
    }))
    .filter((g) => g.items.length > 0);

  const otherGroup: ItemGroup = {
    id: 'other',
    name: 'Other sizes',
    items: STANDARD_RATIOS.map((r) => {
      const nearest = nearestPreset(r.width, r.height);
      return { id: `ratio-${r.id}`, label: r.name, width: r.width, height: r.height, ruleSetId: nearest?.preset.ruleSetId ?? NO_RULES_ID };
    }),
  };

  return [...platformGroups, otherGroup];
}

export const GROUPS = buildGroups();

export function QuickSizeMenu({
  onConfirm,
  onOpenChange,
  sourceLayoutId,
  children,
}: {
  onConfirm: (results: QuickSizeResult[]) => void;
  onOpenChange?: (open: boolean) => void;
  /** The scene this size-picker was opened from — used by "Pick" to draw a scene-focus rect on it. */
  sourceLayoutId: string;
  children: ReactElement<{ onClick?: (e: ReactMouseEvent) => void }>;
}) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const startPickingFocus = useAppStore((s) => s.startPickingFocus);
  const stopPickingFocus = useAppStore((s) => s.stopPickingFocus);
  const pickingFocusForLayoutId = useAppStore((s) => s.pickingFocusForLayoutId);
  const focusPickConfirmed = useAppStore((s) => s.focusPickConfirmed);
  // True while the on-scene pop-up is showing or the user is still dragging the rect — disables
  // the Pick/Change button below so it can't be re-triggered mid-pick. Once confirmed (or not
  // picking at all), it's enabled again.
  const isPicking = pickingFocusForLayoutId === sourceLayoutId && !focusPickConfirmed;
  const sourceLayout = useAppStore((s) => s.layoutsById[sourceLayoutId]);
  const focusRect = sourceLayout?.focusRect;
  const sourceImageUrl = sourceLayout?.elements.find((el) => el.kind === 'image' && el.imageUrl)?.imageUrl;
  const focusThumbPosition = focusRect
    ? `${((focusRect.x + focusRect.w / 2) / sourceLayout!.size.width) * 100}% ${((focusRect.y + focusRect.h / 2) / sourceLayout!.size.height) * 100}%`
    : '50% 50%';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customEntries, setCustomEntries] = useState<QuickSizeResult[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(GROUPS[0]?.id ?? null);
  const panelRef = useRef<HTMLDivElement>(null);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => !q || item.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const totalSelected = selectedIds.size + customEntries.length;
  const canAddCustom = Number(customWidth) > 0 && Number(customHeight) > 0;

  function reset() {
    setQuery('');
    setCustomMode(false);
    setCustomWidth('');
    setCustomHeight('');
    setSelectedIds(new Set());
    setCustomEntries([]);
    setExpandedGroupId(GROUPS[0]?.id ?? null);
  }

  function closePanel() {
    setOpen(false);
    onOpenChange?.(false);
    reset();
    // Leaving the panel any other way than finishing the focus-rect drag (Cancel, outside-click,
    // or confirming sizes mid-pick) must not leave the picking overlay stuck on top of this scene
    // forever, silently swallowing every future click/double-click aimed at it.
    if (pickingFocusForLayoutId === sourceLayoutId) stopPickingFocus();
  }

  // Outside-click-to-dismiss, since this now renders as a fixed panel rather than an anchored popover.
  // Suppressed while "Pick" is active — drawing the focus rect on the canvas is a click outside the
  // panel too, and shouldn't discard whatever sizes were already selected.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (pickingFocusForLayoutId) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closePanel();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pickingFocusForLayoutId]);

  // The canvas underneath (MultiPageCanvas) zooms on any wheel event within its DOM subtree, via
  // its own native listener — and this panel renders inside that subtree. A React onWheel handler
  // fires too late to stop it (the canvas's raw addEventListener sees the event during native
  // bubbling, before it ever reaches React's own delegated dispatch), so this needs its own native
  // listener on the panel itself to stop the event before it bubbles past it.
  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.stopPropagation();
    }
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  function toggleItem(item: ListItem) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  function toggleGroup(group: ItemGroup) {
    const allSelected = group.items.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of group.items) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  function addCustomEntry() {
    const width = Math.max(1, Math.round(Number(customWidth)));
    const height = Math.max(1, Math.round(Number(customHeight)));
    if (!width || !height) return;
    const nearest = nearestPreset(width, height);
    setCustomEntries((prev) => [...prev, { width, height, label: `${width} × ${height}`, ruleSetId: nearest?.preset.ruleSetId ?? NO_RULES_ID }]);
    setCustomWidth('');
    setCustomHeight('');
    setCustomMode(false);
  }

  function removeCustomEntry(index: number) {
    setCustomEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function confirm() {
    const byId = new Map(GROUPS.flatMap((g) => g.items).map((i) => [i.id, i]));
    const results: QuickSizeResult[] = [
      ...[...selectedIds]
        .map((id) => byId.get(id))
        .filter((i): i is ListItem => Boolean(i))
        .map((i) => ({ width: i.width, height: i.height, label: i.label, presetId: i.presetId, ruleSetId: i.ruleSetId, platformId: i.platformId })),
      ...customEntries,
    ];
    if (results.length === 0) return;
    onConfirm(results);
    closePanel();
  }

  const trigger = cloneElement(children, {
    onClick: (e: ReactMouseEvent) => {
      children.props.onClick?.(e);
      const next = !open;
      setOpen(next);
      onOpenChange?.(next);
      if (!next) reset();
      // Opening the panel on a scene with no focus point picked yet also opens the on-scene
      // pop-up right away — no separate "Pick" click needed for the guided first-time flow. A
      // scene that already has one isn't re-prompted just for reopening this panel; "Change" is
      // still right there if they want to redo it.
      else if (!focusRect) startPickingFocus(sourceLayoutId);
    },
  });

  return (
    <>
      {trigger}
      {open && (
        <div
          ref={panelRef}
          className="fixed top-20 right-6 z-30 flex max-h-[calc(100vh-176px)] w-[319px] flex-col gap-1 rounded-xl p-2 text-chrome-fg"
          style={{ background: '#19191D', boxShadow: 'inset -1px 1px 3px rgba(255,255,255,0.12)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="shrink-0 px-1 text-[11px] font-semibold tracking-[-0.01em] text-white/45 uppercase">{t('Add more variations')}</span>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pt-2">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-white">{t('Select focus area')}</span>
                <span className="text-[13px] text-white/45">{t('Image expands around your selected area.')}</span>
              </div>
              {focusRect ? (
                <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: '#26262C' }}>
                  <div
                    className="size-10 shrink-0 rounded-lg border bg-cover"
                    style={{ borderColor: '#40404A', backgroundImage: sourceImageUrl ? `url(${sourceImageUrl})` : undefined, backgroundPosition: focusThumbPosition }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{t('Scene focus')}</span>
                  <button
                    type="button"
                    disabled={isPicking}
                    onClick={() => startPickingFocus(sourceLayoutId)}
                    className="flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-sm text-white/50 transition-colors hover:bg-white/5 hover:text-white/80 disabled:pointer-events-none disabled:opacity-40"
                    style={{ background: '#26262C', border: '1px solid #40404A' }}
                  >
                    {t('Change')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: '#26262C' }}>
                  <img src="/icons/select_area.svg" alt="" className="size-10 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{t('Pick the scene focus')}</span>
                  <button
                    type="button"
                    disabled={isPicking}
                    onClick={() => startPickingFocus(sourceLayoutId)}
                    className="flex h-8 shrink-0 items-center justify-center rounded-lg bg-button-primary px-3 text-sm text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {t('Pick')}
                  </button>
                </div>
              )}
            </div>

            <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-white">{t('Select sizes')}</span>

              {customMode ? (
                <div className="flex items-center gap-2 pb-1">
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    placeholder={t('Width')}
                    className="h-8 w-full min-w-0 rounded-lg border border-chrome-border bg-chrome-bg px-3 text-[13px] text-chrome-fg placeholder:text-white/45 outline-none"
                  />
                  <input
                    type="number"
                    min={1}
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    placeholder={t('Height')}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomEntry()}
                    className="h-8 w-full min-w-0 rounded-lg border border-chrome-border bg-chrome-bg px-3 text-[13px] text-chrome-fg placeholder:text-white/45 outline-none"
                  />
                  <button
                    type="button"
                    aria-label={t('Add custom size')}
                    onClick={addCustomEntry}
                    disabled={!canAddCustom}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-button-primary text-white transition-opacity disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pb-1">
                  <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
                    <Search className="size-4 shrink-0 text-white/70" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('Search sizes')}
                      className="w-full min-w-0 bg-transparent text-[13px] text-chrome-fg placeholder:text-white/25 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomMode(true)}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] text-white transition-colors hover:brightness-110"
                    style={{ background: '#2F2F37' }}
                  >
                    <Plus className="size-4 shrink-0" />
                    {t('Custom')}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1">
                {customEntries.map((entry, i) => (
                  <div key={`custom-${i}`} className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white/5 px-3">
                    <RatioIcon width={entry.width} height={entry.height} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-white">{entry.label}</span>
                    <button type="button" onClick={() => removeCustomEntry(i)} className="text-white/45 hover:text-white">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}

                <div className="flex flex-col gap-1">
                  {filteredGroups.map((group) => {
                    const selectedCount = group.items.filter((i) => selectedIds.has(i.id)).length;
                    const allSelected = selectedCount === group.items.length;
                    const expanded = expandedGroupId === group.id;
                    const groupDisplayName = group.id === 'other' ? t('Other sizes') : group.name;
                    return (
                      <div
                        key={group.id}
                        className={cn('flex flex-col rounded-lg', expanded && 'overflow-hidden')}
                        style={expanded ? { background: '#131316' } : undefined}
                      >
                        <button
                          type="button"
                          aria-label={language === 'ja' ? `${groupDisplayName}のサイズをすべて選択` : `Select all ${group.name} sizes`}
                          onClick={() => toggleGroup(group)}
                          className="flex h-[38px] w-full shrink-0 items-center gap-2 p-2 text-left transition-colors hover:bg-white/5"
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedGroupId(expanded ? null : group.id);
                            }}
                            className="flex size-4 shrink-0 items-center justify-center"
                          >
                            <ChevronDown className={cn('size-4 text-white transition-transform', !expanded && '-rotate-90')} />
                          </span>
                          {group.id !== 'other' && <img src={`/icons/ec-platform-icon/${group.id}.svg`} alt="" className="size-5 shrink-0 rounded" />}
                          <span className="min-w-0 flex-1 truncate text-[13px] text-[#D9D9D9]">{groupDisplayName}</span>
                          {allSelected && <Check className="size-4 shrink-0 text-white" />}
                        </button>

                        {expanded &&
                          group.items.map((item) => {
                            const checked = selectedIds.has(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleItem(item)}
                                className={cn('flex h-10 shrink-0 items-center gap-2 py-2 pr-2 pl-8 text-left transition-colors', checked ? 'bg-white/10' : 'hover:bg-white/10')}
                              >
                                <RatioIcon width={item.width} height={item.height} />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-white">{item.label}</span>
                                <span className="shrink-0 text-xs text-white/45">
                                  {item.width}x{item.height}
                                </span>
                                {checked && <Check className="size-4 shrink-0 text-white" />}
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
                {filteredGroups.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-white/45">
                    {language === 'ja' ? `"${query}"に一致するサイズがありません` : `No sizes match "${query}"`}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 px-1 pt-1">
            <button
              type="button"
              onClick={closePanel}
              className="flex h-8 shrink-0 items-center justify-center rounded-full bg-chrome-border-subtle px-6 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t('Cancel')}
            </button>
            <Button size="sm" onClick={confirm} disabled={totalSelected === 0} className="min-w-0 flex-1 text-[13px] font-semibold">
              {language === 'ja' ? `${totalSelected}件のサイズを追加` : `Add ${totalSelected} size${totalSelected === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
