import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff, Image as ImageIcon, Lock } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { layerName } from '@/lib/layer-name';
import { isRealLayer } from '@/lib/create-layout';
import { useT } from '@/lib/i18n';
import type { Layout, LayoutElement } from '@/types';

/** Every nesting level shifts a row's own content right by one chevron-button's worth of space
 * (24px + the 4px gap after it = 28px) — same width whether what's indenting is a group header's
 * own chevron+label or a leaf row's thumbnail, so a child's content lines up under its parent
 * group's name at any depth (svg import & edit.md's own "children indented one level per depth"). */
const INDENT_PER_DEPTH = 28;
const BASE_PADDING = 4;

function rowPaddingLeft(depth: number): number {
  return BASE_PADDING + depth * INDENT_PER_DEPTH;
}

/** Fits inside the 32px thumbnail box with a little margin on every side. */
const SHAPE_THUMB_MAX = 20;

function ShapeThumb({ element }: { element: LayoutElement }) {
  const { frame, shape, style } = element;
  const ratio = frame.w / Math.max(frame.h, 1);
  const w = Math.max(4, ratio >= 1 ? SHAPE_THUMB_MAX : SHAPE_THUMB_MAX * ratio);
  const h = Math.max(4, ratio >= 1 ? SHAPE_THUMB_MAX / ratio : SHAPE_THUMB_MAX);
  // The stroke preview scales down with the shape itself, so a big soft-rounded rect on the
  // canvas still reads as a rounded rect here rather than looking like a plain circle.
  const scale = w / frame.w;
  const radius = shape === 'ellipse' ? 9999 : Math.min((style.radius ?? 0) * scale, Math.min(w, h) / 2);
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: '#26262C' }}>
      <div className="shrink-0 border-[1.5px] border-white/45" style={{ width: w, height: h, borderRadius: radius }} />
    </div>
  );
}

function LayerThumb({ element }: { element: LayoutElement }) {
  if (element.kind === 'image') {
    if (element.imageUrl) {
      return <div className="size-8 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${element.imageUrl})` }} />;
    }
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/45">
        <ImageIcon className="size-4" />
      </div>
    );
  }
  if (element.kind === 'shape') {
    return <ShapeThumb element={element} />;
  }
  if (element.kind === 'vector') {
    // Bakes in its own #26262C/rounded-corner background — unlike the other thumbnails, no wrapper needed.
    return <img src="/icons/SVGs/vector%20layer%20thumbnail.svg" alt="" className="size-8 shrink-0" />;
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: '#26262C' }}>
      <img src="/icons/layer list/text.svg" alt="" className="size-4" />
    </div>
  );
}

function LayerRow({
  element,
  layoutId,
  selected,
  depth,
  onClick,
}: {
  element: LayoutElement;
  layoutId: string;
  /** 'soft' is a member of a selected group — tinted rather than solid, so the group's own header
   * row reads as the thing that's selected. */
  selected: boolean | 'soft';
  /** How many group levels this row sits under — 0 for a top-level layer. */
  depth: number;
  onClick: (e: ReactMouseEvent) => void;
}) {
  const t = useT();
  const updateElement = useAppStore((s) => s.updateElement);
  const locked = Boolean(element.locked);
  const visible = element.visible;
  // Locked/hidden layers keep their toggle icons visible at all times (otherwise there'd be no way
  // to tell, or undo, either state without first hovering) — every other row only reveals them on hover.
  const iconsAlwaysShown = locked || !visible;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={locked ? undefined : onClick}
      onKeyDown={(e) => {
        if (!locked && (e.key === 'Enter' || e.key === ' ')) onClick(e as unknown as ReactMouseEvent);
      }}
      style={{ paddingLeft: rowPaddingLeft(depth) }}
      className={cn(
        'group/row flex h-10 w-full shrink-0 items-center gap-2 rounded-lg py-1 pr-4 text-left transition-colors',
        locked ? 'cursor-not-allowed' : 'cursor-pointer',
        selected === 'soft' ? 'bg-button-primary/25' : selected ? 'bg-button-primary' : !locked && 'hover:bg-[#26262C]',
      )}
    >
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', !visible && 'opacity-45')}>
        <LayerThumb element={element} />
        <span className="min-w-0 flex-1 truncate text-[13px] tracking-[-0.01em] text-white">{t(layerName(element))}</span>
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center justify-end gap-3 transition-opacity',
          iconsAlwaysShown ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
      >
        <button
          type="button"
          aria-label={locked ? t('Unlock layer') : t('Lock layer')}
          onClick={(e) => {
            e.stopPropagation();
            updateElement(layoutId, element.id, { locked: !locked });
          }}
          className="flex size-4 shrink-0 items-center justify-center text-white/85 transition-colors hover:text-white"
        >
          {locked ? <Lock className="size-4" /> : <img src="/icons/layer list/Unlock .svg" alt="" className="size-4" />}
        </button>
        <button
          type="button"
          aria-label={visible ? t('Hide layer') : t('Show layer')}
          onClick={(e) => {
            e.stopPropagation();
            updateElement(layoutId, element.id, { visible: !visible });
          }}
          className="flex size-4 shrink-0 items-center justify-center text-white/85 transition-colors hover:text-white"
        >
          {visible ? <img src="/icons/layer list/see.svg" alt="" className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/** A layer group's own row in the list — a collapse chevron plus an uppercase name label; clicking
 * the label selects the whole group, the same as clicking any one of its members on the canvas.
 * `label` is already resolved by the caller: a real name from `GroupMeta` (SVG import's own named,
 * possibly-nested groups), else the generic "Group"/"Layout group" a plain flat group always showed. */
function GroupHeaderRow({
  label,
  selected,
  depth,
  collapsed,
  onToggle,
  onClick,
}: {
  label: string;
  selected: boolean;
  depth: number;
  collapsed: boolean;
  onToggle: () => void;
  onClick: (e: ReactMouseEvent) => void;
}) {
  const t = useT();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(e as unknown as ReactMouseEvent);
      }}
      style={{ paddingLeft: rowPaddingLeft(depth) }}
      className={cn('flex h-8 w-full shrink-0 cursor-pointer items-center gap-1 rounded-lg pr-4 transition-colors', selected ? 'bg-button-primary' : 'hover:bg-[#26262C]')}
    >
      <button
        type="button"
        aria-label={collapsed ? t('Expand group') : t('Collapse group')}
        aria-expanded={!collapsed}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded text-white/70 transition-colors hover:text-white"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
      <span className={cn('min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[-0.01em] uppercase', selected ? 'text-white' : 'text-white/45')}>{label}</span>
    </div>
  );
}

type TreeItem = { kind: 'layer'; element: LayoutElement } | { kind: 'group'; groupId: string; elements: LayoutElement[]; subGroupIds: string[] };

/** Everything `SceneLayerRows` needs to know about a layout's groups, computed once per render:
 * which elements/sub-groups sit directly under which parent (or at the top level), each group's own
 * display position (so it sorts into the list at its most-recently-added member's spot, recursively
 * — "newest first", same convention a flat group always used), and a quick membership lookup for
 * "is this whole group currently selected". A legacy flat group (made via "Group layers", no
 * `GroupMeta` entry) is just a group with no name and no parent — same tree, same code path. */
function buildGroupIndex(layout: Layout) {
  const meta = layout.groupMeta ?? {};
  // Newest-added element first — `elements` itself stays oldest-to-newest (that order is also
  // z-stacking order, back-to-front, for ElementRenderer), so only the list's own display order is
  // reversed here, not the underlying data.
  const layers = layout.elements.filter(isRealLayer).slice().reverse();
  const positionOf = new Map<string, number>();
  layers.forEach((el, i) => positionOf.set(el.id, i));

  const elementsByParent = new Map<string | undefined, LayoutElement[]>();
  for (const el of layers) {
    const key = el.groupId;
    elementsByParent.set(key, [...(elementsByParent.get(key) ?? []), el]);
  }

  // Every group id actually in use — from element membership and/or the metadata registry (a group
  // can exist in `groupMeta` with no direct elements of its own if all its content is nested further).
  const allGroupIds = new Set<string>();
  for (const el of layers) if (el.groupId) allGroupIds.add(el.groupId);
  for (const id of Object.keys(meta)) allGroupIds.add(id);

  const subGroupsByParent = new Map<string | undefined, string[]>();
  for (const id of allGroupIds) {
    const parent = meta[id]?.parentGroupId;
    subGroupsByParent.set(parent, [...(subGroupsByParent.get(parent) ?? []), id]);
  }

  const descendantsCache = new Map<string, LayoutElement[]>();
  function descendantElements(groupId: string): LayoutElement[] {
    const cached = descendantsCache.get(groupId);
    if (cached) return cached;
    const direct = elementsByParent.get(groupId) ?? [];
    const subIds = subGroupsByParent.get(groupId) ?? [];
    const result = [...direct, ...subIds.flatMap(descendantElements)];
    descendantsCache.set(groupId, result);
    return result;
  }

  function groupPosition(groupId: string): number {
    const members = descendantElements(groupId);
    return members.length === 0 ? Infinity : Math.min(...members.map((el) => positionOf.get(el.id)!));
  }

  function itemsAt(parent: string | undefined): TreeItem[] {
    const items: TreeItem[] = [];
    for (const el of elementsByParent.get(parent) ?? []) items.push({ kind: 'layer', element: el });
    for (const groupId of subGroupsByParent.get(parent) ?? []) {
      const members = descendantElements(groupId);
      if (members.length === 0) continue; // a group that lost every member (deleted on canvas) just disappears
      items.push({ kind: 'group', groupId, elements: members, subGroupIds: subGroupsByParent.get(groupId) ?? [] });
    }
    const posOf = (item: TreeItem) => (item.kind === 'layer' ? positionOf.get(item.element.id)! : groupPosition(item.groupId));
    return items.sort((a, b) => posOf(a) - posOf(b));
  }

  function groupLabel(groupId: string): string {
    const name = meta[groupId]?.name;
    if (name) return name;
    const members = descendantElements(groupId);
    const autoLayout = Boolean(members[0]?.groupLayout && members[0].groupLayout.direction !== 'none');
    return autoLayout ? 'Layout group' : 'Group';
  }

  /** Walks a leaf element's own `groupId` chain all the way to the top — used both to find a group
   * header's representative canvas object and to auto-expand a selected child's ancestors. */
  function ancestorGroupIds(element: LayoutElement): string[] {
    const chain: string[] = [];
    let current = element.groupId;
    while (current) {
      chain.push(current);
      current = meta[current]?.parentGroupId;
    }
    return chain;
  }

  return { itemsAt, groupLabel, descendantElements, ancestorGroupIds };
}

function SceneLayerRows({
  layout,
  isSelected,
  selectedElementIds,
  onSelectElement,
}: {
  layout: Layout;
  isSelected: (elementId: string) => boolean;
  selectedElementIds: Set<string>;
  onSelectElement: (elementId: string, e: ReactMouseEvent) => void;
}) {
  const t = useT();
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const index = buildGroupIndex(layout);

  // "Selecting a child expands its parent groups" — whenever the selection changes, walk every
  // selected element's own ancestor chain and make sure none of those groups are left collapsed.
  useEffect(() => {
    const toExpand = new Set<string>();
    for (const el of layout.elements) {
      if (!selectedElementIds.has(el.id)) continue;
      for (const groupId of index.ancestorGroupIds(el)) toExpand.add(groupId);
    }
    if (toExpand.size === 0) return;
    setCollapsedGroupIds((prev) => {
      if (![...toExpand].some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of toExpand) next.delete(id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds, layout.elements]);

  function toggleCollapsed(groupId: string) {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function renderItems(parent: string | undefined, depth: number) {
    return index.itemsAt(parent).map((item) => {
      if (item.kind === 'layer') {
        const el = item.element;
        return <LayerRow key={el.id} element={el} layoutId={layout.id} depth={depth} selected={isSelected(el.id)} onClick={(e) => onSelectElement(el.id, e)} />;
      }
      const groupSelected = item.elements.every((m) => isSelected(m.id));
      const collapsed = collapsedGroupIds.has(item.groupId);
      const representative = item.elements[0];
      return (
        <div key={item.groupId} className="flex flex-col gap-0.5">
          <GroupHeaderRow
            label={t(index.groupLabel(item.groupId))}
            selected={groupSelected}
            depth={depth}
            collapsed={collapsed}
            onToggle={() => toggleCollapsed(item.groupId)}
            onClick={(e) => onSelectElement(representative.id, e)}
          />
          {!collapsed && renderItems(item.groupId, depth + 1)}
        </div>
      );
    });
  }

  return <>{renderItems(undefined, 0)}</>;
}

/** Left panel's per-scene view: the selected scene's own layer stack, shown in place of the banner list. */
export function LayersTab({ setId, onBack }: { setId: string; onBack: () => void }) {
  const t = useT();
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const selectElement = useAppStore((s) => s.selectElement);

  const bannerSet = setsById[setId];
  const layout = bannerSet ? layoutsById[bannerSet.sourceLayoutId] : null;
  const selectedElementIds = new Set(layout ? selectedElements.filter((r) => r.layoutId === layout.id).map((r) => r.elementId) : []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <button type="button" onClick={onBack} className="flex h-6 w-full shrink-0 items-center gap-1 px-1 text-left transition-colors hover:text-white">
        <span className="text-[11px] font-semibold tracking-[-0.01em] text-white/70 uppercase">{t('Back')}</span>
        <ChevronLeft className="size-3 shrink-0 text-white/45" />
        <span className="min-w-0 truncate text-[11px] font-semibold tracking-[-0.01em] text-white uppercase">{bannerSet?.name ?? t('Layers')}</span>
      </button>

      {!layout ? (
        <div className="flex flex-1 items-center justify-center px-2 text-center text-xs text-white/45">{t('Select a banner to see its layers')}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          <SceneLayerRows
            layout={layout}
            isSelected={(elementId) => selectedElementIds.has(elementId)}
            selectedElementIds={selectedElementIds}
            onSelectElement={(elementId, e) => selectElement({ layoutId: layout.id, elementId }, e.shiftKey)}
          />
        </div>
      )}
    </div>
  );
}
