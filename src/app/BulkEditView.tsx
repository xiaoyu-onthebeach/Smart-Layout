import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, EllipsisVertical, ImageIcon, Plus, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { isRealLayer } from '@/lib/create-layout';
import { getPreset } from '@/lib/mock/presets';
import { nearestPreset, platforms } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { isGradient } from '@/lib/gradient';
import { RatioIcon } from '@/components/RatioIcon';
import { ColorPickerPopover } from '@/features/editor/artboard/ColorPickerPopover';
import { ImagePickerDialog } from '@/features/editor/artboard/ImagePickerDialog';
import { GROUPS, type ListItem, type QuickSizeResult } from '@/features/editor/artboard/QuickSizeMenu';
import { Button } from '@/components/ui/button';
import { addSizesTo } from '@/features/editor/artboard/add-sizes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { duplicateBanner } from '@/features/editor/artboard/duplicate-banner';
import { deleteBannerSet, duplicateBannerSet } from '@/features/editor/artboard/banner-sets';
import { canvasRootOf } from '@/lib/canvas-layout';
import type { Layout, LayoutElement } from '@/types';

const BORDER = '#40404A';
/** The table's own lines — its outer frame and the grid between cells. */
const TABLE_BORDER = '#2A2A2C';
/** How long the glimmer on freshly filled cells plays — matches `.cell-glimmer` in index.css. */
const GLIMMER_MS = 600;
/** Narrowest a Size/content column gets before the table scrolls sideways instead. */
const MIN_COLUMN_WIDTH = 120;
/** The leftmost column: drag handle (12px), 4px gap, checkbox (16px), 8px padding each side and
 * its border — wide enough for the handle at all times, so revealing it on hover moves nothing. */
const CHECKBOX_COLUMN_WIDTH = 49;
/** The primary's row is lit in the primary blue from the marker inward: strongest across the
 * checkbox cell, then fading out across Size. */
const PRIMARY_ROW_GRADIENT_START = 'linear-gradient(90deg, rgba(69, 112, 255, 0.5) 0%, rgba(69, 112, 255, 0.2) 100%)';
const PRIMARY_ROW_GRADIENT_END = 'linear-gradient(90deg, rgba(69, 112, 255, 0.2) 0%, rgba(69, 112, 255, 0) 100%)';
/** The pinned row-actions column on the right. */
const ACTIONS_COLUMN_WIDTH = 40;
/** The floating header's height — the scrolling content starts below it. */
const HEADER_HEIGHT = 56;
/** How far down from the top of the scrolling content its fade-out runs. */
const TOP_FADE_LENGTH = 40;
/** The left area's side padding — the pinned filter bar spans it too, so both use this one value. */
const SIDE_PADDING = 24;
/** Room for the tables' scrollbar, kept on both sides (so the left and right margins match) and on
 * the filter bar too (so it lines up with the tables) — zero where scrollbars overlay the content. */
const SCROLLBAR_ROOM = { scrollbarGutter: 'stable both-edges' } as const;
/** Space between the header and the filter bar. */
const SCROLL_TOP_PADDING = 96 - HEADER_HEIGHT;
/** Space between the filter bar and the first table (the top of the tables' scrolling area). */
const FILTERS_TO_TABLES = 40;
/** Base background of every cell — opaque (the page's own color) so the pinned columns cover
 * whatever scrolls underneath them. */
const ROW_BG = '#19191D';
const KIND_LABELS: Record<LayoutElement['kind'], string> = { image: 'Image', text: 'Text', shape: 'Shape', vector: 'Vector' };
const KIND_ICONS: Record<LayoutElement['kind'], string> = {
  image: '/icons/edit_panel/panel_image.svg',
  text: '/icons/edit_panel/Panel_text.svg',
  shape: '/icons/edit_panel/panel_circle.svg',
  vector: '/icons/edit_panel/panel_vector.svg',
};

/** One column of a group's table: a piece of content in the primary banner, named by its type and
 * position ("Image 1", "Text 2", ...). Sizes adapted from a primary keep its layers' ids, so the
 * same id finds that content in every banner of the group. */
type Column = { id: string; kind: LayoutElement['kind']; index: number };

function contentColumns(primary: Layout): Column[] {
  const counts: Partial<Record<LayoutElement['kind'], number>> = {};
  return (
    primary.elements
      // An empty image slot is still content waiting to be filled ("Select or drop"); everything
      // else only counts once it's real (no untouched "Add headline" placeholders).
      .filter((el) => el.kind === 'image' || isRealLayer(el))
      .map((el) => {
        counts[el.kind] = (counts[el.kind] ?? 0) + 1;
        return { id: el.id, kind: el.kind, index: counts[el.kind]! };
      })
  );
}

/** Each primary banner with its own sizes — the same grouping the Banners list uses. */
function useBannerGroups(): { primaryId: string; memberIds: string[] }[] {
  const pageOrder = useAppStore((s) => s.pageOrder);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const groups: { primaryId: string; memberIds: string[] }[] = [];
  const seen = new Set<string>();
  for (const id of pageOrder) {
    if (seen.has(id)) continue;
    const group = pageGroups[pageGroupIdByPage[id]];
    if (group && group.memberIds.length > 1) {
      if (group.memberIds[0] !== id) continue; // a size whose primary comes later — listed with it
      groups.push({ primaryId: id, memberIds: group.memberIds });
      for (const memberId of group.memberIds) seen.add(memberId);
    } else {
      groups.push({ primaryId: id, memberIds: [id] });
      seen.add(id);
    }
  }
  return groups;
}

/**
 * A table cell. The row's own hover (see BannerGroupTable's <tr>) lifts every cell to the container
 * color. An `editable` cell is itself the field: its content fills it edge to edge, and while that
 * content has focus the cell takes the sidebar inputs' focus look — elevated background and a blue
 * border, drawn inset so it never fights the table's own grid lines.
 */
function Cell({
  children,
  className,
  editable = false,
  selected = false,
  onMouseDown,
  onMouseEnter,
  cellKey,
  pinned,
  onFillHandleMouseDown,
  glimmer,
  backgroundImage,
}: {
  children?: ReactNode;
  className?: string;
  editable?: boolean;
  /** Part of a multi-cell selection (see BannerGroupTable's `cellSelection`) — tinted blue, no border. */
  selected?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  /** `row:column` key for an editable cell, so the table can find and focus its field. */
  cellKey?: string;
  /** Pinned to that edge while the middle columns scroll sideways underneath. */
  pinned?: 'left' | 'right';
  /** Shows the fill handle on this cell while it's the active one (see BannerGroupTable's `fill`). */
  onFillHandleMouseDown?: (e: React.MouseEvent) => void;
  /** Set to a new value to play the "value just changed" glimmer once (see BannerGroupTable's `fill`). */
  glimmer?: number;
  /** Drawn over the cell's own background (which stays opaque, for the pinned columns). */
  backgroundImage?: string;
}) {
  return (
    <td
      data-bulk-cell={editable ? (cellKey ?? '') : undefined}
      // React lets events from a portal (the color picker opened from this cell) bubble up here
      // too — only a press on the cell itself should count as selecting it.
      onMouseDown={(e) => e.currentTarget.contains(e.target as Node) && onMouseDown?.(e)}
      onMouseEnter={onMouseEnter}
      className={cn(
        'h-12 border-r border-b bg-[#19191D] text-[13px] tracking-[-0.01em] text-white transition-colors group-hover/row:bg-[#26262C]',
        pinned === 'left' && 'sticky left-0 z-[2]',
        // The pinned actions column draws the separator on its own left edge, so it stays visible while
        // the columns before it scroll underneath (the last of those draws no right border of its own).
        pinned === 'right' && 'sticky right-0 z-[2] border-r-0 border-l',
        // The active cell: blue-tinted with a blue border, drawn inset so it never fights the table's
        // own grid lines. Not clipped, so its fill handle can sit across the bottom edge.
        editable ? 'group/cell relative p-0 focus-within:bg-[#4570FF]/10! focus-within:shadow-[inset_0_0_0_1px_#4570FF]' : 'overflow-hidden px-2',
        // The rest of a multi-cell selection is just tinted; only the cell being edited (focus-within
        // above) gets the border.
        selected && 'bg-[#4570FF]/15!',
        className,
      )}
      style={{ borderColor: TABLE_BORDER, backgroundImage }}
    >
      {editable ? children : <div className="flex h-full min-w-0 items-center gap-2">{children}</div>}
      {glimmer !== undefined && <span key={glimmer} aria-hidden className="cell-glimmer pointer-events-none absolute inset-0" />}
      {onFillHandleMouseDown && (
        <span
          aria-hidden
          onMouseDown={onFillHandleMouseDown}
          // A larger invisible grab area around the 16×6 handle.
          className="absolute right-[6px] -bottom-[2px] z-[1] hidden h-[6px] w-4 cursor-ns-resize rounded-[8px] border border-[#4570FF] bg-[#2F2F37] group-focus-within/cell:block before:absolute before:-inset-x-1 before:-inset-y-2"
        />
      )}
    </td>
  );
}

function Missing() {
  return <span className="text-white/45">—</span>;
}

function RowCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors', checked ? 'border-[#4570FF] bg-[#4570FF]' : 'border-chrome-border bg-chrome-border-subtle hover:border-[#4570FF]')}
    >
      {checked && <img src="/icons/edit_panel/check%2016.svg" alt="" className="size-4" />}
    </button>
  );
}

/** Focuses-for-typing look: a caret right after the existing text, nothing highlighted. */
function placeCaretAtEnd(input: HTMLInputElement) {
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

/** Edits as you type, commits on blur/Enter — so the canvas updates once per edit, not per key. */
function TextCell({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      data-cell-field
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-12 w-full min-w-0 bg-transparent px-2 text-[13px] text-white outline-none"
    />
  );
}

/** Only the thumbnail opens the image picker; the rest of the cell just selects it (for a
 * multi-cell selection or the fill handle). Enter on the selected cell opens the picker too. */
function ImageCell({ url, onPick }: { url: string | undefined; onPick: () => void }) {
  const t = useT();
  return (
    <div
      data-cell-field
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onPick()}
      className="flex h-12 w-full min-w-0 items-center gap-2 px-2 outline-none"
    >
      <button
        type="button"
        aria-label={t('Select or drop')}
        onClick={onPick}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white/10 bg-cover bg-center text-white/45 outline-none transition-shadow hover:shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
        style={url ? { backgroundImage: `url(${url})` } : undefined}
      >
        {!url && <ImageIcon className="size-3.5" />}
      </button>
      <span className="min-w-0 flex-1 truncate text-white/45">{t('Select or drop')}</span>
    </div>
  );
}

function FillCell({ color, opacity, onChange }: { color: string; opacity: number; onChange: (color: string) => void }) {
  const t = useT();
  // Read before `isGradient`, whose type guard would otherwise narrow `color` away in the else branch.
  const hex = color.toUpperCase();
  const gradient = isGradient(color);
  return (
    <ColorPickerPopover color={color} onChange={onChange}>
      <button type="button" data-cell-field aria-label={t('Color')} className="flex h-12 w-full items-center gap-2 px-2 text-left outline-none">
        <span className="size-6 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate">{gradient ? t('Linear') : hex}</span>
        <span className="h-4 w-px shrink-0" style={{ background: BORDER }} />
        <span>
          {Math.round(opacity)} <span className="text-white/65">%</span>
        </span>
      </button>
    </ColorPickerPopover>
  );
}

/** "1080x1350", "1080 × 1350", "1080*1350" — a size typed straight into the picker's search. */
function parseTypedSize(query: string): { width: number; height: number } | null {
  const match = /^\s*(\d{1,5})\s*[x×*]\s*(\d{1,5})\s*$/i.exec(query);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The picker's checkbox look — same as the canvas's "Add more sizes" panel. */
function SizeCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
      style={{ background: checked ? '#4570FF' : '#26262C', borderColor: checked ? '#4570FF' : BORDER }}
    >
      {checked && <Check className="size-3 text-white" />}
    </span>
  );
}

/** A group in a size checklist: a channel (or "All sizes"/custom) and its sizes. */
type SizeListGroup = { id: string; name: string; icon?: string; items: { id: string; width: number; height: number; label: string }[] };

/** The size pickers' search field (Add more sizes, Size filter). */
function SizeSearchInput({ value, onChange, onEnter }: { value: string; onChange: (value: string) => void; onEnter?: () => void }) {
  const t = useT();
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
      <Search className="size-4 shrink-0 text-white/70" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={t('Search sizes')}
        className="w-full min-w-0 bg-transparent text-[13px] placeholder:text-white/25 outline-none"
      />
    </div>
  );
}

/** The size pickers' checklist: per group a select-all header (channel icon + name), then its
 * sizes, each with its checkbox, shape, WxH and name — shared by Add more sizes and the Size filter. */
function SizeGroupList({
  groups,
  isSelected,
  onToggle,
  onToggleGroup,
}: {
  groups: SizeListGroup[];
  isSelected: (id: string) => boolean;
  onToggle: (groupId: string, itemId: string) => void;
  onToggleGroup: (group: SizeListGroup) => void;
}) {
  return groups.map((group) => (
    <div key={group.id} className="flex flex-col">
      <button
        type="button"
        onClick={() => onToggleGroup(group)}
        className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-left text-[11px] font-semibold tracking-[-0.01em] text-white/45 uppercase transition-colors hover:bg-white/5"
      >
        <SizeCheckbox checked={group.items.every((item) => isSelected(item.id))} />
        {group.icon && <img src={group.icon} alt="" className="size-4 shrink-0 rounded" />}
        <span className="truncate">{group.name}</span>
      </button>
      {group.items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onToggle(group.id, item.id)}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg py-2 pr-2 pl-8 text-left transition-colors hover:bg-white/10"
        >
          <SizeCheckbox checked={isSelected(item.id)} />
          <RatioIcon width={item.width} height={item.height} />
          <span className="shrink-0 text-[13px]">
            {item.width}x{item.height}
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{item.label}</span>
        </button>
      ))}
    </div>
  ));
}

/**
 * The table's last row: "Add size" opens a size list right there — the same sizes as the canvas's
 * "Add more sizes" panel, searchable, plus any WxH typed into the search — where any number of
 * sizes can be ticked, then added to the group together.
 */
function AddSizeRow({ onAdd }: { onAdd: (sizes: QuickSizeResult[]) => void }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Ticked sizes by id (`preset-…`/`ratio-…` for listed ones, `custom-WxH` for typed ones), in the
  // order they were ticked.
  const [selected, setSelected] = useState<Map<string, QuickSizeResult>>(new Map());
  // Typed sizes stay listed (ticked or not) until the picker closes.
  const [customs, setCustoms] = useState<(QuickSizeResult & { id: string })[]>([]);
  const q = query.trim().toLowerCase();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !q || item.label.toLowerCase().includes(q) || `${item.width}x${item.height}`.includes(q)),
  })).filter((g) => g.items.length > 0);
  const typed = parseTypedSize(query);

  function reset() {
    setQuery('');
    setSelected(new Map());
    setCustoms([]);
  }
  function toggle(id: string, size: QuickSizeResult) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, size);
      return next;
    });
  }
  const resultOf = (item: ListItem): QuickSizeResult => ({ width: item.width, height: item.height, label: item.label, presetId: item.presetId, ruleSetId: item.ruleSetId, platformId: item.platformId });
  function toggleGroup(items: ListItem[]) {
    const allSelected = items.every((item) => selected.has(item.id));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (allSelected) next.delete(item.id);
        else next.set(item.id, resultOf(item));
      }
      return next;
    });
  }
  /** Lists the typed WxH as a custom size, already ticked. */
  function addTyped() {
    if (!typed) return;
    const id = `custom-${typed.width}x${typed.height}`;
    const nearest = nearestPreset(typed.width, typed.height);
    const size = { ...typed, label: `${typed.width} × ${typed.height}`, ruleSetId: nearest?.preset.ruleSetId ?? NO_RULES_ID };
    if (!customs.some((c) => c.id === id)) setCustoms((prev) => [...prev, { ...size, id }]);
    setSelected((prev) => new Map(prev).set(id, size));
    setQuery('');
  }
  function confirm() {
    if (selected.size === 0) return;
    onAdd([...selected.values()]);
    setOpen(false);
    reset();
  }

  return (
    // Outside the sideways-scrolling part (so its scrollbar sits right under the rows), but
    // inside the table's frame, ruled off like one more row.
    <div className="h-12 border-t" style={{ background: ROW_BG, borderColor: TABLE_BORDER }}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn('group/add flex h-12 items-center gap-2 px-3 text-[13px] tracking-[-0.01em] outline-none transition-colors hover:text-white', open ? 'text-white' : 'text-white/65')}
          >
            {/* Same icon and label as the canvas's own "Add more sizes" buttons in Create. */}
            <img src="/icons/Button%2040/More-size.svg" alt="" className={cn('size-4 shrink-0 transition-opacity group-hover/add:opacity-100', open ? 'opacity-100' : 'opacity-65')} />
            {t('Add more sizes')}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={SIZE_POPOVER}
          style={MENU_SURFACE}
        >
          <SizeSearchInput value={query} onChange={setQuery} onEnter={addTyped} />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1">
            {typed && !customs.some((c) => c.width === typed.width && c.height === typed.height) && (
              <button type="button" onClick={addTyped} className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-white/10">
                <Plus className="size-4 shrink-0" />
                <span className="shrink-0 text-[13px]">
                  {typed.width}x{typed.height}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{t('Custom size')}</span>
              </button>
            )}
            {customs.map((custom) => (
              <button
                key={custom.id}
                type="button"
                onClick={() => toggle(custom.id, custom)}
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-white/10"
              >
                <SizeCheckbox checked={selected.has(custom.id)} />
                <RatioIcon width={custom.width} height={custom.height} />
                <span className="shrink-0 text-[13px]">
                  {custom.width}x{custom.height}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{t('Custom size')}</span>
              </button>
            ))}
            <SizeGroupList
              groups={groups.map((g) => ({ id: g.id, name: g.id === 'other' ? t('All sizes') : g.name, icon: g.id === 'other' ? undefined : `/icons/ec-platform-icon/${g.id}.svg`, items: g.items }))}
              isSelected={(id) => selected.has(id)}
              onToggle={(groupId, itemId) => {
                const item = groups.find((g) => g.id === groupId)?.items.find((i) => i.id === itemId);
                if (item) toggle(item.id, resultOf(item));
              }}
              onToggleGroup={(group) => toggleGroup(groups.find((g) => g.id === group.id)?.items ?? [])}
            />
            {groups.length === 0 && !typed && customs.length === 0 && <div className="px-2 py-4 text-center text-[13px] text-white/45">{t('No sizes match')}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="flex h-8 shrink-0 items-center justify-center rounded-full bg-chrome-border-subtle px-6 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t('Cancel')}
            </button>
            <Button size="sm" onClick={confirm} disabled={selected.size === 0} className="min-w-0 flex-1 text-[13px] font-semibold">
              {language === 'ja' ? `${selected.size}件のサイズを追加` : `Add ${selected.size} size${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** A content cell's stand-in while its banner is still being generated. */
function LoadingCell() {
  return <span className="block h-3 w-full max-w-[96px] animate-pulse rounded-full bg-white/10" />;
}

/** The surface every dropdown here shares (row ⋮ menu, filters, size pickers) — the canvas's
 * right-click menu look: blurred translucent container, bordered. */
const MENU_SURFACE = { background: 'rgba(38,38,44,0.88)', borderColor: BORDER };
const SIZE_POPOVER = 'flex max-h-[420px] w-[300px] flex-col gap-1 rounded-lg border p-2 text-white shadow-[0px_4px_32px_4px_rgba(0,0,0,0.24)] backdrop-blur-[16px]';

const ROW_MENU_ITEM = 'flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] text-white outline-none focus:bg-white/10 data-[highlighted]:bg-white/10';

/** A set's name above its table — double-click to rename it in place (Enter or clicking away
 * keeps the new name, Escape cancels). */
function SetName({ primaryId, name }: { primaryId: string; name: string }) {
  const t = useT();
  const renamePage = useAppStore((s) => s.renamePage);
  const [draft, setDraft] = useState<string | null>(null);
  const textClass = 'text-[15px] leading-[1.4] font-semibold tracking-[-0.01em] text-white';
  if (draft !== null) {
    const commit = () => {
      if (draft.trim() && draft.trim() !== name) renamePage(primaryId, draft);
      setDraft(null);
    };
    return (
      <input
        autoFocus
        aria-label={t('Set name')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
        }}
        className={cn('-mx-1 min-w-0 rounded-md bg-[#26262C] px-1 outline-none focus:shadow-[inset_0_0_0_1px_#4570FF]', textClass)}
        style={{ width: `${Math.max(draft.length, 4) + 2}ch` }}
      />
    );
  }
  return (
    <span onDoubleClick={() => setDraft(name)} className={cn('min-w-0 cursor-default truncate select-none', textClass)}>
      {name}
    </span>
  );
}

/** The ⋮ next to a set's name (same as the rows' own) (shown while hovering it): duplicate or delete the whole set — its
 * primary and every size. */
function SetMenu({ primaryId }: { primaryId: string }) {
  const t = useT();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('Set options')}
          className="flex size-6 shrink-0 items-center justify-center rounded-lg text-white/70 opacity-0 transition-[opacity,background-color] outline-none group-hover/heading:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100 data-[state=open]:bg-white/10 data-[state=open]:text-white data-[state=open]:opacity-100"
        >
          <EllipsisVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-40 rounded-lg border p-1 text-white shadow-[0px_4px_32px_4px_rgba(0,0,0,0.24)] backdrop-blur-[16px]"
        style={MENU_SURFACE}
      >
        <DropdownMenuItem
          className={ROW_MENU_ITEM}
          onSelect={() => {
            const copyId = duplicateBannerSet(primaryId);
            if (copyId) useAppStore.getState().requestFocusPage(copyId);
          }}
        >
          {t('Duplicate set')}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 h-px" style={{ background: BORDER }} />
        <DropdownMenuItem className={ROW_MENU_ITEM} onSelect={() => deleteBannerSet(primaryId)}>
          <img src="/icons/dropdown/delete.svg" alt="" className="size-5 shrink-0" />
          {t('Delete set')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A row's ⋮ menu: open that banner in the Create view, duplicate it, or delete it. */
function RowMenu({ setId }: { setId: string }) {
  const t = useT();
  function seeOnCreate() {
    // Only once the click that picked this item is over: switching views grows the canvas under
    // the pointer, and that click landing on its background would clear the selection again.
    setTimeout(() => {
      const state = useAppStore.getState();
      const layoutId = state.setsById[setId]?.sourceLayoutId;
      state.setWorkspaceView('edit');
      state.setActiveCanvas(canvasRootOf(state, setId));
      // In this order: making a layout active clears the banner selection.
      if (layoutId) state.setActiveLayout(layoutId);
      state.selectScene(setId);
      // After the canvas has grown back to full width, so the banner is centered in the right space.
      setTimeout(() => useAppStore.getState().requestFocusPage(setId), 50);
    }, 0);
  }
  function duplicate() {
    // Keeps the layers' ids, so the copy lines up with the table's columns like any other size.
    const newId = duplicateBanner(setId, { keepElementIds: true });
    if (newId) useAppStore.getState().requestFocusPage(newId);
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('More options')}
          className="flex size-6 items-center justify-center rounded-lg text-white/70 transition-colors outline-none hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white"
        >
          <EllipsisVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      {/* Same look as the canvas's right-click menu on a banner. */}
      <DropdownMenuContent
        align="end"
        className="min-w-40 rounded-lg border p-1 text-white shadow-[0px_4px_32px_4px_rgba(0,0,0,0.24)] backdrop-blur-[16px]"
        style={MENU_SURFACE}
      >
        <DropdownMenuItem className={ROW_MENU_ITEM} onSelect={seeOnCreate}>
          {t('See on Create')}
        </DropdownMenuItem>
        <DropdownMenuItem className={ROW_MENU_ITEM} onSelect={duplicate}>
          {t('Duplicate')}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 h-px" style={{ background: BORDER }} />
        <DropdownMenuItem className={ROW_MENU_ITEM} onSelect={() => useAppStore.getState().deletePage(setId)}>
          <img src="/icons/dropdown/delete.svg" alt="" className="size-5 shrink-0" />
          {t('Delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BannerGroupTable({ primaryId, memberIds, rowIds }: { primaryId: string; memberIds: string[]; rowIds: string[] }) {
  // `memberIds` is the whole group, in its order; `rowIds` the ones the filter bar lets through —
  // the rows actually shown, which cell-selection and fill ranges run over.
  const filtered = rowIds.length !== memberIds.length;
  const t = useT();
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectScene = useAppStore((s) => s.selectScene);
  const selectScenes = useAppStore((s) => s.selectScenes);
  const updateElement = useAppStore((s) => s.updateElement);
  const requestFocusPage = useAppStore((s) => s.requestFocusPage);
  const setBulkEditActivePage = useAppStore((s) => s.setBulkEditActivePage);
  const reorderGroupSiblings = useAppStore((s) => s.reorderGroupSiblings);
  const loadingPageIds = useAppStore((s) => s.loadingPageIds);
  // The image picker's targets are fixed when it opens — the cell selection can change (or clear)
  // while the dialog is up, and the pick should still land where it was meant to.
  const [picking, setPicking] = useState<{ layoutId: string; elementId: string }[] | null>(null);

  // Figma-style multi-cell selection, always within a single column: dragging from a cell (or
  // shift-clicking) selects the run of rows from that anchor, ⌘/Ctrl-click adds or removes one row;
  // editing any selected cell then applies to every one of them. A plain click starts over from
  // just that cell.
  const [cellSelection, setCellSelection] = useState<{ columnId: string; rowIds: string[]; anchorId: string } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  function handleCellMouseDown(e: React.MouseEvent, setId: string, columnId: string) {
    const sel = cellSelection;
    const modifier = e.shiftKey || e.metaKey || e.ctrlKey;
    const extending = Boolean(sel && sel.columnId === columnId && modifier);
    // Shift/⌘-click are also the browser's own "extend text selection" gestures (and would move
    // focus to the clicked field) — taken over here: no native text selection, and focus is
    // placed explicitly below instead.
    if (modifier) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    }
    let anchorId = setId;
    if (extending && sel && e.shiftKey) {
      anchorId = sel.anchorId;
      const a = rowIds.indexOf(anchorId);
      const b = rowIds.indexOf(setId);
      setCellSelection({ ...sel, rowIds: rowIds.slice(Math.min(a, b), Math.max(a, b) + 1) });
    } else if (extending && sel) {
      const rowIds = sel.rowIds.includes(setId) ? sel.rowIds.filter((id) => id !== setId) : [...sel.rowIds, setId];
      // The first-selected cell stays the active one unless it's the one just removed.
      anchorId = rowIds.includes(sel.anchorId) ? sel.anchorId : (rowIds[0] ?? setId);
      setCellSelection(rowIds.length > 0 ? { columnId, rowIds, anchorId } : null);
    } else {
      setCellSelection({ columnId, rowIds: [setId], anchorId: setId });
    }
    // With a modifier, the active cell — the one typing goes into — is always the first-selected
    // one (the anchor), not whichever cell was just added, with its caret at the end of its text.
    // A plain click focuses the clicked field natively.
    if (modifier) focusCellField(anchorId, columnId);
    // A press can turn into a drag down/up the column — see handleCellMouseEnter.
    if (!e.metaKey && !e.ctrlKey) dragRef.current = { columnId, anchorId };
  }
  function focusCellField(setId: string, columnId: string) {
    const field = tableRef.current?.querySelector<HTMLElement>(`[data-bulk-cell="${setId}:${columnId}"] [data-cell-field]`);
    field?.focus();
    if (field instanceof HTMLInputElement) placeCaretAtEnd(field);
  }
  // While the mouse button is held after pressing a cell, every cell of the same column the
  // pointer passes over extends the run from the anchor to it — the drag version of shift-click.
  const dragRef = useRef<{ columnId: string; anchorId: string; extended?: boolean } | null>(null);
  function handleCellMouseEnter(e: React.MouseEvent, setId: string, columnId: string) {
    const fill = fillRef.current;
    if (fill) {
      if (fill.columnId !== columnId) return;
      const a = rowIds.indexOf(fill.sourceId);
      const b = rowIds.indexOf(setId);
      const next = { ...fill, rowIds: rowIds.slice(Math.min(a, b), Math.max(a, b) + 1) };
      fillRef.current = next;
      setFill(next);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.columnId !== columnId || (e.buttons & 1) === 0) return;
    // Past the first cell it's a selection drag, not text selection inside the field it started in.
    window.getSelection()?.removeAllRanges();
    drag.extended = true;
    const a = rowIds.indexOf(drag.anchorId);
    const b = rowIds.indexOf(setId);
    setCellSelection({ columnId, rowIds: rowIds.slice(Math.min(a, b), Math.max(a, b) + 1), anchorId: drag.anchorId });
  }
  // Spreadsheet-style fill: dragging the active cell's handle up or down its column, then letting
  // go, copies that cell's value into every cell the drag covered.
  const [fill, setFill] = useState<{ columnId: string; sourceId: string; rowIds: string[] } | null>(null);
  const fillRef = useRef(fill);
  const [glimmer, setGlimmer] = useState<{ columnId: string; rowIds: string[]; stamp: number } | null>(null);

  // Reordering sizes by dragging a row's handle. The primary always stays first, so only the rows
  // after it take part; the new order is the group's, so the canvas follows it too.
  // `insertAt` is the position among those rows the dragged one would be dropped before.
  const [rowDrag, setRowDrag] = useState<{ id: string; insertAt: number; lineY?: number } | null>(null);
  const rowsWrapRef = useRef<HTMLDivElement>(null);
  function startRowDrag(e: React.MouseEvent, setId: string) {
    e.preventDefault();
    e.stopPropagation();
    const siblings = memberIds.slice(1);
    const from = siblings.indexOf(setId);
    let current: { id: string; insertAt: number; lineY?: number } = { id: setId, insertAt: from };
    setRowDrag(current);
    document.body.style.cursor = 'grabbing';
    function onMove(ev: MouseEvent) {
      const wrap = rowsWrapRef.current;
      if (!wrap) return;
      const rects = siblings.map((id) => wrap.querySelector(`tr[data-row-id="${id}"]`)!.getBoundingClientRect());
      let insertAt = siblings.findIndex((_, i) => ev.clientY < rects[i].top + rects[i].height / 2);
      if (insertAt === -1) insertAt = siblings.length;
      // Dropping right above or below itself changes nothing — no line for that.
      const noop = insertAt === from || insertAt === from + 1;
      const top = wrap.getBoundingClientRect().top;
      const lineY = noop ? undefined : insertAt < siblings.length ? rects[insertAt].top - top : rects[siblings.length - 1].bottom - top;
      current = { id: setId, insertAt, lineY };
      setRowDrag(current);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setRowDrag(null);
      const at = current.insertAt > from ? current.insertAt - 1 : current.insertAt;
      if (at === from) return;
      const next = siblings.filter((id) => id !== setId);
      next.splice(at, 0, setId);
      const groupId = pageGroupIdByPage[primaryId];
      if (groupId) reorderGroupSiblings(groupId, next);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function startFill(e: React.MouseEvent, setId: string, columnId: string) {
    // Keeps focus (and any text still being typed) in the cell, and isn't a cell press either.
    e.preventDefault();
    e.stopPropagation();
    const next = { columnId, sourceId: setId, rowIds: [setId] };
    fillRef.current = next;
    setFill(next);
    document.body.style.cursor = 'ns-resize';
    window.addEventListener('mouseup', finishFill, { once: true });
  }
  function finishFill() {
    const done = fillRef.current;
    fillRef.current = null;
    setFill(null);
    document.body.style.cursor = '';
    if (!done || done.rowIds.length < 2) return;
    // Text typed but not committed yet (that happens on blur) is part of the value being copied.
    const active = document.activeElement;
    if (active instanceof HTMLElement && tableRef.current?.contains(active)) active.blur();
    const state = useAppStore.getState();
    const sourceSet = state.setsById[done.sourceId];
    const source = sourceSet ? state.layoutsById[sourceSet.sourceLayoutId]?.elements.find((el) => el.id === done.columnId) : undefined;
    if (!source) return;
    const targets = done.rowIds.filter((id) => id !== done.sourceId);
    applyToRows(
      targets,
      done.columnId,
      (el): Partial<LayoutElement> =>
        el.kind === 'text'
          ? { content: source.content }
          : el.kind === 'image'
            ? { imageUrl: source.imageUrl }
            : { style: { ...el.style, fill: source.style.fill, opacity: source.style.opacity } },
    );
    // A soft glimmer across every cell that just took the value, as feedback.
    const stamp = Date.now();
    setGlimmer({ columnId: done.columnId, rowIds: targets, stamp });
    setTimeout(() => setGlimmer((current) => (current?.stamp === stamp ? null : current)), GLIMMER_MS);
    // The filled run stays selected, the source cell active — like a multi-cell selection.
    setCellSelection({ columnId: done.columnId, rowIds: done.rowIds, anchorId: done.sourceId });
    focusCellField(done.sourceId, done.columnId);
  }
  useEffect(() => {
    // A drag that spread over several cells leaves the field being edited (the one it started in)
    // with just a caret at the end of its text — not whatever partial highlight the drag dragged out
    // inside it — so typing continues the value, across every selected cell.
    const endDrag = () => {
      if (dragRef.current?.extended && document.activeElement instanceof HTMLInputElement) placeCaretAtEnd(document.activeElement);
      dragRef.current = null;
    };
    window.addEventListener('mouseup', endDrag);
    return () => window.removeEventListener('mouseup', endDrag);
  }, []);
  // Clicking anywhere outside this table's own editable cells, or pressing Escape, clears it —
  // except inside a picker opened from a cell (color popover, image dialog), which renders
  // elsewhere in the page but is still part of editing that selection.
  useEffect(() => {
    if (!cellSelection) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Element;
      if (tableRef.current?.contains(target) && target.closest('[data-bulk-cell]')) return;
      if (target.closest('[data-radix-popper-content-wrapper], [role="dialog"]')) return;
      // Deferred past the click's own blur, which is what commits a text cell still being typed in
      // — clearing first would make that commit apply to just the one cell.
      setTimeout(() => setCellSelection(null), 0);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setCellSelection(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [cellSelection]);
  /** Every banner an edit to (`setId`, `columnId`) applies to: the whole selection when that cell is
   * part of it, otherwise just itself. */
  function targetRows(setId: string, columnId: string): string[] {
    return cellSelection && cellSelection.columnId === columnId && cellSelection.rowIds.includes(setId) ? cellSelection.rowIds : [setId];
  }
  /** Applies `patch` — built from each banner's own *current* element, so e.g. a fill change never
   * copies one banner's other style values onto another — to that column's element in every row. */
  function applyToRows(rowIds: string[], columnId: string, patch: (el: LayoutElement) => Partial<LayoutElement>) {
    const state = useAppStore.getState();
    for (const rowId of rowIds) {
      const set = state.setsById[rowId];
      const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
      const el = layout?.elements.find((candidate) => candidate.id === columnId);
      if (layout && el) updateElement(layout.id, el.id, patch(el));
    }
  }

  const layoutOf = (setId: string) => {
    const set = setsById[setId];
    return set ? layoutsById[set.sourceLayoutId] : undefined;
  };
  // Only when focus arrives at a row from outside it — moving between cells of the same row
  // shouldn't keep re-running the camera move.
  const lastFocusedRef = useRef<string | null>(null);

  // The content cell being edited: its layer is outlined in the preview, in its own banner — or in
  // every banner of the column selection it's part of, since an edit goes to all of them.
  const [activeCell, setActiveCell] = useState<{ setId: string; columnId: string } | null>(null);
  // A cell selection spanning several rows: the preview frames all of those banners.
  const selectionRowsKey = cellSelection && cellSelection.rowIds.length > 1 ? cellSelection.rowIds.join(',') : '';
  useEffect(() => {
    if (selectionRowsKey) useAppStore.getState().requestFocusPages(selectionRowsKey.split(','));
  }, [selectionRowsKey]);
  useEffect(() => {
    const store = useAppStore.getState();
    if (!activeCell) {
      // Only this table's own outline — another table may have just set one.
      if (store.bulkEditHighlight?.pageIds.some((id) => memberIds.includes(id))) store.setBulkEditHighlight(null);
      return;
    }
    const inSelection = cellSelection && cellSelection.columnId === activeCell.columnId && cellSelection.rowIds.includes(activeCell.setId);
    store.setBulkEditHighlight({ elementId: activeCell.columnId, pageIds: inSelection ? cellSelection.rowIds : [activeCell.setId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell, cellSelection]);
  function focusBanner(setId: string) {
    // Outlined in the preview like a selected banner, for as long as you're in its row.
    setBulkEditActivePage(setId);
    if (lastFocusedRef.current === setId) return;
    lastFocusedRef.current = setId;
    requestFocusPage(setId);
  }

  // The right-edge fade over the scrolling columns only shows while there's more of them to the
  // right — gone once scrolled to the end, or when everything already fits.
  const [moreToTheRight, setMoreToTheRight] = useState(false);
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setMoreToTheRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const primary = layoutOf(primaryId);
  if (!primary) return null;
  // Select-all covers the rows shown, not ones the filters hide.
  const allRowsChecked = rowIds.every((id) => selectedSceneIds.includes(id));
  function toggleAllRows() {
    const others = selectedSceneIds.filter((id) => !rowIds.includes(id));
    selectScenes(allRowsChecked ? others : [...others, ...rowIds]);
    frameCheckedBanners();
  }
  /** After a checkbox changes: the preview frames every checked banner (or just the one). */
  function frameCheckedBanners() {
    const checked = useAppStore.getState().selectedSceneIds;
    if (checked.length > 1) useAppStore.getState().requestFocusPages(checked);
    else if (checked.length === 1) requestFocusPage(checked[0]);
  }
  const columns = contentColumns(primary);
  const groupPlatformId = pageGroups[pageGroupIdByPage[primaryId]]?.platformId;

  return (
    <section className="flex flex-col gap-2">
      <div className="group/heading flex min-w-0 items-center gap-1">
        {/* The primary banner's own name, as in the Banners list (renaming it there renames this
            too, and the other way round). Double-click to rename. */}
        <SetName primaryId={primaryId} name={setsById[primaryId]?.name || t('Primary')} />
        <SetMenu primaryId={primaryId} />
      </div>

      {/* One rounded frame around the table. Inside it the checkbox column (left) and the row
          actions (right) stay pinned, while Size and the content columns between them scroll
          sideways: they fill the available width, sharing it equally (fixed layout, so long
          content truncates instead of widening its column), and below MIN_COLUMN_WIDTH each the
          table stops shrinking and scrolls instead, with a fade at the right edge of the scrolling
          part while there's more to see. No native drag-and-drop of a field's selected text either:
          pressing on already-selected text and moving would otherwise start dragging that text
          away instead of a cell-selection drag. */}
      <div className="relative">
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: TABLE_BORDER }}>
          <div ref={rowsWrapRef} className="relative">
            <div
              ref={tableRef}
              // While dragging a fill handle the resize cursor holds over every cell, fields included.
              className={cn('overflow-x-auto', fill && '[&_*]:cursor-ns-resize!')}
              onDragStart={(e) => e.preventDefault()}
            >
              <table
                className="w-full table-fixed border-separate border-spacing-0 [&>tbody>tr:last-child>td]:border-b-0"
                style={{ minWidth: CHECKBOX_COLUMN_WIDTH + ACTIONS_COLUMN_WIDTH + (columns.length + 1) * MIN_COLUMN_WIDTH }}
              >
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[2] h-10 border-r border-b px-2" style={{ borderColor: TABLE_BORDER, background: ROW_BG, width: CHECKBOX_COLUMN_WIDTH }}>
                      <div className="flex items-center gap-1">
                        <span className="size-3 shrink-0" />
                        <RowCheckbox checked={allRowsChecked} onChange={toggleAllRows} />
                      </div>
                    </th>
                    {[{ id: 'size', label: t('Size'), icon: '/icons/edit_panel/panel_image.svg' }, ...columns.map((c) => ({ id: c.id, label: `${t(KIND_LABELS[c.kind])} ${c.index}`, icon: KIND_ICONS[c.kind] }))].map((col, i, all) => (
                      <th key={col.id} className={cn('h-10 border-b px-2 text-left text-[13px] font-normal tracking-[-0.01em] text-white/45', i < all.length - 1 && 'border-r')} style={{ borderColor: TABLE_BORDER, background: ROW_BG }}>
                        <div className="flex min-w-0 items-center gap-1">
                          <img src={col.icon} alt="" className="size-6 shrink-0" />
                          <span className="truncate">{col.label}</span>
                        </div>
                      </th>
                    ))}
                    <th className="sticky right-0 z-[2] h-10 border-b border-l" style={{ borderColor: TABLE_BORDER, background: ROW_BG, width: ACTIONS_COLUMN_WIDTH }} />
                  </tr>
                </thead>
                <tbody>
                  {rowIds.map((setId) => {
                    const layout = layoutOf(setId);
                    if (!layout) return null;
                    const platformId = getPreset(layout.size.presetId ?? '')?.platformId ?? groupPlatformId;
                    return (
                      // Selecting any cell brings that row's banner into view in the preview — focus
                      // bubbles up from whichever field took it, so this covers every kind of cell.
                      <tr
                        key={setId}
                        data-row-id={setId}
                        className={cn('group/row', rowDrag?.id === setId && 'opacity-20')}
                        onFocus={(e) => {
                          focusBanner(setId);
                          // Which content cell took focus (if any) — its layer gets outlined in the preview.
                          const key = (e.target as Element).closest('[data-bulk-cell]')?.getAttribute('data-bulk-cell');
                          setActiveCell(key ? { setId, columnId: key.slice(setId.length + 1) } : null);
                        }}
                        // Leaving the row entirely (not just moving to another of its cells) lets coming
                        // back to it bring its banner into view again.
                        onBlur={(e) => {
                          const next = e.relatedTarget as Element | null;
                          if (e.currentTarget.contains(next)) return;
                          lastFocusedRef.current = null;
                          // Still editing this row from a picker opened by one of its cells (color
                          // popover, image dialog) — keep its banner outlined. Moving to another row
                          // outlines that one instead (its own onFocus).
                          if (!next?.closest('[data-radix-popper-content-wrapper], [role="dialog"]')) {
                            setBulkEditActivePage(null);
                            setActiveCell(null);
                          }
                        }}
                      >
                        <Cell pinned="left" className="group/lead" backgroundImage={setId === primaryId ? PRIMARY_ROW_GRADIENT_START : undefined}>
                          <div className="flex items-center gap-1">
                            {/* The primary always stays first, so it has no drag handle — it gets the primary
                                tag instead, attached to the table's left border (the tab icon mirrored, its
                                flat side against the border). Other rows show their handle while hovering
                                this column, except while filters hide some rows (the order is the whole group's). */}
                            {setId === primaryId ? (
                              <>
                                <img src="/icons/primary-row.svg" alt={t('Primary')} className="absolute top-1/2 left-0 size-4 -translate-y-1/2 -scale-x-100" />
                                <span className="size-3 shrink-0" />
                              </>
                            ) : filtered ? (
                              <span className="size-3 shrink-0" />
                            ) : (
                              <img
                                src="/icons/drag-12.svg"
                                alt=""
                                draggable={false}
                                onMouseDown={(e) => startRowDrag(e, setId)}
                                className={cn('size-3 shrink-0 cursor-grab opacity-0 transition-opacity group-hover/lead:opacity-100', rowDrag?.id === setId && 'opacity-100')}
                              />
                            )}
                            <RowCheckbox
                              checked={selectedSceneIds.includes(setId)}
                              onChange={() => {
                                selectScene(setId, true);
                                frameCheckedBanners();
                              }}
                            />
                          </div>
                        </Cell>
                        <Cell className={columns.length === 0 ? 'border-r-0' : undefined} backgroundImage={setId === primaryId ? PRIMARY_ROW_GRADIENT_END : undefined}>
                          {platformId ? (
                            <img src={`/icons/ec-platform-icon/${platformId}.svg`} alt="" className="size-6 shrink-0 rounded-[6px]" />
                          ) : (
                            <RatioIcon width={layout.size.width} height={layout.size.height} className="size-6 shrink-0" />
                          )}
                          <span className="truncate">
                            {layout.size.width}x{layout.size.height}
                          </span>
                        </Cell>
                        {columns.map((col, ci) => {
                          // The pinned actions column already draws the separator after the last one.
                          const lastClass = ci === columns.length - 1 ? 'border-r-0' : undefined;
                          const el = layout.elements.find((e) => e.id === col.id);
                          // A size just added is still "generating" (same loading time as on the canvas)
                          // — nothing to edit yet.
                          if (loadingPageIds[setId]) {
                            return (
                              <Cell key={col.id} className={lastClass}>
                                <LoadingCell />
                              </Cell>
                            );
                          }
                          if (!el) {
                            return (
                              <Cell key={col.id} className={lastClass}>
                                <Missing />
                              </Cell>
                            );
                          }
                          const rows = () => targetRows(setId, col.id);
                          const multiSelected =
                            Boolean(cellSelection && cellSelection.rowIds.length > 1 && cellSelection.columnId === col.id && cellSelection.rowIds.includes(setId)) ||
                            Boolean(fill && fill.columnId === col.id && fill.sourceId !== setId && fill.rowIds.includes(setId));
                          return (
                            <Cell
                              key={col.id}
                              className={lastClass}
                              editable
                              cellKey={`${setId}:${col.id}`}
                              selected={multiSelected}
                              onMouseDown={(e) => handleCellMouseDown(e, setId, col.id)}
                              onMouseEnter={(e) => handleCellMouseEnter(e, setId, col.id)}
                              onFillHandleMouseDown={(e) => startFill(e, setId, col.id)}
                              glimmer={glimmer && glimmer.columnId === col.id && glimmer.rowIds.includes(setId) ? glimmer.stamp : undefined}
                            >
                              {el.kind === 'text' && <TextCell value={el.content ?? ''} onCommit={(content) => applyToRows(rows(), col.id, () => ({ content }))} />}
                              {el.kind === 'image' && (
                                <ImageCell
                                  url={el.imageUrl}
                                  onPick={() =>
                                    setPicking(
                                      rows().flatMap((rowId) => {
                                        const rowLayout = layoutOf(rowId);
                                        return rowLayout?.elements.some((e) => e.id === col.id) ? [{ layoutId: rowLayout.id, elementId: col.id }] : [];
                                      }),
                                    )
                                  }
                                />
                              )}
                              {(el.kind === 'shape' || el.kind === 'vector') && (
                                <FillCell
                                  color={el.style.fill ?? '#D9D9D9'}
                                  opacity={el.style.opacity ?? 100}
                                  onChange={(fill) => applyToRows(rows(), col.id, (target) => ({ style: { ...target.style, fill } }))}
                                />
                              )}
                            </Cell>
                          );
                        })}
                        <Cell pinned="right" className="px-2">
                          <RowMenu setId={setId} />
                        </Cell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rowDrag?.lineY !== undefined && (
              // Where the dragged row will land.
              <div aria-hidden className="pointer-events-none absolute right-0 left-0 z-[4] h-0.5 bg-[#4570FF]" style={{ top: rowDrag.lineY - 1 }} />
            )}
            {moreToTheRight && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 z-[3] w-[60px] bg-gradient-to-l from-[rgba(25,25,29,0.8)] to-[rgba(25,25,29,0)]"
                style={{ right: ACTIONS_COLUMN_WIDTH }}
              />
            )}
          </div>
          <AddSizeRow
            onAdd={(sizes) => {
              // Adapted from the primary, like any size added on the canvas — so they start with
              // the same content as the rest of the group, and join it as the table's last rows.
              const [newId] = addSizesTo(primaryId, sizes);
              if (newId) requestFocusPage(newId);
            }}
          />
        </div>
      </div>

      {picking && (
        <ImagePickerDialog
          open
          onOpenChange={(open) => !open && setPicking(null)}
          onSelect={(url) => {
            for (const target of picking) updateElement(target.layoutId, target.elementId, { imageUrl: url });
            setPicking(null);
          }}
        />
      )}
    </section>
  );
}

/** `null` = every channel; `''` = banners with no channel (custom sizes). */
type ChannelFilter = string | null;

/** What the Size filter lists a banner under: its size within its channel. */
type RowFacts = { sizeKey: string; width: number; height: number; label: string; channel: string; text: string };

/** What the filter bar matches a banner (a table row) on. */
function rowFacts(state: ReturnType<typeof useAppStore.getState>, setId: string): RowFacts | null {
  const set = state.setsById[setId];
  const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
  if (!set || !layout) return null;
  const groupId = state.pageGroupIdByPage[setId];
  const preset = getPreset(layout.size.presetId ?? '');
  // Same channel the Size column shows: the size's own preset's, else its group's.
  const channel = preset?.platformId ?? (groupId ? state.pageGroups[groupId]?.platformId : undefined) ?? '';
  return {
    sizeKey: `${channel}:${layout.size.width}x${layout.size.height}`,
    width: layout.size.width,
    height: layout.size.height,
    label: preset?.label ?? '',
    channel,
    text: [set.name, `${layout.size.width}x${layout.size.height}`, ...layout.elements.map((el) => (el.kind === 'text' ? (el.content ?? '') : ''))].join('\n').toLowerCase(),
  };
}

/** The look of the bar's two dropdown buttons (Figma "Button 32 / Secondary text"). */
const FILTER_BUTTON =
  'flex h-8 shrink-0 items-center gap-2 rounded-lg border border-[#40404A] bg-[#26262C] px-3 text-[14px] leading-[1.4] tracking-[-0.01em] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.03),0px_1px_3px_rgba(0,0,0,0.02),0px_2px_2px_rgba(0,0,0,0.02)] outline-none transition-colors hover:bg-[#2F2F37] data-[state=open]:bg-[#2F2F37]';

function FilterMenu<T extends string | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={FILTER_BUTTON}>
          {label}
          <img src="/icons/dropdown-16.svg" alt="" className="size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      {/* Same look as the rows' ⋮ menu. */}
      <DropdownMenuContent
        align="start"
        className="min-w-44 rounded-lg border p-1 text-white shadow-[0px_4px_32px_4px_rgba(0,0,0,0.24)] backdrop-blur-[16px]"
        style={MENU_SURFACE}
      >
        {options.map((option) => (
          <DropdownMenuItem key={String(option.value)} className={ROW_MENU_ITEM} onSelect={() => onChange(option.value)}>
            {option.icon && <img src={option.icon} alt="" className="size-4 shrink-0 rounded" />}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.value === value && <Check className="size-4 shrink-0 text-white" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The Size filter: the same size checklist as "Add more sizes", listing the sizes the banners
 * use (by channel). Ticking applies at once; nothing ticked shows every size. */
function SizeFilterMenu({ sizes, onChange, groups }: { sizes: Set<string>; onChange: (value: Set<string>) => void; groups: SizeListGroup[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((item) => !q || item.label.toLowerCase().includes(q) || `${item.width}x${item.height}`.includes(q)) }))
    .filter((g) => g.items.length > 0);
  const only = sizes.size === 1 ? groups.flatMap((g) => g.items).find((item) => sizes.has(item.id)) : undefined;
  const label = sizes.size === 0 ? t('All sizes') : only ? `${only.width}x${only.height}` : language === 'ja' ? `${sizes.size}件のサイズ` : `${sizes.size} sizes`;
  function toggleIds(ids: string[], on: boolean) {
    const next = new Set(sizes);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  }
  return (
    <Popover onOpenChange={(open) => !open && setQuery('')}>
      <PopoverTrigger asChild>
        <button type="button" className={FILTER_BUTTON}>
          {label}
          <img src="/icons/dropdown-16.svg" alt="" className="size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={SIZE_POPOVER}
        style={MENU_SURFACE}
      >
        <SizeSearchInput value={query} onChange={setQuery} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1">
          <SizeGroupList
            groups={visible}
            isSelected={(id) => sizes.has(id)}
            onToggle={(_, id) => toggleIds([id], !sizes.has(id))}
            onToggleGroup={(group) => toggleIds(group.items.map((item) => item.id), !group.items.every((item) => sizes.has(item.id)))}
          />
          {visible.length === 0 && <div className="px-2 py-4 text-center text-[13px] text-white/45">{t('No sizes match')}</div>}
        </div>
        {sizes.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex h-8 shrink-0 items-center justify-center rounded-full bg-chrome-border-subtle text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t('Show all sizes')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Channel and size filters on the left, a text search on the right — above the tables. */
function FilterBar({
  sizes,
  onSizesChange,
  sizeGroups,
  channel,
  onChannelChange,
  channels,
  query,
  onQueryChange,
}: {
  /** Ticked sizes (`RowFacts.sizeKey`s); none = every size. */
  sizes: Set<string>;
  onSizesChange: (value: Set<string>) => void;
  /** The sizes the playground's banners use, grouped by channel. */
  sizeGroups: SizeListGroup[];
  channel: ChannelFilter;
  onChannelChange: (value: ChannelFilter) => void;
  /** The channels the playground's banners actually use (`''` = custom sizes, no channel). */
  channels: string[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const t = useT();
  const channelName = (id: string) => (id === '' ? t('Custom') : (platforms.find((p) => p.id === id)?.name ?? id));
  const channelOptions: { value: ChannelFilter; label: string; icon?: string }[] = [
    { value: null, label: t('All channels') },
    ...channels.map((id) => ({ value: id, label: channelName(id), icon: id ? `/icons/ec-platform-icon/${id}.svg` : undefined })),
  ];
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <FilterMenu label={channel === null ? t('All channels') : channelName(channel)} value={channel} options={channelOptions} onChange={onChannelChange} />
        <SizeFilterMenu sizes={sizes} onChange={onSizesChange} groups={sizeGroups} />
      </div>
      <label className="flex h-8 w-[228px] shrink-0 items-center gap-2 overflow-hidden rounded-full border border-[#40404A] bg-[#26262C] px-3 focus-within:border-[#4570FF]">
        <Search className="size-4 shrink-0 text-white" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onQueryChange('')}
          placeholder={t('Search content')}
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.4] tracking-[-0.01em] text-white outline-none placeholder:text-white/25"
        />
      </label>
    </div>
  );
}

/**
 * The Bulk edit view's left-hand content area — every piece of content used across the playground,
 * one table per primary banner: a column per piece of content, a row per banner (the primary and
 * each of its sizes), each cell editable in place.
 */
export function BulkEditView() {
  const t = useT();
  const groups = useBannerGroups();
  const [sizes, setSizes] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<ChannelFilter>(null);
  const [query, setQuery] = useState('');
  // Subscribed so the filtering re-runs whenever a banner changes — an edit can change what a
  // search matches.
  const layoutsById = useAppStore((s) => s.layoutsById);
  const setsById = useAppStore((s) => s.setsById);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const factsState = { ...useAppStore.getState(), layoutsById, setsById, pageGroups, pageGroupIdByPage };
  const facts = new Map<string, RowFacts>();
  for (const g of groups) {
    for (const id of g.memberIds) {
      const f = rowFacts(factsState, id);
      if (f) facts.set(id, f);
    }
  }
  // Custom sizes ('') listed last.
  const channels = [...new Set([...facts.values()].map((f) => f.channel))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const q = query.trim().toLowerCase();
  const matches = (id: string) => {
    const f = facts.get(id);
    return Boolean(f) && (sizes.size === 0 || sizes.has(f!.sizeKey)) && (channel === null || f!.channel === channel) && (!q || f!.text.includes(q));
  };
  // The Size filter's list: each size the banners use once, under its channel (custom sizes last).
  const channelName = (id: string) => (id === '' ? t('Custom') : (platforms.find((p) => p.id === id)?.name ?? id));
  const sizeGroups: SizeListGroup[] = channels.map((ch) => {
    const items = new Map<string, SizeListGroup['items'][number]>();
    for (const f of facts.values()) {
      if (f.channel === ch && !items.has(f.sizeKey)) items.set(f.sizeKey, { id: f.sizeKey, width: f.width, height: f.height, label: f.label });
    }
    return { id: ch || 'custom', name: channelName(ch), icon: ch ? `/icons/ec-platform-icon/${ch}.svg` : undefined, items: [...items.values()] };
  });
  const shown = groups.map((g) => ({ ...g, rowIds: g.memberIds.filter(matches) })).filter((g) => g.rowIds.length > 0);
  // The preview fades every banner the filters/search leave out (see bulkEditFilterMatches).
  const filtering = sizes.size > 0 || channel !== null || q !== '';
  const matchesKey = filtering ? shown.flatMap((g) => g.rowIds).join(',') : null;
  const setBulkEditFilterMatches = useAppStore((s) => s.setBulkEditFilterMatches);
  useEffect(() => {
    setBulkEditFilterMatches(matchesKey === null ? null : matchesKey ? matchesKey.split(',') : []);
  }, [matchesKey, setBulkEditFilterMatches]);
  useEffect(() => () => setBulkEditFilterMatches(null), [setBulkEditFilterMatches]);
  return (
    // Below the floating header: the filter bar, fixed, then the tables scrolling under it — so
    // their scrollbar runs only down the tables, never behind the header or the filters.
    <div className="relative flex h-full animate-in flex-col bg-[#19191D] fade-in-0 duration-300" style={{ paddingTop: HEADER_HEIGHT }}>
      {groups.length > 0 && (
        // Reserves the same scrollbar room as the tables' area below (see SCROLLBAR_ROOM), so the bar
        // lines up with the tables on both sides.
        <div className="shrink-0 overflow-hidden" style={{ paddingTop: SCROLL_TOP_PADDING, paddingLeft: SIDE_PADDING, paddingRight: SIDE_PADDING, ...SCROLLBAR_ROOM }}>
          <FilterBar sizes={sizes} onSizesChange={setSizes} sizeGroups={sizeGroups} channel={channel} onChannelChange={setChannel} channels={channels} query={query} onQueryChange={setQuery} />
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          className="h-full overflow-x-hidden overflow-y-auto pb-6"
          style={{ paddingTop: groups.length > 0 ? FILTERS_TO_TABLES : SCROLL_TOP_PADDING, paddingLeft: SIDE_PADDING, paddingRight: SIDE_PADDING, ...SCROLLBAR_ROOM }}
        >
          <div className="flex flex-col gap-10">
            {shown.map((g) => (
              <BannerGroupTable key={g.primaryId} primaryId={g.primaryId} memberIds={g.memberIds} rowIds={g.rowIds} />
            ))}
            {groups.length === 0 && <span className="text-[13px] text-white/45">{t('No banners yet.')}</span>}
            {groups.length > 0 && shown.length === 0 && <span className="text-[13px] text-white/45">{t('No banners match these filters.')}</span>}
          </div>
        </div>
        {/* Tables scrolling up fade out at the top of their area, just under the filters, in the
            page's own background color, instead of being cut off by a hard edge. Stops short of
            the right edge so the scrollbar stays visible. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-3 left-0 z-[5]"
          style={{ height: TOP_FADE_LENGTH, background: `linear-gradient(to bottom, ${ROW_BG}, rgba(25, 25, 29, 0))` }}
        />
      </div>
    </div>
  );
}
