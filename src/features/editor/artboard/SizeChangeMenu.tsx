import { useEffect, useLayoutEffect, useMemo, useRef, useState, cloneElement, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { RatioIcon } from '@/components/RatioIcon';
import { nearestPreset } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { GROUPS, type QuickSizeResult } from './QuickSizeMenu';

/**
 * A leaner sibling of `QuickSizeMenu` for the "Size" row in the single-scene panel — browses the
 * same platform/preset list, but picking one immediately replaces the current banner's own size
 * instead of adding a new sibling page, so there's no checkbox multi-select, no "Scene focus
 * point" section, and no confirm footer.
 */
export function SizeChangeMenu({
  onSelect,
  currentWidth,
  currentHeight,
  children,
}: {
  onSelect: (result: QuickSizeResult) => void;
  /** The banner's own current size — drives which row (if any) shows the "currently active" checkmark. */
  currentWidth: number;
  currentHeight: number;
  children: ReactElement<{ onClick?: (e: ReactMouseEvent) => void }>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [customEntries, setCustomEntries] = useState<QuickSizeResult[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(GROUPS[0]?.id ?? null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => item.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);
  }, [query]);
  // "Other sizes" isn't a real platform — its items render flat, above the collapsible EC platform
  // groups, rather than as one more group to expand.
  const otherItems = filteredGroups.find((g) => g.id === 'other')?.items ?? [];
  const platformGroups = filteredGroups.filter((g) => g.id !== 'other');

  const canAddCustom = Number(customWidth) > 0 && Number(customHeight) > 0;
  const isCurrentSize = (width: number, height: number) => width === currentWidth && height === currentHeight;

  function reset() {
    setQuery('');
    setCustomMode(false);
    setCustomWidth('');
    setCustomHeight('');
    setCustomEntries([]);
    setExpandedGroupId(GROUPS[0]?.id ?? null);
  }

  function closePanel() {
    setOpen(false);
    reset();
  }

  function choose(result: QuickSizeResult) {
    onSelect(result);
    closePanel();
  }

  // Adds the typed width/height to the bottom of the list as its own row (ratio icon + size, with
  // a checkmark once it's the active size) and immediately applies it as the banner's own size —
  // unlike every other row here (which needs an explicit click to apply), typing a custom size and
  // hitting add is itself that explicit action, so there's no reason to make it a second, separate
  // step. The dropdown stays open (unlike `choose`, this doesn't call `closePanel`).
  function addCustomEntry() {
    const width = Math.max(1, Math.round(Number(customWidth)));
    const height = Math.max(1, Math.round(Number(customHeight)));
    if (!width || !height) return;
    const nearest = nearestPreset(width, height);
    const entry: QuickSizeResult = { width, height, label: `${width} × ${height}`, ruleSetId: nearest?.preset.ruleSetId ?? NO_RULES_ID };
    setCustomEntries((prev) => [...prev, entry]);
    onSelect(entry);
    setCustomWidth('');
    setCustomHeight('');
    setCustomMode(false);
  }

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closePanel();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Renders as a `position: fixed` overlay (measured off the trigger) instead of an `absolute`
  // child of it — the trigger sits inside the panel's own `overflow-y-auto` scroll box, so an
  // absolutely-positioned dropdown would get clipped to the panel's bounds the moment it grew
  // past them. Sized to the trigger's own width, opening below it unless there's more room above.
  useLayoutEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedHeight = 420;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setPanelPos(
      openUpward
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 8 }
        : { left: rect.left, width: rect.width, top: rect.bottom + 8 },
    );
  }, [open]);

  const trigger = cloneElement(children, {
    onClick: (e: ReactMouseEvent) => {
      children.props.onClick?.(e);
      const next = !open;
      setOpen(next);
      if (!next) reset();
    },
  });

  return (
    <div ref={wrapperRef} className="relative">
      {trigger}
      {open && panelPos && (
        <div
          ref={panelRef}
          className="fixed z-30 flex max-h-[420px] flex-col gap-3 rounded-xl border p-3 text-chrome-fg"
          style={{
            left: panelPos.left,
            width: panelPos.width,
            top: panelPos.top,
            bottom: panelPos.bottom,
            background: 'rgba(25,25,29,0.88)',
            borderColor: '#26262C',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 4px 32px 4px rgba(0,0,0,0.24)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
            <Search className="size-4 text-white/70" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search sizes')}
              className="w-full bg-transparent text-sm text-chrome-fg placeholder:text-white/25 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className="flex h-10 shrink-0 items-center justify-between rounded-lg px-3 text-left transition-colors hover:bg-white/10"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-chrome-fg">{t('Custom size')}</span>
            <Plus className="size-4 shrink-0 text-white" />
          </button>

          {customMode && (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number"
                min={1}
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                placeholder={t('Width')}
                className="h-10 w-full min-w-0 rounded-lg border border-chrome-border bg-chrome-bg px-3 text-sm text-chrome-fg placeholder:text-white/45 outline-none"
              />
              <input
                type="number"
                min={1}
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                placeholder={t('Height')}
                onKeyDown={(e) => e.key === 'Enter' && addCustomEntry()}
                className="h-10 w-full min-w-0 rounded-lg border border-chrome-border bg-chrome-bg px-3 text-sm text-chrome-fg placeholder:text-white/45 outline-none"
              />
              <button
                type="button"
                aria-label={t('Add custom size')}
                onClick={addCustomEntry}
                disabled={!canAddCustom}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-button-primary text-white transition-opacity disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          )}

          {customEntries.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {customEntries.map((entry, i) => (
                <div key={`custom-${i}`} className="flex h-10 shrink-0 items-center gap-2 rounded-lg px-3">
                  <button
                    type="button"
                    onClick={() => choose(entry)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-white"
                  >
                    <RatioIcon width={entry.width} height={entry.height} />
                    <span className="min-w-0 flex-1 truncate text-sm text-chrome-fg">
                      {entry.width}x{entry.height}
                    </span>
                  </button>
                  {isCurrentSize(entry.width, entry.height) && <Check className="ml-auto size-4 shrink-0 text-white" />}
                </div>
              ))}
            </div>
          )}

          <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {otherItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => choose({ width: item.width, height: item.height, label: item.label, presetId: item.presetId, ruleSetId: item.ruleSetId })}
                className="flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-white/10"
              >
                <RatioIcon width={item.width} height={item.height} />
                <span className="shrink-0 text-sm text-chrome-fg">
                  {item.width}x{item.height}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{item.label}</span>
                {isCurrentSize(item.width, item.height) && <Check className="size-4 shrink-0 text-white" />}
              </button>
            ))}

            {platformGroups.map((group) => {
              const expanded = expandedGroupId === group.id;
              return (
                <div key={group.id} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                    className="flex h-8 w-full shrink-0 items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-white/5"
                  >
                    <ChevronDown className={cn('size-4 shrink-0 text-white/70 transition-transform', !expanded && '-rotate-90')} />
                    <img src={`/icons/ec-platform-icon/${group.id}.svg`} alt="" className="size-5 shrink-0 rounded" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[#D9D9D9]">{group.name}</span>
                  </button>

                  {expanded &&
                    group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => choose({ width: item.width, height: item.height, label: item.label, presetId: item.presetId, ruleSetId: item.ruleSetId })}
                        className="flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-white/10"
                      >
                        <RatioIcon width={item.width} height={item.height} />
                        <span className="shrink-0 text-sm text-chrome-fg">
                          {item.width}x{item.height}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{item.label}</span>
                        {isCurrentSize(item.width, item.height) && <Check className="size-4 shrink-0 text-white" />}
                      </button>
                    ))}
                </div>
              );
            })}
            {otherItems.length === 0 && platformGroups.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-white/45">{t('No sizes match')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
