import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import { nextId, createAdaptedLayout } from '@/lib/create-layout';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { BannerSet, Layout } from '@/types';
import type { PageGroup } from '@/store/types';
import { ArtboardFrame } from './ArtboardFrame';
import { CascadeToolbar } from './CascadeToolbar';
import { CanvasZoomBar } from './CanvasZoomBar';
import { PageTitleBar } from './PageTitleBar';
import { QuickSizeMenu, type QuickSizeResult } from './QuickSizeMenu';
import { PAGE_GAP, GROUP_PAD_TOP, GROUP_PAD_RIGHT, GROUP_PAD_BOTTOM, GROUP_PAD_LEFT, PAGE_TITLE_RESERVE, TITLE_CLEARANCE_BUFFER } from '@/lib/canvas-layout';
import { applyPrototypeSizeFill } from '@/lib/prototype-size-fill';
import { buildOverlayElements } from '@/lib/overlay-elements';
import { computeGroupLayout } from '@/lib/group-layout';

const PADDING = 96;
const MAX_FIT_ZOOM = 1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const FOCUS_FILL_RATIO = 0.6;
const DOT_SPACING = 100;
const PAN_THRESHOLD = 4;
// Screen px within which a dragged scene's edge/center snaps to align with another scene's.
const SNAP_THRESHOLD = 8;

type SnapBox = { x: number; y: number; w: number; h: number };

/**
 * Finds the closest edge/center alignment (independently per axis) between a dragged box at
 * (rawX, rawY) and every box in `others`, snapping to it if within `threshold` (canvas-space px).
 * `guideX`/`guideY` report the aligned coordinate so the caller can draw a guide line through it.
 */
function computeSnap(rawX: number, rawY: number, w: number, h: number, others: SnapBox[], threshold: number) {
  let x = rawX;
  let y = rawY;
  let guideX: number | null = null;
  let guideY: number | null = null;
  let bestXDist = threshold;
  let bestYDist = threshold;

  const left = rawX;
  const right = rawX + w;
  const centerX = rawX + w / 2;
  const top = rawY;
  const bottom = rawY + h;
  const centerY = rawY + h / 2;

  for (const o of others) {
    const oLeft = o.x;
    const oRight = o.x + o.w;
    const oCenterX = o.x + o.w / 2;
    const oTop = o.y;
    const oBottom = o.y + o.h;
    const oCenterY = o.y + o.h / 2;

    const xCandidates: [number, number, number][] = [
      [left, oLeft, oLeft],
      [right, oRight, oRight - w],
      [left, oRight, oRight],
      [right, oLeft, oLeft - w],
      [centerX, oCenterX, oCenterX - w / 2],
    ];
    for (const [draggedEdge, targetEdge, resultX] of xCandidates) {
      const dist = Math.abs(draggedEdge - targetEdge);
      if (dist < bestXDist) {
        bestXDist = dist;
        x = resultX;
        guideX = targetEdge;
      }
    }

    const yCandidates: [number, number, number][] = [
      [top, oTop, oTop],
      [bottom, oBottom, oBottom - h],
      [top, oBottom, oBottom],
      [bottom, oTop, oTop - h],
      [centerY, oCenterY, oCenterY - h / 2],
    ];
    for (const [draggedEdge, targetEdge, resultY] of yCandidates) {
      const dist = Math.abs(draggedEdge - targetEdge);
      if (dist < bestYDist) {
        bestYDist = dist;
        y = resultY;
        guideY = targetEdge;
      }
    }
  }

  return { x, y, guideX, guideY };
}

/** Moves the item at `from` to `to`, shifting everything between by one slot — a plain array splice-move. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

type PageEntry = {
  id: string;
  set: BannerSet;
  layout: Layout;
  pos: { x: number; y: number };
};
type Camera = { x: number; y: number; zoom: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generic screen-delta drag tracker — converts screen px to canvas-space px via `zoom`.
 * If the pointer never moves past PAN_THRESHOLD before mouseup, treats it as a plain click
 * and fires `onClick` instead (so a drag handle can double as a select target).
 */
function startCanvasDrag(e: ReactMouseEvent, zoom: number, onDelta: (dx: number, dy: number) => void, onClick?: () => void) {
  e.stopPropagation();
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  let lastX = startX;
  let lastY = startY;
  let moved = false;

  function onMove(ev: globalThis.MouseEvent) {
    const dx = (ev.clientX - lastX) / zoom;
    const dy = (ev.clientY - lastY) / zoom;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (Math.abs(ev.clientX - startX) > PAN_THRESHOLD || Math.abs(ev.clientY - startY) > PAN_THRESHOLD) moved = true;
    onDelta(dx, dy);
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (!moved) onClick?.();
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** True if some other page already occupies the space to the right (blocking a new right-add). */
function hasBlockerToRight(entry: PageEntry, others: PageEntry[]) {
  return others.some(
    (o) => o.id !== entry.id && o.pos.x >= entry.pos.x + entry.layout.size.width - 1 && o.pos.y < entry.pos.y + entry.layout.size.height && o.pos.y + o.layout.size.height > entry.pos.y,
  );
}

/** True if some other page already occupies the space below (blocking a new bottom-add). */
function hasBlockerBelow(entry: PageEntry, others: PageEntry[]) {
  return others.some(
    (o) => o.id !== entry.id && o.pos.y >= entry.pos.y + entry.layout.size.height - 1 && o.pos.x < entry.pos.x + entry.layout.size.width && o.pos.x + o.layout.size.width > entry.pos.x,
  );
}

/**
 * The "add more sizes" circular icon — shared by the hotspot below a scene and the "ALL SIZES"
 * divider. Default state is a plain dark circle; hovering it swaps to the pre-built yellow
 * `add size.svg` asset. Tooltip is hand-rolled (not the shared Radix Tooltip) because this button
 * is always wrapped by QuickSizeMenu's trigger-cloning, which expects to clone a single clickable
 * element directly — nesting a Tooltip/TooltipTrigger in between would break that.
 */
function AddSizeIconButton({
  onClick,
  size = 10,
  onHoverChange,
}: {
  onClick?: (e: ReactMouseEvent) => void;
  size?: 7 | 10;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const sizeClass = size === 10 ? 'size-10' : 'size-7';

  function setHover(value: boolean) {
    setHovered(value);
    onHoverChange?.(value);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('Add more sizes')}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setHover(false);
          onClick?.(e);
        }}
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]',
          sizeClass,
        )}
        style={{ background: '#26262C' }}
      >
        <Plus className={cn('size-4 text-white transition-opacity', hovered && 'opacity-0')} />
        <img src="/icons/add%20size.svg" alt="" className={cn('absolute inset-0 transition-opacity', sizeClass, hovered ? 'opacity-100' : 'opacity-0')} />
      </button>
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 flex-col items-center">
          <div className="w-[184px] rounded-md px-2 py-1 text-center text-sm text-white" style={{ background: 'rgba(38,38,44,0.88)' }}>
            {t('Add more variations of this banner in different sizes')}
          </div>
          <div className="h-2 w-4" style={{ background: 'rgba(38,38,44,0.88)', clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
        </div>
      )}
    </div>
  );
}

/** The "ALL SIZES" section header's divider row — its own component so the add-icon's hover state can also brighten the divider line, per the reference design. */
function AllSizesDivider({
  left,
  top,
  width,
  onConfirm,
  sourceLayoutId,
  onFocusPrimary,
}: {
  left: number;
  top: number;
  width: number;
  onConfirm: (results: QuickSizeResult[]) => void;
  sourceLayoutId: string;
  /** Recenters the camera on the primary scene — the primary can be scrolled out of view for a large group, so opening this menu brings it back on screen. */
  onFocusPrimary: () => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  return (
    <div className="absolute flex items-center gap-3" style={{ left, top, width }}>
      <span className="shrink-0 text-base text-white/45">{t('ALL SIZES')}</span>
      <div className="pointer-events-auto shrink-0">
        <QuickSizeMenu onConfirm={onConfirm} sourceLayoutId={sourceLayoutId}>
          <AddSizeIconButton size={7} onHoverChange={setHovered} onClick={onFocusPrimary} />
        </QuickSizeMenu>
      </div>
      <div className="h-px min-w-0 flex-1 transition-colors" style={{ background: hovered ? 'rgba(255,255,255,0.45)' : '#40404A' }} />
    </div>
  );
}

function AddPageHotspot({ edge, sourceLayoutId, onConfirm }: { edge: 'right' | 'bottom'; sourceLayoutId: string; onConfirm: (results: QuickSizeResult[]) => void }) {
  const t = useT();
  const isRight = edge === 'right';
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={cn(
        'absolute flex items-center justify-center',
        isRight
          ? 'group top-0 -right-16 h-full w-16'
          : // The panel itself (rendered by QuickSizeMenu below, `position: fixed` elsewhere on
            // screen) is still a DOM descendant of this wrapper — its own `opacity` cascades down
            // regardless of the child's own positioning scheme, so this can't fade back out on
            // mouse-leave while the panel is open, or the panel would visually vanish (it'd
            // still be "open" in state, just invisible) even though the cursor simply left the
            // hover zone.
            cn('-bottom-16 left-0 h-16 w-full transition-opacity', menuOpen ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'),
      )}
    >
      <QuickSizeMenu onConfirm={onConfirm} onOpenChange={setMenuOpen} sourceLayoutId={sourceLayoutId}>
        {isRight ? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={t('Add page')}
            className={cn(
              'flex size-9 items-center justify-center rounded-xl bg-chrome-border-subtle text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)] transition-opacity',
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <Plus className="size-4" />
          </button>
        ) : (
          <AddSizeIconButton />
        )}
      </QuickSizeMenu>
    </div>
  );
}

function GroupContainer({
  left,
  top,
  width,
  height,
  zoom,
  onSelect,
  onDragMove,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  zoom: number;
  onSelect: () => void;
  onDragMove: (dx: number, dy: number) => void;
}) {
  return (
    <div
      className="absolute cursor-move rounded-lg"
      style={{ left, top, width, height }}
      onMouseDown={(e) => {
        // Shift-drag is always a marquee selection, even over a group's own invisible drag-handle
        // overlay — let it bubble to the canvas background's handler instead of moving the group.
        if (e.shiftKey) return;
        startCanvasDrag(e, zoom, onDragMove, onSelect);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function PageCard({
  entry,
  left,
  top,
  width,
  height,
  scale,
  active,
  isLoading,
  isPrimary,
  showCascadeToolbar,
  dimmed,
  dragging,
  reflowing,
  onActivate,
  onStartDrag,
  showRightAdd,
  showBottomAdd,
  onAddAdjacent,
  onRename,
}: {
  entry: PageEntry;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  active: boolean;
  isLoading: boolean;
  isPrimary: boolean;
  showCascadeToolbar: boolean;
  /** True once some *other* scene is selected — dims this one so the selection reads clearly. */
  dimmed: boolean;
  /** Being actively dragged to reorder within its group — follows the cursor with no position
   * transition (so it doesn't lag), elevated above its siblings. */
  dragging?: boolean;
  /** A sibling of the group currently being reordered (but not the one being dragged) — transitions
   * position so it visibly slides into its new packed slot. Every other card (including this one
   * whenever no reorder is in progress) renders with no position transition, so panning/zooming the
   * camera moves everything in lockstep instead of some cards lagging behind. */
  reflowing?: boolean;
  onActivate: () => void;
  /** Snap-aware drag starter shared by the title bar and a plain click on the scene body. */
  onStartDrag: (e: ReactMouseEvent) => void;
  showRightAdd: boolean;
  showBottomAdd: boolean;
  onAddAdjacent: (edge: 'right' | 'bottom', results: QuickSizeResult[]) => void;
  onRename: (name: string) => void;
}) {
  const { set: bannerSet, layout } = entry;
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      className={cn('group/card absolute', reflowing ? 'transition-[opacity,left,top] duration-150' : 'transition-opacity')}
      style={{ left, top, width, height, opacity: dimmed ? 0.6 : 1, zIndex: dragging ? 10 : undefined }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={onActivate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <PageTitleBar
        className="absolute right-0 -top-7 left-0 flex items-center gap-2"
        name={bannerSet.name}
        width={layout.size.width}
        height={layout.size.height}
        presetId={layout.size.presetId}
        layoutId={layout.id}
        onDragHandleMouseDown={onStartDrag}
        isPrimary={isPrimary}
        onRename={onRename}
        visible={scale >= 0.4}
      />
      {showCascadeToolbar && scale >= 0.4 && (isHovered || active) && (
        <div className="absolute left-1/2 z-10 -translate-x-1/2" style={{ top: '100%', marginTop: 16 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <CascadeToolbar setId={entry.id} />
        </div>
      )}
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center border border-chrome-border-soft bg-chrome-bg">
          <LoadingSpinner size={Math.min(width, height) * 0.3} />
        </div>
      ) : (
        <ArtboardFrame
          layout={layout}
          scale={scale}
          width={width}
          height={height}
          active={active}
          onActivate={onActivate}
          onSceneMouseDown={onStartDrag}
          showEmptyStateHint={scale >= 0.2}
          className="absolute inset-0"
        />
      )}

      {!isLoading && showRightAdd && <AddPageHotspot edge="right" sourceLayoutId={layout.id} onConfirm={(r) => onAddAdjacent('right', r)} />}
      {!isLoading && showBottomAdd && scale >= 0.4 && <AddPageHotspot edge="bottom" sourceLayoutId={layout.id} onConfirm={(r) => onAddAdjacent('bottom', r)} />}
    </div>
  );
}

/** Screen 7 — an infinite, pannable/zoomable canvas with every page, and hover controls to spin off adjacent sizes. */
export function MultiPageCanvas() {
  const t = useT();
  const pageOrder = useAppStore((s) => s.pageOrder);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const pagePositions = useAppStore((s) => s.pagePositions);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const loadingPageIds = useAppStore((s) => s.loadingPageIds);
  const upsertLayout = useAppStore((s) => s.upsertLayout);
  const loadSet = useAppStore((s) => s.loadSet);
  const groupPagesWith = useAppStore((s) => s.groupPagesWith);
  const reorderGroupSiblings = useAppStore((s) => s.reorderGroupSiblings);
  const renamePage = useAppStore((s) => s.renamePage);
  const movePagesBy = useAppStore((s) => s.movePagesBy);
  const startPageLoading = useAppStore((s) => s.startPageLoading);
  const viewAllActivePageId = useAppStore((s) => s.viewAllActivePageId);
  const setViewAllActivePage = useAppStore((s) => s.setViewAllActivePage);
  const focusPageId = useAppStore((s) => s.focusPageId);
  const requestFocusPage = useAppStore((s) => s.requestFocusPage);
  const clearFocusPage = useAppStore((s) => s.clearFocusPage);
  const selectGroup = useAppStore((s) => s.selectGroup);
  const activeCanvasRootId = useAppStore((s) => s.activeCanvasRootId);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);
  const activeTool = useAppStore((s) => s.activeTool);
  const pendingCascadeSetIds = useAppStore((s) => s.pendingCascadeSetIds);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectScene = useAppStore((s) => s.selectScene);
  const selectScenes = useAppStore((s) => s.selectScenes);
  const selectedElements = useAppStore((s) => s.selectedElements);
  // A layer selected with match-select on spans several scenes at once — dimming every scene that
  // selection didn't *also* add to selectedSceneIds would leave the other matched scenes looking
  // deselected even though they're showing a live bounding box, so skip dimming entirely whenever
  // the current element selection already spans more than one scene.
  const isMultiSceneElementSelection = new Set(selectedElements.map((r) => r.layoutId)).size > 1;

  const outerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [snapGuides, setSnapGuides] = useState<{
    x: number | null;
    y: number | null;
  }>({ x: null, y: null });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // While a sibling is being dragged to reorder within its group's "All sizes" pack, it follows
  // the cursor freely (this) instead of snapping to whatever slot computeGroupLayout currently
  // assigns it — every other sibling still renders at its (live-updating, as the drag crosses
  // neighbors) packed position, giving the Figma-style "the rest reflows around it" feel. `groupId`
  // scopes the reflow transition to just that group's other siblings — every other card on the
  // canvas (including this same card whenever this is null) renders with no position transition
  // at all, so panning/zooming the camera moves everything in lockstep, instantly.
  const [reorderDrag, setReorderDrag] = useState<{ groupId: string; siblingId: string; x: number; y: number } | null>(null);
  const didPanRef = useRef(false);
  const fitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const compute = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The view-all canvas shows exactly one "canvas" at a time — a standalone page's own id, or a
  // group's id — never several side by side, so creating/switching to a different banner set
  // hides whatever was visible before instead of stacking it below. Every top-level page gets its
  // own canvas from the moment it's created, whether or not it's ever grouped into a set.
  const rootOf = (id: string) => pageGroupIdByPage[id] ?? id;
  const activeRoots = new Set(pageOrder.map(rootOf));
  const effectiveActiveId = activeCanvasRootId && activeRoots.has(activeCanvasRootId) ? activeCanvasRootId : pageOrder.length ? rootOf(pageOrder[0]) : null;

  const entries: PageEntry[] = pageOrder
    .filter((id) => rootOf(id) === effectiveActiveId)
    .map((id) => {
      const set = setsById[id];
      const layout = set ? layoutsById[set.sourceLayoutId] : null;
      const pos = pagePositions[id] ?? { x: 0, y: 0 };
      return set && layout ? { id, set, layout, pos } : null;
    })
    .filter((e): e is PageEntry => e !== null);

  // Groups render as a managed layout, not free-form positions: the primary keeps its own stored
  // position (draggable, with snapping, like any standalone scene), but every sibling's *effective*
  // position is overridden here to whatever the shelf-pack below the primary computes — their
  // stored `pagePositions` become inert while grouped (still written on creation, but only
  // meaningful again if the group later dissolves back to one page), so dragging one snaps right
  // back to its packed spot.
  const groupLayoutById = new Map<
    string,
    {
      primaryEntry: PageEntry;
      originX: number;
      originY: number;
      layout: ReturnType<typeof computeGroupLayout>;
    }
  >();
  // PageTitleBar sits a *fixed* -28 screen px above whatever frame it's attached to — that offset
  // doesn't shrink with zoom the way every other gap here does, so converting it into canvas-space
  // units has to divide by the current zoom, or low zoom (bigger groups, more auto-fit zoom-out)
  // would let a sibling's title bar collide with the divider/label above it.
  const titleClearance = (PAGE_TITLE_RESERVE + TITLE_CLEARANCE_BUFFER) / camera.zoom;
  for (const group of Object.values(pageGroups)) {
    if (group.memberIds.length < 2) continue;
    const primaryEntry = entries.find((e) => e.id === group.memberIds[0]);
    if (!primaryEntry) continue;
    const siblingEntries = group.memberIds
      .slice(1)
      .map((id) => entries.find((e) => e.id === id))
      .filter((e): e is PageEntry => Boolean(e));
    const layout = computeGroupLayout(
      primaryEntry.layout.size,
      siblingEntries.map((e) => ({
        id: e.id,
        width: e.layout.size.width,
        height: e.layout.size.height,
      })),
    );
    groupLayoutById.set(group.id, {
      primaryEntry,
      originX: primaryEntry.pos.x,
      originY: primaryEntry.pos.y,
      layout: {
        ...layout,
        primaryLabelY: layout.primaryLabelY - titleClearance,
      },
    });
    for (const box of layout.siblings) {
      const target = siblingEntries.find((e) => e.id === box.id);
      if (target)
        target.pos = {
          x: primaryEntry.pos.x + box.x,
          y: primaryEntry.pos.y + box.y + titleClearance,
        };
    }
  }

  // Shared by the auto-fit effect below and the zoom bar's manual "fit to screen" button.
  function computeFitCamera(): Camera | null {
    if (viewport.width === 0 || entries.length === 0) return null;
    const bounds = entries.reduce(
      (acc, e) => ({
        minX: Math.min(acc.minX, e.pos.x),
        minY: Math.min(acc.minY, e.pos.y),
        maxX: Math.max(acc.maxX, e.pos.x + e.layout.size.width),
        maxY: Math.max(acc.maxY, e.pos.y + e.layout.size.height),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const contentW = Math.max(bounds.maxX - bounds.minX, 1);
    const contentH = Math.max(bounds.maxY - bounds.minY, 1);
    const availW = Math.max(viewport.width - PADDING * 2, 1);
    const availH = Math.max(viewport.height - PADDING * 2, 1);
    const zoom = Math.min(availW / contentW, availH / contentH, MAX_FIT_ZOOM);
    const x = (viewport.width - contentW * zoom) / 2 - bounds.minX * zoom;
    const y = (viewport.height - contentH * zoom) / 2 - bounds.minY * zoom;
    return { x, y, zoom };
  }

  // Auto-fit the camera whenever the active canvas, its page count, or the viewport size changes;
  // free pan/zoom otherwise. Keying on effectiveActiveId (not just entries.length) matters because
  // switching to a different canvas with the same page count would otherwise look like a no-op.
  useEffect(() => {
    if (viewport.width === 0 || entries.length === 0) return;
    const key = `${effectiveActiveId}:${entries.length}:${viewport.width}:${viewport.height}`;
    if (fitKeyRef.current === key) return;
    fitKeyRef.current = key;
    const fit = computeFitCamera();
    if (fit) setCamera(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActiveId, entries.length, viewport.width, viewport.height]);

  // Selecting a page from the left panel (Sidebar) requests a pan/zoom that centers just that page
  // and sizes it to roughly FOCUS_FILL_RATIO of the viewport (not just "fit within padding").
  useEffect(() => {
    if (!focusPageId || viewport.width === 0) return;
    const entry = entries.find((e) => e.id === focusPageId);
    if (entry) {
      const targetW = viewport.width * FOCUS_FILL_RATIO;
      const targetH = viewport.height * FOCUS_FILL_RATIO;
      const zoom = clamp(Math.min(targetW / entry.layout.size.width, targetH / entry.layout.size.height), MIN_ZOOM, MAX_ZOOM);
      const x = viewport.width / 2 - (entry.pos.x + entry.layout.size.width / 2) * zoom;
      const y = viewport.height / 2 - (entry.pos.y + entry.layout.size.height / 2) * zoom;
      setCamera({ x, y, zoom });
    }
    clearFocusPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPageId, viewport.width, viewport.height]);

  // Zoom bar: jump to an exact zoom level, keeping the viewport's own center point fixed in
  // canvas-space (same "zoom around a point" math the wheel handler below uses, just centered on
  // the viewport instead of the cursor).
  function setZoomPct(pct: number) {
    const newZoom = clamp(pct / 100, MIN_ZOOM, MAX_ZOOM);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    setCamera((prev) => {
      const canvasX = (cx - prev.x) / prev.zoom;
      const canvasY = (cy - prev.y) / prev.zoom;
      return {
        zoom: newZoom,
        x: cx - canvasX * newZoom,
        y: cy - canvasY * newZoom,
      };
    });
  }

  function handleFitToScreen() {
    const fit = computeFitCamera();
    if (fit) setCamera(fit);
  }

  // React's onWheel is passive by default, so preventDefault must go through a native listener.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    function onWheelNative(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const rect = el!.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      setCamera((prev) => {
        const newZoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const canvasX = (cursorX - prev.x) / prev.zoom;
        const canvasY = (cursorY - prev.y) / prev.zoom;
        return {
          zoom: newZoom,
          x: cursorX - canvasX * newZoom,
          y: cursorY - canvasY * newZoom,
        };
      });
    }
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  // Snap-aware drag for a single scene — shared by the title bar's drag handle and a plain click
  // on the scene body. Tracks its own "last applied" position rather than reading `entry.pos` on
  // each tick, since the window listeners below are bound once at mousedown and don't pick up
  // fresh closures from later re-renders the way JSX-bound handlers would.
  function startPageDrag(e: ReactMouseEvent, entry: PageEntry) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = camera.zoom;
    const startPos = entry.pos;
    const w = entry.layout.size.width;
    const h = entry.layout.size.height;
    const others: SnapBox[] = entries
      .filter((o) => o.id !== entry.id)
      .map((o) => ({
        x: o.pos.x,
        y: o.pos.y,
        w: o.layout.size.width,
        h: o.layout.size.height,
      }));
    let appliedX = startPos.x;
    let appliedY = startPos.y;

    function onMove(ev: globalThis.MouseEvent) {
      const rawX = startPos.x + (ev.clientX - startX) / zoom;
      const rawY = startPos.y + (ev.clientY - startY) / zoom;
      if (!snapEnabled) {
        movePagesBy([entry.id], rawX - appliedX, rawY - appliedY);
        appliedX = rawX;
        appliedY = rawY;
        return;
      }
      const snapped = computeSnap(rawX, rawY, w, h, others, SNAP_THRESHOLD / zoom);
      movePagesBy([entry.id], snapped.x - appliedX, snapped.y - appliedY);
      appliedX = snapped.x;
      appliedY = snapped.y;
      setSnapGuides({ x: snapped.guideX, y: snapped.guideY });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setSnapGuides({ x: null, y: null });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Drag-to-reorder within a group's "All sizes" pack — dragging sibling `entry` over another
  // sibling shifts everything between them by one slot (a plain list reorder, like a Figma layer
  // list), live as the drag crosses each neighbor, not just on drop. Reads fresh store state on
  // every move (not the render-time `entries`/`pageGroups` closures, which go stale the moment
  // this fires a live reorder) — same reasoning as startPageDrag's own "last applied" tracking.
  function startSiblingReorderDrag(e: ReactMouseEvent, groupId: string, entry: PageEntry) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = camera.zoom;
    const startPos = entry.pos;
    const w = entry.layout.size.width;
    const h = entry.layout.size.height;
    const titleClearance = (PAGE_TITLE_RESERVE + TITLE_CLEARANCE_BUFFER) / zoom;
    let order = pageGroups[groupId]?.memberIds.slice(1) ?? [];
    // Below this, it's a click (selecting the scene, which already happened on mousedown) rather
    // than an actual drag — without this gate, the card would immediately lift and start hit-
    // testing against its neighbors on the very first mousemove, however tiny, and a perfectly
    // still click could still trigger an unwanted swap.
    let dragging = false;

    function onMove(ev: globalThis.MouseEvent) {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dxScreen, dyScreen) < PAN_THRESHOLD) return;
        dragging = true;
      }
      const x = startPos.x + dxScreen / zoom;
      const y = startPos.y + dyScreen / zoom;
      setReorderDrag({ groupId, siblingId: entry.id, x, y });

      const state = useAppStore.getState();
      const group = state.pageGroups[groupId];
      const primarySet = group ? state.setsById[group.memberIds[0]] : null;
      const primaryLayout = primarySet ? state.layoutsById[primarySet.sourceLayoutId] : null;
      if (!group || !primaryLayout) return;
      const primaryPos = state.pagePositions[group.memberIds[0]] ?? { x: 0, y: 0 };
      const siblingBoxes = order
        .map((id) => {
          const set = state.setsById[id];
          const layout = set ? state.layoutsById[set.sourceLayoutId] : null;
          return layout ? { id, width: layout.size.width, height: layout.size.height } : null;
        })
        .filter((b): b is { id: string; width: number; height: number } => Boolean(b));
      const packed = computeGroupLayout(primaryLayout.size, siblingBoxes);

      // Only swaps once the dragged box's own center point actually lands inside another
      // sibling's box — not merely "nearest," which can trigger from a distance and flip-flop
      // between near-equidistant neighbors. This is the "middle point dragged over the sibling"
      // trigger, deliberately less sensitive than proximity alone.
      const draggedCenterX = x + w / 2;
      const draggedCenterY = y + h / 2;
      const targetBox = packed.siblings.find((box) => {
        if (box.id === entry.id) return false;
        const left = primaryPos.x + box.x;
        const top = primaryPos.y + box.y + titleClearance;
        return draggedCenterX >= left && draggedCenterX <= left + box.width && draggedCenterY >= top && draggedCenterY <= top + box.height;
      });
      if (!targetBox) return;
      const fromIndex = order.indexOf(entry.id);
      const toIndex = order.indexOf(targetBox.id);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      order = arrayMove(order, fromIndex, toIndex);
      reorderGroupSiblings(groupId, order);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setReorderDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Shift-drag on empty canvas rubber-bands a selection box — any scene it overlaps joins
  // `selectedSceneIds`, live as the box grows, same as shift-clicking each one individually.
  function startMarqueeSelect(e: ReactMouseEvent<HTMLDivElement>) {
    const el = outerRef.current;
    if (!el) return;
    // Without this, dragging across the "PRIMARY SIZE"/"ALL SIZES" labels (or any page title)
    // triggers the browser's native text-selection highlight alongside the marquee itself.
    e.preventDefault();
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const containerRect = el.getBoundingClientRect();
    const startX = e.clientX - containerRect.left;
    const startY = e.clientY - containerRect.top;
    // Reuses the pan gesture's own "didn't just click" flag so handleCanvasClick doesn't also
    // fire its deselect-everything behavior right after the drag finishes.
    didPanRef.current = true;
    setMarqueeRect({ x: startX, y: startY, w: 0, h: 0 });

    function onMove(ev: globalThis.MouseEvent) {
      const curX = ev.clientX - containerRect.left;
      const curY = ev.clientY - containerRect.top;
      const rect = { x: Math.min(startX, curX), y: Math.min(startY, curY), w: Math.abs(curX - startX), h: Math.abs(curY - startY) };
      setMarqueeRect(rect);
      const ids = entries
        .filter((entry) => {
          const left = camera.x + entry.pos.x * camera.zoom;
          const top = camera.y + entry.pos.y * camera.zoom;
          const width = entry.layout.size.width * camera.zoom;
          const height = entry.layout.size.height * camera.zoom;
          return left < rect.x + rect.w && left + width > rect.x && top < rect.y + rect.h && top + height > rect.y;
        })
        .map((entry) => entry.id);
      selectScenes(ids);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarqueeRect(null);
      document.body.style.userSelect = prevUserSelect;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleCanvasMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.shiftKey) {
      startMarqueeSelect(e);
      return;
    }
    // Background dragging only pans the camera in the hand ("move") tool — in every other tool a
    // background click is just click-to-deselect (handleCanvasClick), never a pan.
    if (activeTool !== 'move') return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCam = camera;
    didPanRef.current = false;

    function onMove(ev: globalThis.MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) didPanRef.current = true;
      setCamera({
        zoom: startCam.zoom,
        x: startCam.x + dx,
        y: startCam.y + dy,
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleCanvasClick() {
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    setViewAllActivePage(null);
    selectGroup(null);
  }

  function handleAddAdjacent(source: PageEntry, edge: 'right' | 'bottom', results: QuickSizeResult[]) {
    const anchor =
      edge === 'right'
        ? {
            x: source.pos.x + source.layout.size.width + PAGE_GAP,
            y: source.pos.y,
          }
        : {
            x: source.pos.x,
            y: source.pos.y + source.layout.size.height + PAGE_GAP,
          };

    let cursorX = anchor.x;
    const newIds: string[] = [];
    const newHeightById: Record<string, number> = {};
    for (const result of results) {
      const setId = nextId('set');
      const productId = nextId('product');
      const filledLayout = applyPrototypeSizeFill(
        createAdaptedLayout(source.layout, {
          setId,
          productId,
          width: result.width,
          height: result.height,
          label: result.label,
          presetId: result.presetId,
          ruleSetId: result.ruleSetId,
        }),
      );
      // Mocks the finished composition (coupon/logo/headline/button/bottom_banner/product shot)
      // onto every freshly generated size, per public/samples/position-overlay-spec.md — percentage
      // positions keyed off the new size's own wide/square/tall aspect-ratio archetype.
      const newLayout: Layout = { ...filledLayout, elements: [...filledLayout.elements, ...buildOverlayElements(result.width, result.height)] };
      const newSet: BannerSet = {
        id: setId,
        name: result.label,
        sourceLayoutId: newLayout.id,
        layoutIds: [newLayout.id],
        productIds: [],
      };
      upsertLayout(newLayout);
      loadSet(newSet, { x: cursorX, y: anchor.y });
      startPageLoading(setId);
      newIds.push(setId);
      newHeightById[setId] = result.height;
      cursorX += result.width + PAGE_GAP;
    }

    // Self-organizes this batch tallest-first before it joins the group's pack order (see
    // packShelves) — only this fresh batch is sorted; any sizes already in the group keep
    // whatever order a prior manual drag-to-reorder left them in, and these just append after.
    newIds.sort((a, b) => newHeightById[b] - newHeightById[a]);
    // Only used when this call actually creates a brand-new group (groupPagesWith ignores
    // `name`/`platformId` when extending an existing one) — named after the primary banner
    // itself, so the group reads the same as the size that spawned it. Renamable afterward.
    groupPagesWith(source.id, newIds, source.set.name);
    // If the source was still ungrouped, it just moved off the shared default canvas onto its own
    // — follow it there so the set doesn't vanish right after you added sizes to it. A no-op when
    // this only extended a group the source (and the active canvas) already belonged to.
    setActiveCanvas(useAppStore.getState().pageGroupIdByPage[source.id] ?? source.id);
    // The source scene was selected (that's what showed the "add sizes" affordance in the first
    // place) — leaving it selected would dim every sibling just generated, reading as if something
    // went wrong. Clear it so the whole new group shows at full opacity.
    selectScene(null);
  }

  // Once a group has more than one size, adding more happens through the "All size variations"
  // header's own "+" — the per-page hotspots would just duplicate that and clutter the packed layout.
  function isMultiMemberGroupPage(pageId: string) {
    const groupId = pageGroupIdByPage[pageId];
    return groupId ? (pageGroups[groupId]?.memberIds.length ?? 0) > 1 : false;
  }

  // A non-primary member of a multi-member group — these are the "All sizes" pack, draggable to
  // reorder amongst themselves (see startSiblingReorderDrag). The primary itself always keeps the
  // free-form, snap-to-align drag it already had (startPageDrag) — it isn't part of this pack.
  function isReorderableSibling(pageId: string) {
    const groupId = pageGroupIdByPage[pageId];
    const group = groupId ? pageGroups[groupId] : null;
    return Boolean(group && group.memberIds.length > 1 && group.memberIds[0] !== pageId);
  }

  const groupBoxes = Object.values(pageGroups)
    .map((group) => {
      const members = group.memberIds.map((id) => entries.find((e) => e.id === id)).filter((e): e is PageEntry => Boolean(e));
      if (members.length === 0) return null;
      const b = members.reduce(
        (acc, m) => ({
          minX: Math.min(acc.minX, m.pos.x),
          minY: Math.min(acc.minY, m.pos.y),
          maxX: Math.max(acc.maxX, m.pos.x + m.layout.size.width),
          maxY: Math.max(acc.maxY, m.pos.y + m.layout.size.height),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      const left = camera.x + b.minX * camera.zoom - GROUP_PAD_LEFT;
      const top = camera.y + b.minY * camera.zoom - GROUP_PAD_TOP;
      const right = camera.x + b.maxX * camera.zoom + GROUP_PAD_RIGHT;
      const bottom = camera.y + b.maxY * camera.zoom + GROUP_PAD_BOTTOM;
      return { group, left, top, width: right - left, height: bottom - top };
    })
    .filter(
      (
        g,
      ): g is {
        group: PageGroup;
        left: number;
        top: number;
        width: number;
        height: number;
      } => g !== null,
    );

  return (
    <>
      <div
        ref={outerRef}
        className="absolute inset-0 overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: `${DOT_SPACING * camera.zoom}px ${DOT_SPACING * camera.zoom}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          cursor: activeTool === 'move' ? 'grab' : 'default',
        }}
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
      >
        {entries.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-chrome-fg-muted">{t('No pages yet — use "+ New page" to start.')}</div>
        )}

        {viewport.width > 0 &&
          groupBoxes.map(({ group, left, top, width, height }) => (
            <GroupContainer
              key={group.id}
              left={left}
              top={top}
              width={width}
              height={height}
              zoom={camera.zoom}
              onSelect={() => selectGroup(group.id)}
              onDragMove={(dx, dy) => movePagesBy(group.memberIds, dx, dy)}
            />
          ))}

        {viewport.width > 0 &&
          Array.from(groupLayoutById.entries()).map(([groupId, { primaryEntry, originX, originY, layout }]) => {
            const left = camera.x + originX * camera.zoom;
            const labelTop = camera.y + (originY + layout.primaryLabelY) * camera.zoom;
            const headerTop = camera.y + (originY + layout.headerY) * camera.zoom;
            const dividerWidth = layout.dividerWidth * camera.zoom;
            return (
              <div key={groupId} className="pointer-events-none absolute inset-0">
                <div className="absolute text-base text-white/45" style={{ left, top: labelTop }}>
                  {t('PRIMARY SIZE')}
                </div>
                {layout.siblings.length > 0 && (
                  <AllSizesDivider
                    left={left}
                    top={headerTop}
                    width={dividerWidth}
                    onConfirm={(results) => handleAddAdjacent(primaryEntry, 'right', results)}
                    sourceLayoutId={primaryEntry.layout.id}
                    onFocusPrimary={() => requestFocusPage(primaryEntry.id)}
                  />
                )}
              </div>
            );
          })}

        {viewport.width > 0 &&
          entries.map((entry) => {
            const isDraggingThis = reorderDrag?.siblingId === entry.id;
            const posX = isDraggingThis ? reorderDrag.x : entry.pos.x;
            const posY = isDraggingThis ? reorderDrag.y : entry.pos.y;
            const groupId = pageGroupIdByPage[entry.id];
            const canReorder = isReorderableSibling(entry.id);
            // Only the *other* siblings in the group currently being reordered ever transition
            // their position (to visibly slide into their new slot) — every other card, including
            // these same two once the drag ends, renders with no position transition at all, so
            // panning/zooming the camera moves everything in perfect lockstep, instantly.
            const isReflowingPeer = reorderDrag !== null && reorderDrag.groupId === groupId && !isDraggingThis;
            return (
              <PageCard
                key={entry.id}
                entry={entry}
                left={camera.x + posX * camera.zoom}
                top={camera.y + posY * camera.zoom}
                width={entry.layout.size.width * camera.zoom}
                height={entry.layout.size.height * camera.zoom}
                scale={camera.zoom}
                // A selected scene is immediately fully interactive too (drag-to-resize handles,
                // click-to-edit-text, etc.) — not just after the separate double-click-to-enter
                // gesture, which still exists for a scene that's not currently selected.
                active={entry.id === viewAllActivePageId || selectedSceneIds.includes(entry.id)}
                isLoading={Boolean(loadingPageIds[entry.id])}
                isPrimary={pageGroups[pageGroupIdByPage[entry.id]]?.memberIds[0] === entry.id}
                showCascadeToolbar={pageGroups[pageGroupIdByPage[entry.id]]?.memberIds[0] === entry.id && Boolean(pendingCascadeSetIds[entry.id])}
                dimmed={!isMultiSceneElementSelection && selectedSceneIds.length > 0 && !selectedSceneIds.includes(entry.id)}
                dragging={isDraggingThis}
                reflowing={isReflowingPeer}
                onActivate={() => setViewAllActivePage(entry.id)}
                onStartDrag={(e) => (canReorder && groupId ? startSiblingReorderDrag(e, groupId, entry) : startPageDrag(e, entry))}
                onRename={(name) => renamePage(entry.id, name)}
                showRightAdd={!isMultiMemberGroupPage(entry.id) && !hasBlockerToRight(entry, entries)}
                showBottomAdd={!isMultiMemberGroupPage(entry.id) && !hasBlockerBelow(entry, entries)}
                onAddAdjacent={(edge, results) => handleAddAdjacent(entry, edge, results)}
              />
            );
          })}

        {snapGuides.x !== null && <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-button-primary" style={{ left: camera.x + snapGuides.x * camera.zoom }} />}
        {snapGuides.y !== null && <div className="pointer-events-none absolute right-0 left-0 h-px bg-button-primary" style={{ top: camera.y + snapGuides.y * camera.zoom }} />}

        {marqueeRect && (
          <div
            className="pointer-events-none absolute border border-button-primary bg-button-primary/15"
            style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
          />
        )}
      </div>
      <div className="pointer-events-none absolute right-6 bottom-6 z-10">
        <CanvasZoomBar zoomPct={camera.zoom * 100} onSetZoom={setZoomPct} onFitToScreen={handleFitToScreen} snapEnabled={snapEnabled} onToggleSnap={() => setSnapEnabled((v) => !v)} />
      </div>
    </>
  );
}
