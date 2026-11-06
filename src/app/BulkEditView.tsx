import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, EllipsisVertical, ImageIcon, Plus, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { isRealLayer } from '@/lib/create-layout';
import { getPreset } from '@/lib/mock/presets';
import { nearestPreset, platforms } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { RatioIcon } from '@/components/RatioIcon';
import { CreateModeIcon } from './ModeSwitch';
import { ColorPickerPopover } from '@/features/editor/artboard/ColorPickerPopover';
import { ImagePickerDialog } from '@/features/editor/artboard/ImagePickerDialog';
import { GROUPS, type ListItem, type QuickSizeResult } from '@/features/editor/artboard/QuickSizeMenu';
import { Button } from '@/components/ui/button';
import { addSizesTo } from '@/features/editor/artboard/add-sizes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { duplicateBanner } from '@/features/editor/artboard/duplicate-banner';
import { SegmentedControl, SelectButton, Tag } from '@/features/editor/artboard/PanelKit';
import { bannerSetGroups, deleteBannerSet, duplicateBannerSet, moveBannerSet } from '@/features/editor/artboard/banner-sets';
import { canvasRootOf } from '@/lib/canvas-layout';
import { bannerChannel } from '@/lib/canvas-order';
import type { Layout, LayoutElement } from '@/types';
import type { BulkEditCanvasOrder } from '@/store/types';
import { formatSize, normalizeSizeQuery } from '@/lib/format-size';

const BORDER = '#40404A';
/** The table's own lines — its outer frame and the grid between cells. */
const TABLE_BORDER = '#2A2A2C';
/** How long the glimmer on freshly filled cells plays — matches `.cell-glimmer` in index.css. */
const GLIMMER_MS = 600;
// Columns are sized by the content they hold: Size small with one size per row, large in the
// grouped view, texts medium (sharing the remaining width), images and colors smallest — just the
// thumbnail / dot.
/** The Size column: S holds one size (its icon and WxH) per row; L, in the grouped view, a row's
 * several sizes, a few per line. */
const SIZE_COLUMN_WIDTH = { S: 144, L: 240 };
/** Image and color columns: the thumbnail / dot alone. */
const SMALL_COLUMN_WIDTH = 64;
/** Text columns share the remaining width, never narrower than this — below it, the table scrolls
 * sideways instead. */
const TEXT_COLUMN_MIN_WIDTH = 160;
/** The leftmost column: the checkbox (16px) centered, 12px each side and its border. The row's drag
 * handle (12px) appears in the left margin on hover, over nothing — so revealing it moves nothing. */
const CHECKBOX_COLUMN_WIDTH = 41;
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
const SCROLL_TOP_PADDING = 80 - HEADER_HEIGHT;
/** Space between the filter bar and the first table (the top of the tables' scrolling area). */
const FILTERS_TO_TABLES = 40;
/** Base background of every cell — opaque (the page's own color) so the pinned columns cover
 * whatever scrolls underneath them. */
const ROW_BG = '#19191D';
/** A text's color column is keyed by its element's id plus this — the color's own cells, under the
 * text's header, with their own selection and fill handle. */
const TEXT_COLOR_SUFFIX = '#color';
/** Likewise a text's fill column (the box behind the text), for texts that have one. */
const TEXT_FILL_SUFFIX = '#fill';
const elementIdOf = (columnId: string) => columnId.replace(/#(color|fill)$/, '');
const isTextColorColumn = (columnId: string) => columnId.endsWith(TEXT_COLOR_SUFFIX);
const isTextFillColumn = (columnId: string) => columnId.endsWith(TEXT_FILL_SUFFIX);
/** A column's cells, left to right: a text's color, its fill (when it has one), then the text. */
const columnParts = (col: Column) => (col.kind === 'text' ? [`${col.id}${TEXT_COLOR_SUFFIX}`, ...(col.hasFill ? [`${col.id}${TEXT_FILL_SUFFIX}`] : []), col.id] : [col.id]);
/** Width of a text's color column (just the dot). */
const TEXT_COLOR_COLUMN_WIDTH = 44;
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
/** `hasFill`: a text drawn on a fill of its own (`style.fill`, the box behind it) — it gets a fill
 * column too. */
type Column = { id: string; kind: LayoutElement['kind']; index: number; hasFill: boolean };

function contentColumns(primary: Layout): Column[] {
  const counts: Partial<Record<LayoutElement['kind'], number>> = {};
  return (
    primary.elements
      // Only real content, as in the Layers list: no untouched placeholders — neither "Add headline"
      // texts nor the built-in image slot every new banner starts with, which would otherwise show
      // up as an always-empty "Image 1" when the banner's images are layers of their own.
      .filter(isRealLayer)
      .map((el) => {
        counts[el.kind] = (counts[el.kind] ?? 0) + 1;
        return { id: el.id, kind: el.kind, index: counts[el.kind]!, hasFill: el.kind === 'text' && Boolean(el.style.fill) };
      })
  );
}

/** Each primary banner with its own sizes — the same grouping the Banners list uses. */
function useBannerGroups(): { primaryId: string; memberIds: string[] }[] {
  const pageOrder = useAppStore((s) => s.pageOrder);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  return bannerSetGroups({ pageOrder, pageGroups, pageGroupIdByPage });
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
        // own grid lines. Not clipped, so its fill handle can sit across the bottom edge. A color cell
        // stays active while its picker is open, though focus has moved into the picker.
        editable
          ? 'group/cell relative p-0 focus-within:bg-button-primary/10! focus-within:shadow-[inset_0_0_0_1px_var(--button-primary)] has-[[data-cell-field][data-state=open]]:bg-button-primary/10! has-[[data-cell-field][data-state=open]]:shadow-[inset_0_0_0_1px_var(--button-primary)]'
          : 'overflow-hidden px-2',
        // The rest of a multi-cell selection is just tinted; only the cell being edited (focus-within
        // above) gets the border.
        selected && 'bg-button-primary/15!',
        className,
      )}
      style={{ borderColor: TABLE_BORDER }}
    >
      {editable ? children : <div className="flex h-full min-w-0 items-center gap-2">{children}</div>}
      {glimmer !== undefined && <span key={glimmer} aria-hidden className="cell-glimmer pointer-events-none absolute inset-0" />}
      {onFillHandleMouseDown && (
        <span
          aria-hidden
          onMouseDown={onFillHandleMouseDown}
          // A larger invisible grab area around the 16×6 handle.
          className="absolute right-[6px] -bottom-[2px] z-[1] hidden h-[6px] w-4 cursor-ns-resize rounded-[8px] border border-button-primary bg-[#2F2F37] group-focus-within/cell:block group-has-[[data-cell-field][data-state=open]]/cell:block before:absolute before:-inset-x-1 before:-inset-y-2"
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
      className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors', checked ? 'border-button-primary bg-button-primary' : 'border-chrome-border bg-chrome-border-subtle hover:border-button-primary')}
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

/** A text's font color — or its background fill — in its own narrow column right before the text
 * (all under the text's header), drawn so the two can't be confused: the font color as a "T" in that
 * color, the background as a color dot (like every color in the table). Both
 * open the color picker; a faint outline keeps dark colors visible on the dark table. */
function TextColorCell({ color, onChange, variant }: { color: string; onChange: (color: string) => void; variant: 'font' | 'background' }) {
  const t = useT();
  const label = variant === 'font' ? t('Text color') : t('Text fill');
  return (
    <ColorPickerPopover color={color} onChange={onChange}>
      <button type="button" data-cell-field aria-label={label} title={label} className="flex h-12 w-full items-center justify-center outline-none">
        {variant === 'font' ? (
          // A "T" in the text's color.
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-4 shrink-0 overflow-visible" aria-hidden>
            <path
              d="M12.8889 0C14.6071 0 16 1.39289 16 3.11111V4.88889H13.3333V3.11111C13.3333 2.86565 13.1343 2.66667 12.8889 2.66667H9.33333V13.3333H11.5556V16H4.44444V13.3333H6.66667V2.66667H3.11111C2.86565 2.66667 2.66667 2.86565 2.66667 3.11111V4.88889H0V3.11111C0 1.39289 1.39289 0 3.11111 0H12.8889Z"
              fill={color}
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth={0.75}
            />
          </svg>
        ) : (
          // A color dot, like every color in the table (same as a shape's, FillCell).
          <span className="size-6 shrink-0 rounded-full border border-white/20" style={{ background: color }} />
        )}
      </button>
    </ColorPickerPopover>
  );
}

/** Just the thumbnail (a narrow column) — clicking it opens the image picker. */
function ImageCell({ url, onPick }: { url: string | undefined; onPick: () => void }) {
  const t = useT();
  return (
    <div
      data-cell-field
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onPick()}
      // A 48px thumbnail with 8px around it — rows holding images are 64px tall.
      className="flex h-16 w-full min-w-0 items-center justify-center px-2 outline-none"
    >
      <button
        type="button"
        aria-label={t('Select or drop')}
        onClick={onPick}
        className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white/10 bg-cover bg-center text-white/45 outline-none transition-shadow hover:shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
        style={url ? { backgroundImage: `url(${url})` } : undefined}
      >
        {!url && <ImageIcon className="size-5" />}
      </button>
    </div>
  );
}

/** Just the color dot (a narrow column) — clicking it opens the color picker. */
function FillCell({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useT();
  return (
    <ColorPickerPopover color={color} onChange={onChange}>
      <button type="button" data-cell-field aria-label={t('Color')} className="flex h-12 w-full items-center justify-center px-2 outline-none">
        <span className="size-6 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
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
      style={{ background: checked ? 'var(--button-primary)' : '#26262C', borderColor: checked ? 'var(--button-primary)' : BORDER }}
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
            {formatSize(item.width, item.height)}
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
    items: g.items.filter((item) => !q || item.label.toLowerCase().includes(q) || `${item.width}x${item.height}`.includes(normalizeSizeQuery(q))),
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
                  {formatSize(typed.width, typed.height)}
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
                  {formatSize(custom.width, custom.height)}
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
    // The field is exactly as wide as its text: an invisible copy of the text sets the width and the
    // input lies over it (left in the flow, an input keeps a default width of its own), with the
    // underline along both.
    return (
      <span className={cn('relative min-w-0 border-b border-button-primary', textClass)}>
        <span aria-hidden className="invisible block overflow-hidden pr-px whitespace-pre">
          {draft || ' '}
        </span>
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
          className="absolute inset-0 size-full min-w-0 bg-transparent p-0 outline-none"
        />
      </span>
    );
  }
  return (
    <span onDoubleClick={() => setDraft(name)} className={cn('min-w-0 cursor-default truncate select-none', textClass)}>
      {name}
    </span>
  );
}

/** The set menu's Move up arrow (flipped for Move down), inline in `currentColor`. */
function MoveArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M13.5303 7.46973L12.4697 8.53027L8.75 4.81055L8.75 13L7.25 13L7.25 4.81055L3.53027 8.53027L2.46973 7.46973L8 1.93945L13.5303 7.46973Z" fill="currentColor" />
    </svg>
  );
}

/** Right of a set's name: how many banners the set holds — every size, whatever the filters show. */
function BannerCountTag({ count }: { count: number }) {
  const language = useAppStore((s) => s.language);
  return (
    <Tag className="ml-1">{language === 'ja' ? `${count}件のバナー` : `${count} banner${count === 1 ? '' : 's'}`}</Tag>
  );
}

/** Left of a set's name: folds its table away (and back). The chevron points right while folded. */
function CollapseSetButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t(collapsed ? 'Expand set' : 'Collapse set')}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors outline-none hover:bg-white/10 hover:text-white"
    >
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn('size-4 transition-transform', collapsed && '-rotate-90')} aria-hidden>
        <path d="M12.5303 6.53027L8 11.0605L3.46973 6.53027L4.53027 5.46973L8 8.93945L11.4697 5.46973L12.5303 6.53027Z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** The ⋮ next to a set's name (same as the rows' own) (shown while hovering it): move the set up or down, or duplicate or
 * delete the whole set — its primary and every size. */
function SetMenu({ primaryId }: { primaryId: string }) {
  const t = useT();
  const groups = useBannerGroups();
  const index = groups.findIndex((g) => g.primaryId === primaryId);
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
        <DropdownMenuItem className={ROW_MENU_ITEM} disabled={index <= 0} onSelect={() => moveBannerSet(primaryId, -1)}>
          <MoveArrowIcon className="size-4 shrink-0 text-white" />
          {t('Move up')}
        </DropdownMenuItem>
        <DropdownMenuItem className={ROW_MENU_ITEM} disabled={index < 0 || index >= groups.length - 1} onSelect={() => moveBannerSet(primaryId, 1)}>
          <MoveArrowIcon className="size-4 shrink-0 rotate-180 text-white" />
          {t('Move down')}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 h-px" style={{ background: BORDER }} />
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

/** Every distinct color a set uses, across all its banners: texts' colors and backgrounds, shapes'
 * and vectors' fills, and the banners' own backgrounds — in order of first use. */
function setPalette(state: ReturnType<typeof useAppStore.getState>, bannerIds: string[]): string[] {
  const seen = new Map<string, string>();
  const add = (color: string | undefined) => {
    if (color && !seen.has(color.toUpperCase())) seen.set(color.toUpperCase(), color);
  };
  for (const id of bannerIds) {
    const layout = state.setsById[id] ? state.layoutsById[state.setsById[id].sourceLayoutId] : undefined;
    if (!layout) continue;
    add(layout.backgroundColor);
    for (const el of layout.elements) {
      if (!isRealLayer(el)) continue;
      if (el.kind === 'text') add(el.style.color);
      if (el.kind !== 'image') add(el.style.fill);
    }
  }
  return [...seen.values()];
}

/** Replaces one color with another everywhere the set uses it (see setPalette). */
function replaceSetColor(bannerIds: string[], from: string, to: string) {
  const state = useAppStore.getState();
  const same = (color: string | undefined) => Boolean(color) && color!.toUpperCase() === from.toUpperCase();
  for (const id of bannerIds) {
    const layout = state.setsById[id] ? state.layoutsById[state.setsById[id].sourceLayoutId] : undefined;
    if (!layout) continue;
    if (same(layout.backgroundColor)) state.updateLayoutStyle(layout.id, { backgroundColor: to });
    for (const el of layout.elements) {
      const color = el.kind === 'text' && same(el.style.color);
      const fill = el.kind !== 'image' && same(el.style.fill);
      if (!color && !fill) continue;
      state.updateElement(layout.id, el.id, { style: { ...el.style, ...(color ? { color: to } : {}), ...(fill ? { fill: to } : {}) } });
    }
  }
}

/** One color of a set's palette: a dot that opens the color picker. Remembers the color it last
 * set, so each step of a drag in the picker replaces the previous step's color, not the original. */
function PaletteColor({ color, bannerIds }: { color: string; bannerIds: string[] }) {
  const t = useT();
  const currentRef = useRef(color);
  useEffect(() => {
    currentRef.current = color;
  }, [color]);
  return (
    <ColorPickerPopover
      color={color}
      onChange={(next) => {
        replaceSetColor(bannerIds, currentRef.current, next);
        currentRef.current = next;
      }}
    >
      <button
        type="button"
        aria-label={`${t('Color')} ${color}`}
        title={color}
        className="size-6 shrink-0 rounded-full border border-white/20 outline-none transition-shadow hover:shadow-[0_0_0_1px_rgba(255,255,255,0.65)] focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
        style={{ background: color }}
      />
    </ColorPickerPopover>
  );
}

/** On the right of a set's heading: every color the set uses, each changeable everywhere at once. */
function SetPalette({ bannerIds }: { bannerIds: string[] }) {
  const t = useT();
  // Re-read whenever banners change, so the dots follow every edit.
  useAppStore((s) => s.layoutsById);
  const colors = setPalette(useAppStore.getState(), bannerIds);
  if (colors.length === 0) return null;
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 pl-4" aria-label={t('Colors used in this set')}>
      {colors.map((color, i) => (
        <PaletteColor key={i} color={color} bannerIds={bannerIds} />
      ))}
    </div>
  );
}

/** Where a table would be, before there's anything to replace: no banner yet, or a banner with no
 * layer yet. Points to the Create mode, where banners are made. */
function EmptyTableState() {
  const t = useT();
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border px-6 py-12 text-center" style={{ borderColor: TABLE_BORDER }}>
      <p className="max-w-[360px] text-[14px] leading-[1.6] tracking-[-0.01em] text-white/65">
        {t('Create your first banner in the')}{' '}
        {/* A colored tag, in the Create mode's own color (the selected mode's blue). */}
        <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-button-primary/20 px-2 py-1 align-middle text-[14px] leading-none text-[#6B8DFF]">
          <CreateModeIcon className="size-3.5" />
          {t('Create mode')}
        </span>{' '}
        {t('before replacing the content here.')}
      </p>
      <Button size="sm" className="text-[13px] rounded-lg" onClick={() => setWorkspaceView('edit')}>
        {t('Go to create mode')}
      </Button>
    </div>
  );
}

function BannerGroupTable({
  primaryId,
  memberIds,
  rowIds: bannerIds,
  combine,
}: {
  primaryId: string;
  memberIds: string[];
  rowIds: string[];
  /** "Grouped by content" view: banners with the same content in every column share one row. */
  combine: boolean;
}) {
  // `memberIds` is the whole group, in its order; `bannerIds` the ones the filter bar lets through.
  // `rowIds` are the rows actually shown — one per banner, or in the grouped view one per distinct
  // content, keyed by its first banner — which cell-selection and fill ranges run over; `membersOf`
  // turns a row back into the banners it stands for (what every edit is applied to).
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => setCollapsed((c) => !c);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsByIdForRows = useAppStore((s) => s.layoutsById);
  const rowMembers = new Map<string, string[]>();
  if (combine) {
    const primaryLayout = setsById[primaryId] ? layoutsByIdForRows[setsById[primaryId].sourceLayoutId] : undefined;
    const columnIds = primaryLayout ? contentColumns(primaryLayout).map((c) => c.id) : [];
    const keyBySignature = new Map<string, string>();
    for (const id of bannerIds) {
      const layout = setsById[id] ? layoutsByIdForRows[setsById[id].sourceLayoutId] : undefined;
      const signature = columnIds
        .map((colId) => {
          const el = layout?.elements.find((e) => e.id === colId);
          if (!el) return '-';
          return el.kind === 'text' ? `t:${el.content ?? ''}:${el.style.color ?? ''}:${el.style.fill ?? ''}` : el.kind === 'image' ? `i:${el.imageUrl ?? ''}` : `f:${el.style.fill ?? ''}:${el.style.opacity ?? 100}`;
        })
        .join('\u0000');
      const key = keyBySignature.get(signature);
      if (key) rowMembers.get(key)!.push(id);
      else {
        keyBySignature.set(signature, id);
        rowMembers.set(id, [id]);
      }
    }
  }
  const rowIds = combine ? [...rowMembers.keys()] : bannerIds;
  const membersOf = (rowId: string) => rowMembers.get(rowId) ?? [rowId];
  // Row reordering is the whole group's order, one banner at a time — off while filtering or grouping.
  const filtered = bannerIds.length !== memberIds.length || combine;
  const layoutsById = useAppStore((s) => s.layoutsById);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
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
    const source = sourceSet ? state.layoutsById[sourceSet.sourceLayoutId]?.elements.find((el) => el.id === elementIdOf(done.columnId)) : undefined;
    if (!source) return;
    const targets = done.rowIds.filter((id) => id !== done.sourceId);
    applyToRows(
      targets,
      done.columnId,
      (el): Partial<LayoutElement> =>
        isTextColorColumn(done.columnId)
          ? { style: { ...el.style, color: source.style.color } }
          : isTextFillColumn(done.columnId)
          ? { style: { ...el.style, fill: source.style.fill } }
          : el.kind === 'text'
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
  function applyToRows(rows: string[], columnId: string, patch: (el: LayoutElement) => Partial<LayoutElement>) {
    const state = useAppStore.getState();
    const rowIds = rows.flatMap(membersOf);
    for (const rowId of rowIds) {
      const set = state.setsById[rowId];
      const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
      const el = layout?.elements.find((candidate) => candidate.id === elementIdOf(columnId));
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
    if (selectionRowsKey) useAppStore.getState().requestFocusPages(selectionRowsKey.split(',').flatMap(membersOf));
  }, [selectionRowsKey]);
  useEffect(() => {
    const store = useAppStore.getState();
    if (!activeCell) {
      // Only this table's own outline — another table may have just set one.
      if (store.bulkEditHighlight?.pageIds.some((id) => memberIds.includes(id))) store.setBulkEditHighlight(null);
      return;
    }
    const inSelection = cellSelection && cellSelection.columnId === activeCell.columnId && cellSelection.rowIds.includes(activeCell.setId);
    store.setBulkEditHighlight({ elementId: elementIdOf(activeCell.columnId), pageIds: (inSelection ? cellSelection.rowIds : [activeCell.setId]).flatMap(membersOf) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell, cellSelection]);
  function focusBanner(setId: string) {
    // Outlined in the preview like a selected banner, for as long as you're in its row.
    setBulkEditActivePage(setId);
    if (lastFocusedRef.current === setId) return;
    lastFocusedRef.current = setId;
    // A grouped row stands for several banners: frame all of them.
    const banners = membersOf(setId);
    if (banners.length > 1) useAppStore.getState().requestFocusPages(banners);
    else requestFocusPage(setId);
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
  const allRowsChecked = bannerIds.every((id) => selectedSceneIds.includes(id));
  function toggleAllRows() {
    const others = selectedSceneIds.filter((id) => !bannerIds.includes(id));
    selectScenes(allRowsChecked ? others : [...others, ...bannerIds]);
    frameCheckedBanners();
  }
  /** After a checkbox changes: the preview frames every checked banner (or just the one). */
  function frameCheckedBanners() {
    const checked = useAppStore.getState().selectedSceneIds;
    if (checked.length > 1) useAppStore.getState().requestFocusPages(checked);
    else if (checked.length === 1) requestFocusPage(checked[0]);
  }
  const columns = contentColumns(primary);
  // Nothing to replace until the banner has at least one layer: the empty state instead of the
  // table, and no "Add more sizes" either.
  if (columns.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <div className="group/heading flex min-w-0 items-center gap-1">
          <CollapseSetButton collapsed={collapsed} onToggle={toggleCollapsed} />
          <SetName primaryId={primaryId} name={setsById[primaryId]?.name || t('Primary')} />
          <BannerCountTag count={memberIds.length} />
          <SetMenu primaryId={primaryId} />
        </div>
        {!collapsed && <EmptyTableState />}
      </section>
    );
  }
  const groupPlatformId = pageGroups[pageGroupIdByPage[primaryId]]?.platformId;
  const sizeColumnWidth = combine ? SIZE_COLUMN_WIDTH.L : SIZE_COLUMN_WIDTH.S;

  return (
    <section className="flex flex-col gap-2">
      <div className="group/heading flex min-w-0 items-center gap-1">
        {/* The primary banner's own name, as in the Banners list (renaming it there renames this
            too, and the other way round). Double-click to rename. */}
        <CollapseSetButton collapsed={collapsed} onToggle={toggleCollapsed} />
        <SetName primaryId={primaryId} name={setsById[primaryId]?.name || t('Primary')} />
        <BannerCountTag count={memberIds.length} />
        <SetMenu primaryId={primaryId} />
        <SetPalette bannerIds={memberIds} />
      </div>

      {/* One rounded frame around the table. Inside it the checkbox column (left) and the row
          actions (right) stay pinned, while Size and the content columns between them scroll
          sideways: they fill the available width, sharing it equally (fixed layout, so long
          content truncates instead of widening its column), and below TEXT_COLUMN_MIN_WIDTH each the
          table stops shrinking and scrolls instead, with a fade at the right edge of the scrolling
          part while there's more to see. No native drag-and-drop of a field's selected text either:
          pressing on already-selected text and moving would otherwise start dragging that text
          away instead of a cell-selection drag. */}
      {!collapsed && (
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
                  style={{
                    minWidth:
                      CHECKBOX_COLUMN_WIDTH +
                      ACTIONS_COLUMN_WIDTH +
                      sizeColumnWidth +
                      columns.reduce((sum, c) => sum + (c.kind === 'text' ? TEXT_COLOR_COLUMN_WIDTH * (c.hasFill ? 2 : 1) + TEXT_COLUMN_MIN_WIDTH : SMALL_COLUMN_WIDTH), 0),
                  }}
                >
                  {/* Column widths (a fixed-layout table takes them from here) — see SIZE_COLUMN_WIDTH. */}
                  <colgroup>
                    <col style={{ width: CHECKBOX_COLUMN_WIDTH }} />
                    <col style={{ width: sizeColumnWidth }} />
                    {columns.flatMap((c) =>
                      c.kind === 'text'
                        ? columnParts(c).map((part) => <col key={part} style={{ width: part === c.id ? undefined : TEXT_COLOR_COLUMN_WIDTH }} />)
                        : [<col key={c.id} style={{ width: SMALL_COLUMN_WIDTH }} />],
                    )}
                    <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[2] h-10 border-r border-b px-3" style={{ borderColor: TABLE_BORDER, background: ROW_BG, width: CHECKBOX_COLUMN_WIDTH }}>
                        <RowCheckbox checked={allRowsChecked} onChange={toggleAllRows} />
                      </th>
                      {[
                        { id: 'size', label: t('Size'), short: t('Size'), icon: '/icons/edit_panel/panel_image.svg', kind: null },
                        ...columns.map((c) => ({ id: c.id, label: `${t(KIND_LABELS[c.kind])} ${c.index}`, short: String(c.index), icon: KIND_ICONS[c.kind], kind: c.kind })),
                      ].map((col, i, all) => {
                        // Image and color columns are narrow: their header shows just the icon and number.
                        const small = col.kind !== null && col.kind !== 'text';
                        return (
                          <th
                            key={col.id}
                            // A text's header spans all its columns: color, fill (if any), then text.
                            colSpan={col.kind === 'text' ? columnParts(columns.find((c) => c.id === col.id)!).length : undefined}
                            title={small ? col.label : undefined}
                            className={cn('h-10 border-b px-2 text-left text-[13px] font-normal tracking-[-0.01em] text-white/45', i < all.length - 1 && 'border-r')}
                            style={{ borderColor: TABLE_BORDER, background: ROW_BG }}
                          >
                            <div className={cn('flex min-w-0 items-center gap-1', small && 'justify-center')}>
                              <img src={col.icon} alt="" className="size-6 shrink-0" />
                              <span className="truncate">{small ? col.short : col.label}</span>
                            </div>
                          </th>
                        );
                      })}
                      <th className="sticky right-0 z-[2] h-10 border-b border-l" style={{ borderColor: TABLE_BORDER, background: ROW_BG, width: ACTIONS_COLUMN_WIDTH }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rowIds.map((setId) => {
                      const layout = layoutOf(setId);
                      if (!layout) return null;
                      const banners = membersOf(setId);
                      const sizes = banners.map((id) => layoutOf(id)).filter((l): l is Layout => Boolean(l)).map((l) => formatSize(l.size.width, l.size.height));
                      // Each channel among the row's banners, once (banners with none add no icon).
                      const channelIcons = [
                        ...new Set(
                          banners.flatMap((id) => {
                            const l = layoutOf(id);
                            const ch = l ? (getPreset(l.size.presetId ?? '')?.platformId ?? groupPlatformId) : undefined;
                            return ch ? [ch] : [];
                          }),
                        ),
                      ];
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
                          <Cell pinned="left" className="group/lead px-3">
                            {/* The drag handle shows in the left margin while hovering this column — not on the
                                primary (it always stays first), nor while filters or grouping are on (the
                                order is the whole group's, one banner at a time). */}
                            {setId !== primaryId && !filtered && (
                              <img
                                src="/icons/drag-12.svg"
                                alt=""
                                draggable={false}
                                onMouseDown={(e) => startRowDrag(e, setId)}
                                className={cn(
                                  'absolute top-1/2 left-0 size-3 -translate-y-1/2 cursor-grab opacity-0 transition-opacity group-hover/lead:opacity-100',
                                  rowDrag?.id === setId && 'opacity-100',
                                )}
                              />
                            )}
                            <RowCheckbox
                              checked={banners.every((id) => selectedSceneIds.includes(id))}
                              onChange={() => {
                                const all = banners.every((id) => selectedSceneIds.includes(id));
                                const others = selectedSceneIds.filter((id) => !banners.includes(id));
                                selectScenes(all ? others : [...others, ...banners]);
                                frameCheckedBanners();
                              }}
                            />
                          </Cell>
                          <Cell className={columns.length === 0 ? 'border-r-0' : undefined}>
                            {sizes.length > 1 ? (
                              // A grouped row: its channels' icons on their own line, then every size it
                              // stands for, in full — wrapping onto more lines (the row grows) rather than
                              // cutting any off.
                              <div className="flex min-w-0 flex-col gap-1 py-2">
                                {channelIcons.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    {channelIcons.map((id) => (
                                      <img key={id} src={`/icons/ec-platform-icon/${id}.svg`} alt="" className="size-6 shrink-0 rounded-[6px]" />
                                    ))}
                                  </div>
                                )}
                                <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
                                  {sizes.map((size, i) => (
                                    <span key={i} className="whitespace-nowrap">
                                      {size}
                                      {i < sizes.length - 1 && ','}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ) : (
                              <>
                                {platformId ? (
                                  <img src={`/icons/ec-platform-icon/${platformId}.svg`} alt="" className="size-6 shrink-0 rounded-[6px]" />
                                ) : (
                                  <RatioIcon width={layout.size.width} height={layout.size.height} className="size-6 shrink-0" />
                                )}
                                <span className="truncate">{sizes[0]}</span>
                              </>
                            )}
                          </Cell>
                          {columns.flatMap((col, ci) => {
                            // A text has two cells under its header: its color, then the text itself.
                            const parts = columnParts(col);
                            return parts.map((columnId) => {
                              // The pinned actions column already draws the separator after the last one.
                              const lastClass = ci === columns.length - 1 && columnId === col.id ? 'border-r-0' : undefined;
                              const el = layout.elements.find((e) => e.id === col.id);
                              // A size just added is still "generating" (same loading time as on the canvas)
                              // — nothing to edit yet.
                              if (banners.some((id) => loadingPageIds[id])) {
                                return (
                                  <Cell key={columnId} className={lastClass}>
                                    {elementIdOf(columnId) === columnId && <LoadingCell />}
                                  </Cell>
                                );
                              }
                              if (!el) {
                                return (
                                  <Cell key={columnId} className={lastClass}>
                                    {elementIdOf(columnId) === columnId && <Missing />}
                                  </Cell>
                                );
                              }
                              const rows = () => targetRows(setId, columnId);
                              const multiSelected =
                                Boolean(cellSelection && cellSelection.rowIds.length > 1 && cellSelection.columnId === columnId && cellSelection.rowIds.includes(setId)) ||
                                Boolean(fill && fill.columnId === columnId && fill.sourceId !== setId && fill.rowIds.includes(setId));
                              return (
                                <Cell
                                  key={columnId}
                                  className={lastClass}
                                  editable
                                  cellKey={`${setId}:${columnId}`}
                                  selected={multiSelected}
                                  onMouseDown={(e) => handleCellMouseDown(e, setId, columnId)}
                                  onMouseEnter={(e) => handleCellMouseEnter(e, setId, columnId)}
                                  onFillHandleMouseDown={(e) => startFill(e, setId, columnId)}
                                  glimmer={glimmer && glimmer.columnId === columnId && glimmer.rowIds.includes(setId) ? glimmer.stamp : undefined}
                                >
                                  {el.kind === 'text' &&
                                    (isTextColorColumn(columnId) ? (
                                      <TextColorCell
                                        variant="font"
                                        // Same default as the canvas draws an uncolored text in.
                                        color={el.style.color ?? '#18181b'}
                                        onChange={(color) => applyToRows(rows(), columnId, (target) => ({ style: { ...target.style, color } }))}
                                      />
                                    ) : isTextFillColumn(columnId) ? (
                                      <TextColorCell
                                        variant="background"
                                        color={el.style.fill ?? 'transparent'}
                                        onChange={(fill) => applyToRows(rows(), columnId, (target) => ({ style: { ...target.style, fill } }))}
                                      />
                                    ) : (
                                      <TextCell value={el.content ?? ''} onCommit={(content) => applyToRows(rows(), columnId, () => ({ content }))} />
                                    ))}
                                  {el.kind === 'image' && (
                                    <ImageCell
                                      url={el.imageUrl}
                                      onPick={() =>
                                        setPicking(
                                          rows().flatMap(membersOf).flatMap((rowId) => {
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
                                      onChange={(fill) => applyToRows(rows(), columnId, (target) => ({ style: { ...target.style, fill } }))}
                                    />
                                  )}
                                </Cell>
                              );
                            });
                          })}
                          <Cell pinned="right" className="px-2">
                            {/* Its actions are about one banner — none on a row standing for several. */}
                            {banners.length === 1 && <RowMenu setId={setId} />}
                          </Cell>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rowDrag?.lineY !== undefined && (
                // Where the dragged row will land.
                <div aria-hidden className="pointer-events-none absolute right-0 left-0 z-[4] h-0.5 bg-button-primary" style={{ top: rowDrag.lineY - 1 }} />
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
      )}

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
  const preset = getPreset(layout.size.presetId ?? '');
  // Same channel the Size column shows: the size's own preset's, else its group's.
  const channel = bannerChannel(state, setId);
  return {
    sizeKey: `${channel}:${layout.size.width}x${layout.size.height}`,
    width: layout.size.width,
    height: layout.size.height,
    label: preset?.label ?? '',
    channel,
    text: [set.name, `${layout.size.width}x${layout.size.height}`, formatSize(layout.size.width, layout.size.height), ...layout.elements.map((el) => (el.kind === 'text' ? (el.content ?? '') : ''))].join('\n').toLowerCase(),
  };
}

/** One of the bar's dropdowns (also the preview's ordering): the shared select button and a menu. */
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
        <SelectButton className="h-8">{label}</SelectButton>
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

const CANVAS_ORDERS: { value: BulkEditCanvasOrder; label: string }[] = [
  { value: 'set', label: 'By set' },
  { value: 'format', label: 'By format' },
  { value: 'channel', label: 'By channel' },
  { value: 'size', label: 'By size' },
];

/** At the top left of Replace's preview: how it arranges the banners — by set (each primary with
 * its sizes), or in columns by format, channel or size. */
export function CanvasOrderSwitch() {
  const t = useT();
  const order = useAppStore((s) => s.bulkEditCanvasOrder);
  const setOrder = useAppStore((s) => s.setBulkEditCanvasOrder);
  const hasBanners = useAppStore((s) => s.pageOrder.length > 0);
  if (!hasBanners) return null;
  return (
    <div className="pointer-events-auto absolute top-4 left-4 z-10" aria-label={t('Order banners')}>
      <FilterMenu
        label={t(CANVAS_ORDERS.find((o) => o.value === order)!.label)}
        value={order}
        options={CANVAS_ORDERS.map((o) => ({ value: o.value, label: t(o.label) }))}
        onChange={setOrder}
      />
    </div>
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
    .map((g) => ({ ...g, items: g.items.filter((item) => !q || item.label.toLowerCase().includes(q) || `${item.width}x${item.height}`.includes(normalizeSizeQuery(q))) }))
    .filter((g) => g.items.length > 0);
  const only = sizes.size === 1 ? groups.flatMap((g) => g.items).find((item) => sizes.has(item.id)) : undefined;
  const label = sizes.size === 0 ? t('All sizes') : only ? formatSize(only.width, only.height) : language === 'ja' ? `${sizes.size}件のサイズ` : `${sizes.size} sizes`;
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
        <SelectButton className="h-8">{label}</SelectButton>
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

/** "One row per banner" — a table, inline in `currentColor` so it follows the button's color. */
function OneRowPerBannerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M13 0C14.6569 0 16 1.34315 16 3V13C16 14.6569 14.6569 16 13 16H3L2.8457 15.9961C1.26055 15.9158 0 14.6051 0 13V3C0 1.34315 1.34315 0 3 0H13ZM6.25 14.5H13C13.8284 14.5 14.5 13.8284 14.5 13V12.25H6.25V14.5ZM1.5 13C1.5 13.8284 2.17157 14.5 3 14.5H4.75V12.25H1.5V13ZM6.25 10.75H14.5V8.75H6.25V10.75ZM1.5 10.75H4.75V8.75H1.5V10.75ZM6.25 7.25H14.5V5.25H6.25V7.25ZM1.5 7.25H4.75V5.25H1.5V7.25ZM6.25 3.75H14.5V3C14.5 2.17157 13.8284 1.5 13 1.5H6.25V3.75ZM3 1.5C2.17157 1.5 1.5 2.17157 1.5 3V3.75H4.75V1.5H3Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** "Group banners with the same content" — two stacked blocks, inline in `currentColor`. */
function GroupedBannersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M13 9C14.6569 9 16 10.3431 16 12V13C16 14.6569 14.6569 16 13 16H3L2.8457 15.9961C1.26055 15.9158 0 14.6051 0 13V12C0 10.3431 1.34315 9 3 9H13ZM3 10.5C2.17157 10.5 1.5 11.1716 1.5 12V13C1.5 13.8284 2.17157 14.5 3 14.5H13C13.8284 14.5 14.5 13.8284 14.5 13V12C14.5 11.1716 13.8284 10.5 13 10.5H3ZM13 0C14.6569 0 16 1.34315 16 3V4C16 5.65685 14.6569 7 13 7H3L2.8457 6.99609C1.26055 6.91579 0 5.60511 0 4V3C0 1.34315 1.34315 0 3 0H13ZM3 1.5C2.17157 1.5 1.5 2.17157 1.5 3V4C1.5 4.82843 2.17157 5.5 3 5.5H13C13.8284 5.5 14.5 4.82843 14.5 4V3C14.5 2.17157 13.8284 1.5 13 1.5H3Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** How the tables list banners: one row per banner, or grouped — banners with the same content in
 * every column sharing one row (edits to it go to all of them). The panels' segmented control, at
 * the bar's 32px, with each option's name in a tooltip. */
function ViewToggle({ combine, onChange }: { combine: boolean; onChange: (combine: boolean) => void }) {
  const t = useT();
  return (
    <SegmentedControl
      size="md"
      tooltipSide="bottom"
      value={combine ? 'grouped' : 'perBanner'}
      onChange={(value) => onChange(value === 'grouped')}
      options={[
        // The default (one row per banner) first.
        { value: 'perBanner', label: t('One row per banner'), icon: <OneRowPerBannerIcon className="size-4" /> },
        { value: 'grouped', label: t('Group banners with the same content'), icon: <GroupedBannersIcon className="size-4" /> },
      ]}
    />
  );
}

/** The table view toggle and the channel and size filters on the left, a text search on the right —
 * above the tables. */
function FilterBar({
  sizes,
  onSizesChange,
  sizeGroups,
  channel,
  onChannelChange,
  channels,
  query,
  onQueryChange,
  combine,
  onCombineChange,
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
  combine: boolean;
  onCombineChange: (value: boolean) => void;
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
        {/* How the tables list banners, first — then the filters. */}
        <ViewToggle combine={combine} onChange={onCombineChange} />
        <FilterMenu label={channel === null ? t('All channels') : channelName(channel)} value={channel} options={channelOptions} onChange={onChannelChange} />
        <SizeFilterMenu sizes={sizes} onChange={onSizesChange} groups={sizeGroups} />
      </div>
      {/* Same field as the selects (see SelectButton), outlined in blue while typing. */}
      <label className="flex h-8 w-[228px] shrink-0 items-center gap-2 overflow-hidden rounded-lg bg-chrome-border-subtle px-2 transition-colors hover:bg-chrome-border-soft focus-within:bg-chrome-border-subtle focus-within:shadow-[inset_0_0_0_1px_var(--button-primary)]">
        <Search className="size-4 shrink-0 text-white" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onQueryChange('')}
          placeholder={t('Search content')}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
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
  // One row per banner by default; the filter bar's toggle switches to grouped by content.
  const [combine, setCombine] = useState(false);
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
  // The filter bar only once some banner has layers to filter and replace.
  const hasContent = groups.some((g) => {
    const set = setsById[g.primaryId];
    const layout = set ? layoutsById[set.sourceLayoutId] : undefined;
    return Boolean(layout && contentColumns(layout).length > 0);
  });
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
      {hasContent && (
        // Reserves the same scrollbar room as the tables' area below (see SCROLLBAR_ROOM), so the bar
        // lines up with the tables on both sides.
        <div className="shrink-0 overflow-hidden" style={{ paddingTop: SCROLL_TOP_PADDING, paddingLeft: SIDE_PADDING, paddingRight: SIDE_PADDING, ...SCROLLBAR_ROOM }}>
          <FilterBar
            sizes={sizes}
            onSizesChange={setSizes}
            sizeGroups={sizeGroups}
            channel={channel}
            onChannelChange={setChannel}
            channels={channels}
            query={query}
            onQueryChange={setQuery}
            combine={combine}
            onCombineChange={setCombine}
          />
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          className="h-full overflow-x-hidden overflow-y-auto pb-6"
          style={{ paddingTop: hasContent ? FILTERS_TO_TABLES : SCROLL_TOP_PADDING, paddingLeft: SIDE_PADDING, paddingRight: SIDE_PADDING, ...SCROLLBAR_ROOM }}
        >
          <div className="flex flex-col gap-10">
            {shown.map((g) => (
              <BannerGroupTable key={g.primaryId} primaryId={g.primaryId} memberIds={g.memberIds} rowIds={g.rowIds} combine={combine} />
            ))}
            {groups.length === 0 && <EmptyTableState />}
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
