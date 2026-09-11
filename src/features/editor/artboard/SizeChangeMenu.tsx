import { useEffect, useLayoutEffect, useMemo, useRef, useState, cloneElement, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { ChevronDown, Plus, Search, Sliders } from 'lucide-react';
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
export function SizeChangeMenu({ onSelect, children }: { onSelect: (result: QuickSizeResult) => void; children: ReactElement<{ onClick?: (e: ReactMouseEvent) => void }> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(GROUPS[0]?.id ?? null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => item.label.toLowerCase().includes(q)) })).filter((g) => g.items.length > 0);
  }, [query]);

  const canAddCustom = Number(customWidth) > 0 && Number(customHeight) > 0;

  function reset() {
    setQuery('');
    setCustomMode(false);
    setCustomWidth('');
    setCustomHeight('');
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

  function confirmCustom() {
    const width = Math.max(1, Math.round(Number(customWidth)));
    const height = Math.max(1, Math.round(Number(customHeight)));
    if (!width || !height) return;
    const nearest = nearestPreset(width, height);
    choose({ width, height, label: `${width} × ${height}`, ruleSetId: nearest?.preset.ruleSetId ?? NO_RULES_ID });
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
            background: 'rgba(38,38,44,0.88)',
            borderColor: '#40404A',
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

          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {filteredGroups.map((group) => {
              const expanded = expandedGroupId === group.id;
              const groupDisplayName = group.id === 'other' ? t('Other sizes') : group.name;
              return (
                <div key={group.id} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                    className="flex h-8 w-full shrink-0 items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-white/5"
                  >
                    {group.id !== 'other' && <img src={`/icons/ec-platform-icon/${group.id}.svg`} alt="" className="size-5 shrink-0 rounded" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-[#D9D9D9]">{groupDisplayName}</span>
                    <ChevronDown className={cn('size-4 shrink-0 text-white/70 transition-transform', !expanded && '-rotate-90')} />
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
                        <span className="min-w-0 flex-1 truncate text-sm text-chrome-fg">{item.label}</span>
                        <span className="shrink-0 text-xs text-white/45">
                          {item.width}x{item.height}
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
            {filteredGroups.length === 0 && <div className="px-3 py-4 text-center text-sm text-white/45">{t('No sizes match')}</div>}
          </div>

          <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

          {customMode ? (
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
                onKeyDown={(e) => e.key === 'Enter' && confirmCustom()}
                className="h-10 w-full min-w-0 rounded-lg border border-chrome-border bg-chrome-bg px-3 text-sm text-chrome-fg placeholder:text-white/45 outline-none"
              />
              <button
                type="button"
                aria-label={t('Add custom size')}
                onClick={confirmCustom}
                disabled={!canAddCustom}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-button-primary text-white transition-opacity disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-white/10"
            >
              <Sliders className="size-4 shrink-0 text-white" />
              <span className="min-w-0 flex-1 truncate text-sm text-chrome-fg">{t('Custom size')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
