import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, EllipsisVertical, ImageIcon, Plus, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { isRealLayer } from '@/lib/create-layout';
import { getPreset } from '@/lib/mock/presets';
import { nearestPreset } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import { isGradient } from '@/lib/gradient';
import { RatioIcon } from '@/components/RatioIcon';
import { ColorPickerPopover } from '@/features/editor/artboard/ColorPickerPopover';
import { ImagePickerDialog } from '@/features/editor/artboard/ImagePickerDialog';
import { GROUPS, type ListItem, type QuickSizeResult } from '@/features/editor/artboard/QuickSizeMenu';
import { Button } from '@/components/ui/button';
import { addSizesTo } from '@/features/editor/artboard/add-sizes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Layout, LayoutElement } from '@/types';

const BORDER = '#40404A';
/** The table's own lines — its outer frame and the grid between cells. */
const TABLE_BORDER = '#2A2A2C';
/** Narrowest a Format/content column gets before the table scrolls sideways instead. */
const MIN_COLUMN_WIDTH = 120;
const CHECKBOX_COLUMN_WIDTH = 33;
/** The pinned row-actions column on the right. */
const ACTIONS_COLUMN_WIDTH = 40;
const ADD_SIZE_ROW_HEIGHT = 48;
/** The floating header's height — the top fade over the scrolling content is solid this far down… */
const HEADER_FADE_SOLID = 56;
/** …then fades out over this many px. */
const HEADER_FADE_LENGTH = 24;
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
      style={{ borderColor: TABLE_BORDER }}
    >
      {editable ? children : <div className="flex h-full min-w-0 items-center gap-2">{children}</div>}
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

/**
 * The table's last row: "Add size" opens a size list right there — the same sizes as the canvas's
 * "Add more sizes" panel, searchable, plus any WxH typed into the search — where any number of
 * sizes can be ticked, then added to the group together.
 */
function AddSizeRow({ colSpan, onAdd }: { colSpan: number; onAdd: (sizes: QuickSizeResult[]) => void }) {
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
    <tr>
      <td colSpan={colSpan} className="h-12 p-0" style={{ background: ROW_BG }}>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) reset();
          }}
        >
          <PopoverTrigger asChild>
            {/* Stays at the table's left edge while the columns scroll sideways. */}
            <button
              type="button"
              className={cn('sticky left-0 flex h-12 items-center gap-2 px-2 text-[13px] tracking-[-0.01em] outline-none transition-colors hover:text-white', open ? 'text-white' : 'text-white/65')}
            >
              <span className="flex size-4 items-center justify-center">
                <Plus className="size-4" />
              </span>
              {t('Add size')}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex max-h-[420px] w-[300px] flex-col gap-1 rounded-xl border-[0.5px] p-2 text-white"
            style={{ background: ROW_BG, borderColor: '#26262C' }}
          >
            <div className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
              <Search className="size-4 shrink-0 text-white/70" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTyped()}
                placeholder={t('Search sizes')}
                className="w-full min-w-0 bg-transparent text-[13px] placeholder:text-white/25 outline-none"
              />
            </div>
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
              {groups.map((group) => (
                <div key={group.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.items)}
                    className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-left text-[11px] font-semibold tracking-[-0.01em] text-white/45 uppercase transition-colors hover:bg-white/5"
                  >
                    <SizeCheckbox checked={group.items.every((item) => selected.has(item.id))} />
                    {group.id !== 'other' && <img src={`/icons/ec-platform-icon/${group.id}.svg`} alt="" className="size-4 shrink-0 rounded" />}
                    <span className="truncate">{group.id === 'other' ? t('All sizes') : group.name}</span>
                  </button>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id, resultOf(item))}
                      className="flex h-9 shrink-0 items-center gap-2 rounded-lg py-2 pr-2 pl-8 text-left transition-colors hover:bg-white/10"
                    >
                      <SizeCheckbox checked={selected.has(item.id)} />
                      <RatioIcon width={item.width} height={item.height} />
                      <span className="shrink-0 text-[13px]">
                        {item.width}x{item.height}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
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
      </td>
    </tr>
  );
}

/** A content cell's stand-in while its banner is still being generated. */
function LoadingCell() {
  return <span className="block h-3 w-full max-w-[96px] animate-pulse rounded-full bg-white/10" />;
}

function BannerGroupTable({ primaryId, memberIds }: { primaryId: string; memberIds: string[] }) {
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
      const a = memberIds.indexOf(anchorId);
      const b = memberIds.indexOf(setId);
      setCellSelection({ ...sel, rowIds: memberIds.slice(Math.min(a, b), Math.max(a, b) + 1) });
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
      const a = memberIds.indexOf(fill.sourceId);
      const b = memberIds.indexOf(setId);
      const next = { ...fill, rowIds: memberIds.slice(Math.min(a, b), Math.max(a, b) + 1) };
      fillRef.current = next;
      setFill(next);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.columnId !== columnId || (e.buttons & 1) === 0) return;
    // Past the first cell it's a selection drag, not text selection inside the field it started in.
    window.getSelection()?.removeAllRanges();
    drag.extended = true;
    const a = memberIds.indexOf(drag.anchorId);
    const b = memberIds.indexOf(setId);
    setCellSelection({ columnId, rowIds: memberIds.slice(Math.min(a, b), Math.max(a, b) + 1), anchorId: drag.anchorId });
  }
  // Spreadsheet-style fill: dragging the active cell's handle up or down its column, then letting
  // go, copies that cell's value into every cell the drag covered.
  const [fill, setFill] = useState<{ columnId: string; sourceId: string; rowIds: string[] } | null>(null);
  const fillRef = useRef(fill);
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
    applyToRows(
      done.rowIds.filter((id) => id !== done.sourceId),
      done.columnId,
      (el): Partial<LayoutElement> =>
        el.kind === 'text'
          ? { content: source.content }
          : el.kind === 'image'
            ? { imageUrl: source.imageUrl }
            : { style: { ...el.style, fill: source.style.fill, opacity: source.style.opacity } },
    );
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
  const allRowsChecked = memberIds.every((id) => selectedSceneIds.includes(id));
  function toggleAllRows() {
    const others = selectedSceneIds.filter((id) => !memberIds.includes(id));
    selectScenes(allRowsChecked ? others : [...others, ...memberIds]);
  }
  const columns = contentColumns(primary);
  const groupPlatformId = pageGroups[pageGroupIdByPage[primaryId]]?.platformId;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <img src="/icons/primary%201.svg" alt="" className="size-6 shrink-0" />
        {/* The primary banner's own name, as in the Banners list (renaming it there renames this too). */}
        <span className="min-w-0 truncate text-[15px] leading-[1.4] tracking-[-0.01em] text-white">{setsById[primaryId]?.name || t('Primary')}</span>
        <span className="flex h-5 shrink-0 items-center rounded-full border px-2 text-[13px] leading-4 text-white" style={{ background: '#26262C', borderColor: BORDER }}>
          {primary.size.width}x{primary.size.height}
        </span>
      </div>

      {/* One rounded frame around the table. Inside it the checkbox column (left) and the row
          actions (right) stay pinned, while Format and the content columns between them scroll
          sideways: they fill the available width, sharing it equally (fixed layout, so long
          content truncates instead of widening its column), and below MIN_COLUMN_WIDTH each the
          table stops shrinking and scrolls instead, with a fade at the right edge of the scrolling
          part while there's more to see. No native drag-and-drop of a field's selected text either:
          pressing on already-selected text and moving would otherwise start dragging that text
          away instead of a cell-selection drag. */}
      <div className="relative overflow-hidden rounded-lg border" style={{ borderColor: TABLE_BORDER }}>
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
                  <RowCheckbox checked={allRowsChecked} onChange={toggleAllRows} />
                </th>
                {[{ id: 'format', label: t('Format'), icon: '/icons/edit_panel/panel_image.svg' }, ...columns.map((c) => ({ id: c.id, label: `${t(KIND_LABELS[c.kind])} ${c.index}`, icon: KIND_ICONS[c.kind] }))].map((col, i, all) => (
                  <th key={col.id} className={cn('h-10 border-b px-2 text-left text-[13px] font-normal tracking-[-0.01em] text-white', i < all.length - 1 && 'border-r')} style={{ borderColor: TABLE_BORDER, background: ROW_BG }}>
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
              {memberIds.map((setId) => {
                const layout = layoutOf(setId);
                if (!layout) return null;
                const platformId = getPreset(layout.size.presetId ?? '')?.platformId ?? groupPlatformId;
                return (
                  // Selecting any cell brings that row's banner into view in the preview — focus
                  // bubbles up from whichever field took it, so this covers every kind of cell.
                  <tr
                    key={setId}
                    className="group/row"
                    onFocus={() => focusBanner(setId)}
                    // Leaving the row entirely (not just moving to another of its cells) lets coming
                    // back to it bring its banner into view again.
                    onBlur={(e) => {
                      const next = e.relatedTarget as Element | null;
                      if (e.currentTarget.contains(next)) return;
                      lastFocusedRef.current = null;
                      // Still editing this row from a picker opened by one of its cells (color
                      // popover, image dialog) — keep its banner outlined. Moving to another row
                      // outlines that one instead (its own onFocus).
                      if (!next?.closest('[data-radix-popper-content-wrapper], [role="dialog"]')) setBulkEditActivePage(null);
                    }}
                  >
                    <Cell pinned="left">
                      <RowCheckbox checked={selectedSceneIds.includes(setId)} onChange={() => selectScene(setId, true)} />
                    </Cell>
                    <Cell className={columns.length === 0 ? 'border-r-0' : undefined}>
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
                      <button
                        type="button"
                        aria-label={t('More options')}
                        className="flex size-6 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <EllipsisVertical className="size-4" />
                      </button>
                    </Cell>
                  </tr>
                );
              })}
              <AddSizeRow
                colSpan={columns.length + 3}
                onAdd={(sizes) => {
                  // Adapted from the primary, like any size added on the canvas — so they start with
                  // the same content as the rest of the group, and join it as the table's last rows.
                  const [newId] = addSizesTo(primaryId, sizes);
                  if (newId) requestFocusPage(newId);
                }}
              />
            </tbody>
          </table>
        </div>
        {moreToTheRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-[3] w-[60px] bg-gradient-to-l from-[rgba(4,4,6,0.5)] to-[rgba(4,4,6,0)]"
            // Down to the "Add size" row, which doesn't scroll.
            style={{ right: ACTIONS_COLUMN_WIDTH, bottom: ADD_SIZE_ROW_HEIGHT }}
          />
        )}
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

/**
 * The Bulk edit view's left-hand content area — every piece of content used across the playground,
 * one table per primary banner: a column per piece of content, a row per banner (the primary and
 * each of its sizes), each cell editable in place.
 */
export function BulkEditView() {
  const t = useT();
  const groups = useBannerGroups();
  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto bg-[#19191D] px-8 pb-8" style={{ paddingTop: 72 }}>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h3 className="text-2xl leading-8 font-semibold tracking-[-0.01em] text-white">{t('Replace')}</h3>
            <p className="text-[14px] leading-[1.4] tracking-[-0.01em] text-white/65">{t('Edit content in batch, create new sizes, without spending much time')}</p>
          </div>
          {groups.map((g) => (
            <BannerGroupTable key={g.primaryId} primaryId={g.primaryId} memberIds={g.memberIds} />
          ))}
          {groups.length === 0 && <span className="text-[13px] text-white/45">{t('No banners yet.')}</span>}
        </div>
      </div>
      {/* The header floats over this area: content scrolling up fades out under it (solid behind the
          header, then a short fade, in the page's own background color) instead of mixing with it.
          Stops short of the right edge so the scrollbar stays visible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-3 left-0 z-[5]"
        style={{ height: HEADER_FADE_SOLID + HEADER_FADE_LENGTH, background: `linear-gradient(to bottom, ${ROW_BG} ${HEADER_FADE_SOLID}px, rgba(25, 25, 29, 0))` }}
      />
    </div>
  );
}
