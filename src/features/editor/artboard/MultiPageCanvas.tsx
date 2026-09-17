import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import { nextId, createAdaptedLayout } from '@/lib/create-layout';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { BannerSet, Layout } from '@/types';
import type { PagePosition } from '@/store/types';
import { ArtboardFrame } from './ArtboardFrame';
import { CascadeToolbar } from './CascadeToolbar';
import { CanvasZoomBar } from './CanvasZoomBar';
import { RulerOverlay } from './RulerOverlay';
import { PageTitleBar } from './PageTitleBar';
import { QuickSizeMenu, type QuickSizeResult } from './QuickSizeMenu';
import { SceneContextMenu } from './SceneContextMenu';
import {
  canvasRootOf,
  isPrimaryPage,
  PAGE_GAP,
  PAGE_TITLE_RESERVE,
  PRIMARY_LABEL_RESERVE,
  SECTION_GAP_BOTTOM,
  SECTION_GAP_TOP,
  SECTION_HEADER_HEIGHT,
  TITLE_CLEARANCE_BUFFER,
} from '@/lib/canvas-layout';
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
 * The "add more sizes" circular icon — the "ALL SIZES" divider's own small "+", one per column.
 * Default state is a plain dark circle; hovering it swaps to the pre-built yellow `add size.svg`
 * asset. Tooltip is hand-rolled (not the shared Radix Tooltip) because this button is always
 * wrapped by QuickSizeMenu's trigger-cloning, which expects to clone a single clickable element
 * directly — nesting a Tooltip/TooltipTrigger in between would break that.
 */
function AddSizeIconButton({
  onClick,
  onHoverChange,
}: {
  onClick?: (e: ReactMouseEvent) => void;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);

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
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)] transition-colors"
        style={{ background: hovered ? '#4570FF' : '#26262C' }}
      >
        <img src="/icons/Button%2040/More-size.svg" alt="" className="size-4" />
      </button>
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 flex w-max min-w-[50px] max-w-[308px] -translate-x-1/2 flex-col items-center">
          <div className="rounded-md px-2 py-1 text-center text-sm text-white tracking-[-0.01em] leading-[140%]" style={{ background: '#50505D' }}>
            {t('Add more sizes')}
          </div>
          <div className="h-2 w-4" style={{ background: '#50505D', clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
        </div>
      )}
    </div>
  );
}

/** The hotspot below a scene card — a wide labeled pill (not the small hover-circle the "ALL
 * SIZES" divider uses above), always legible rather than hover-revealed-as-an-icon, matching the
 * reference design's "Button 40 / Primary text" component. */
function AddMoreSizesButton({ onClick }: { onClick?: (e: ReactMouseEvent) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className="flex h-[47px] shrink-0 items-center gap-2 rounded-full bg-[#4570FF] px-6 pb-px text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:bg-[#2C52DA]"
    >
      <img src="/icons/Button%2040/More-size.svg" alt="" className="size-6 shrink-0" />
      <span className="text-[15px] leading-6 font-semibold tracking-[-0.01em]">{t('Add more sizes')}</span>
    </button>
  );
}

const ADD_ICON_SIZE = 28; // matches AddSizeIconButton's own size={7} (Tailwind size-7)
const ADD_ICON_GAP = 8; // fixed screen px — the line stops this far short of each icon's circle on both sides
const ALL_SIZES_LABEL_RESERVE = 100; // approximate screen-px width reserved for the "ALL SIZES" text before the line begins

/**
 * The "ALL SIZES" row's divider line + one "+" icon per column — used both for a single group's
 * own header (one icon) and for a bundle of primaries created together (see BannersTab's "+")
 * sharing one line across every column that has sizes, rather than each column getting its own
 * separate header. Each icon's own `x` is expected to already be centered on that column's own
 * primary card (see MultiPageCanvas's Pass 4, which centers the primary the same way). The line
 * renders as discrete segments between icons (not one continuous line with icons drawn on top) so
 * the canvas's dotted background shows through in the `ADD_ICON_GAP` on either side of each circle,
 * matching the reference design.
 */
function UnifiedAllSizesHeader({
  left,
  top,
  totalWidth,
  icons,
}: {
  left: number;
  top: number;
  /** Screen-px, from this header's own left edge to the last column's right edge. */
  totalWidth: number;
  /** Each column's icon center x — screen-px, relative to `left`, already zoom-scaled by the caller — plus its own confirm/focus handlers. */
  icons: Array<{ x: number; entry: PageEntry; onConfirm: (results: QuickSizeResult[]) => void; onFocusPrimary: () => void }>;
}) {
  const t = useT();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  return (
    <div className="pointer-events-none absolute" style={{ left, top, width: totalWidth, height: 0 }}>
      {/* Vertical centering here is done with explicit `top` offsets, not `transform: translateY`
          — a `transform` on an ancestor becomes the containing block for any `position: fixed`
          descendant, which would silently break QuickSizeMenu's own fixed-positioned panel (it'd
          anchor to this element instead of the viewport, landing off-screen). */}
      <span className="absolute text-base text-white/45" style={{ left: 0, top: -8 }}>
        {t('ALL SIZES')}
      </span>
      {icons.map((icon, i) => {
        const segStart = i === 0 ? ALL_SIZES_LABEL_RESERVE : icons[i - 1].x + ADD_ICON_SIZE / 2 + ADD_ICON_GAP;
        const segEnd = icon.x - ADD_ICON_SIZE / 2 - ADD_ICON_GAP;
        return (
          <div key={icon.entry.id}>
            {segEnd > segStart && (
              <div
                className="absolute h-px transition-colors"
                style={{ left: segStart, top: -0.5, width: segEnd - segStart, background: hoveredIndex === i ? 'rgba(255,255,255,0.45)' : '#40404A' }}
              />
            )}
            <div className="pointer-events-auto absolute" style={{ left: icon.x - ADD_ICON_SIZE / 2, top: -ADD_ICON_SIZE / 2 }}>
              <QuickSizeMenu onConfirm={icon.onConfirm} sourceLayoutId={icon.entry.layout.id}>
                <AddSizeIconButton onHoverChange={(v) => setHoveredIndex(v ? i : null)} onClick={icon.onFocusPrimary} />
              </QuickSizeMenu>
            </div>
          </div>
        );
      })}
      {icons.length > 0 &&
        (() => {
          const last = icons[icons.length - 1];
          const segStart = last.x + ADD_ICON_SIZE / 2 + ADD_ICON_GAP;
          return (
            segStart < totalWidth && (
              <div className="absolute h-px" style={{ left: segStart, top: -0.5, width: totalWidth - segStart, background: '#40404A' }} />
            )
          );
        })()}
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
          <AddMoreSizesButton />
        )}
      </QuickSizeMenu>
    </div>
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
  entered,
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
  renaming,
  onRenamingChange,
  onSceneContextMenu,
}: {
  entry: PageEntry;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  active: boolean;
  /** True once this card is the single "active" one (`viewAllActivePageId`) — unlike `active` below
   * (also true for every card in a shift-multi-selection), this is what unlocks ArtboardFrame's full
   * inner-layer interactivity (drag the image, edit text in place, etc.), set by a plain single
   * click landing on this card (see ArtboardFrame's own `handleFrameMouseDown`). A multi-selected
   * but not-entered card stays a static preview so dragging it always moves the whole card instead
   * of grabbing a layer underneath. */
  entered: boolean;
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
  /** Controlled rename-mode state, lifted up so the scene's own right-click menu can also enter it. */
  renaming: boolean;
  onRenamingChange: (renaming: boolean) => void;
  /** Right-click anywhere on the scene that isn't already its own image layer's context menu. */
  onSceneContextMenu: (e: ReactMouseEvent) => void;
}) {
  const { set: bannerSet, layout } = entry;
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      className={cn('group/card absolute', reflowing ? 'transition-[opacity,left,top] duration-150' : 'transition-opacity')}
      style={{ left, top, width, height, opacity: dimmed ? 0.6 : 1, zIndex: dragging ? 10 : undefined }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
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
        editing={renaming}
        onEditingChange={onRenamingChange}
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
          active={entered}
          onActivate={onActivate}
          onSceneMouseDown={onStartDrag}
          onSceneContextMenu={onSceneContextMenu}
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
  const canvasRootByPage = useAppStore((s) => s.canvasRootByPage);
  const canvasRootOrder = useAppStore((s) => s.canvasRootOrder);
  const reorderCanvasRoot = useAppStore((s) => s.reorderCanvasRoot);
  const loadingPageIds = useAppStore((s) => s.loadingPageIds);
  const upsertLayout = useAppStore((s) => s.upsertLayout);
  const loadSet = useAppStore((s) => s.loadSet);
  const groupPagesWith = useAppStore((s) => s.groupPagesWith);
  const reorderGroupSiblings = useAppStore((s) => s.reorderGroupSiblings);
  const renamePage = useAppStore((s) => s.renamePage);
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);
  const movePagesBy = useAppStore((s) => s.movePagesBy);
  const startPageLoading = useAppStore((s) => s.startPageLoading);
  const viewAllActivePageId = useAppStore((s) => s.viewAllActivePageId);
  const setViewAllActivePage = useAppStore((s) => s.setViewAllActivePage);
  const focusPageId = useAppStore((s) => s.focusPageId);
  const requestFocusPage = useAppStore((s) => s.requestFocusPage);
  const clearFocusPage = useAppStore((s) => s.clearFocusPage);
  const revealPageId = useAppStore((s) => s.revealPageId);
  const requestRevealPage = useAppStore((s) => s.requestRevealPage);
  const clearRevealPage = useAppStore((s) => s.clearRevealPage);
  const selectGroup = useAppStore((s) => s.selectGroup);
  const activeCanvasRootId = useAppStore((s) => s.activeCanvasRootId);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);
  const activeTool = useAppStore((s) => s.activeTool);
  const showRulers = useAppStore((s) => s.showRulers);
  const toggleRulers = useAppStore((s) => s.toggleRulers);
  const pendingCascadeSetIds = useAppStore((s) => s.pendingCascadeSetIds);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectScene = useAppStore((s) => s.selectScene);
  const selectScenes = useAppStore((s) => s.selectScenes);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const selectElement = useAppStore((s) => s.selectElement);
  const setActiveLayout = useAppStore((s) => s.setActiveLayout);
  const deletePage = useAppStore((s) => s.deletePage);
  // A layer selected with match-select on spans several scenes at once — dimming every scene that
  // selection didn't *also* add to selectedSceneIds would leave the other matched scenes looking
  // deselected even though they're showing a live bounding box, so skip dimming entirely whenever
  // the current element selection already spans more than one scene.
  const isMultiSceneElementSelection = new Set(selectedElements.map((r) => r.layoutId)).size > 1;
  // Selecting a main size (its primary) shouldn't dim its own "all sizes" pack — they read as one
  // unit — so anything sharing a real PageGroup with a selected scene stays at full opacity too,
  // not just the literal selected id(s).
  const selectedGroupIds = new Set(selectedSceneIds.map((id) => pageGroupIdByPage[id]).filter(Boolean));

  const outerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [snapGuides, setSnapGuides] = useState<{
    x: number | null;
    y: number | null;
  }>({ x: null, y: null });
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // While a sibling is being dragged to reorder within its group's "All sizes" pack, it follows
  // the cursor freely (this) instead of snapping to whatever slot computeGroupLayout currently
  // assigns it — every other sibling still renders at its (live-updating, as the drag crosses
  // neighbors) packed position, giving the Figma-style "the rest reflows around it" feel. `groupId`
  // scopes the reflow transition to just that group's other siblings — every other card on the
  // canvas (including this same card whenever this is null) renders with no position transition
  // at all, so panning/zooming the camera moves everything in lockstep, instantly.
  const [reorderDrag, setReorderDrag] = useState<{ groupId: string; siblingId: string; x: number; y: number } | null>(null);
  // Same float-then-snap treatment as `reorderDrag`, but for swapping "cluster roots" (a bundle's
  // main-size columns) left-to-right instead of siblings within one pack — see startClusterRootDrag.
  // `entryId` is always the cluster root itself (a bare page, or a group's own primary), never one
  // of its siblings, even when the whole pack visually rides along with the drag.
  const [clusterReorderDrag, setClusterReorderDrag] = useState<{ rootId: string; entryId: string; x: number; y: number } | null>(null);
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number; y: number; entryId: string } | null>(null);
  // Lifted out of PageTitleBar so the scene's own right-click menu can also enter rename mode, not
  // just a double-click on the name.
  const [renamingEntryId, setRenamingEntryId] = useState<string | null>(null);
  const didPanRef = useRef(false);
  const fitKeyRef = useRef<string | null>(null);
  const cameraAnimRef = useRef<number | null>(null);

  // Smoothly pans/zooms from wherever the camera currently sits to `target`, instead of the instant
  // jump a plain `setCamera` would give — used for "bring the primary back on screen" (the "ALL
  // SIZES" + icon's onFocusPrimary), where a sudden cut reads as jarring. Cancels any prior
  // in-flight animation first so rapid repeat clicks retarget smoothly rather than fighting.
  function animateCameraTo(target: Camera, duration = 400) {
    if (cameraAnimRef.current !== null) cancelAnimationFrame(cameraAnimRef.current);
    const start = camera;
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCamera({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        zoom: start.zoom + (target.zoom - start.zoom) * eased,
      });
      cameraAnimRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    }
    cameraAnimRef.current = requestAnimationFrame(tick);
  }

  // Any manual pan/zoom should immediately override an in-flight animateCameraTo — otherwise a
  // click-to-focus animation still in flight would fight the user's own gesture and snap back.
  function stopCameraAnim() {
    if (cameraAnimRef.current === null) return;
    cancelAnimationFrame(cameraAnimRef.current);
    cameraAnimRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (cameraAnimRef.current !== null) cancelAnimationFrame(cameraAnimRef.current);
    };
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const compute = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The view-all canvas shows exactly one "canvas" at a time — a standalone page's own id, a
  // group's id, or a bundle's shared root (see canvasRootOf) — never several side by side, so
  // creating/switching to a different banner set hides whatever was visible before instead of
  // stacking it below. Every top-level page gets its own canvas from the moment it's created,
  // whether or not it's ever grouped into a set.
  const rootOf = (id: string) => canvasRootOf({ pageGroupIdByPage, pageGroups, canvasRootByPage }, id);
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

  // Pass 1: compute each real group's *relative* layout only (siblings' pack width/height) —
  // deliberately not touching any entry's `.pos` yet, since a group's own footprint (needed below
  // to space it apart from its neighbors) depends on this, not the other way around.
  const relativeLayoutByGroupId = new Map<string, { primaryEntry: PageEntry; siblingEntries: PageEntry[]; layout: ReturnType<typeof computeGroupLayout> }>();
  const siblingIds = new Set<string>();
  for (const group of Object.values(pageGroups)) {
    if (group.memberIds.length < 2) continue;
    const primaryEntry = entries.find((e) => e.id === group.memberIds[0]);
    if (!primaryEntry) continue;
    const siblingEntries = group.memberIds
      .slice(1)
      .map((id) => entries.find((e) => e.id === id))
      .filter((e): e is PageEntry => Boolean(e));
    // A hidden sibling stays a pack member (siblingIds below still claims its id, so it never gets
    // mistaken for its own standalone cluster root) but drops out of the packed column entirely —
    // its slot isn't reserved, so the visible siblings after it shift up to close the gap.
    const layout = computeGroupLayout(
      primaryEntry.layout.size,
      siblingEntries.filter((e) => !e.layout.hidden).map((e) => ({ id: e.id, width: e.layout.size.width, height: e.layout.size.height })),
    );
    relativeLayoutByGroupId.set(group.id, { primaryEntry, siblingEntries, layout });
    for (const s of siblingEntries) siblingIds.add(s.id);
  }
  const groupIdByPrimaryId = new Map(Array.from(relativeLayoutByGroupId.entries()).map(([groupId, v]) => [v.primaryEntry.id, groupId]));
  // Shared by Pass 2's reflow and Pass 3's bundle-header math — a cluster root's own frame width
  // once it has no siblings yet, or its whole sibling pack's width once it does.
  function footprintWidthOf(root: PageEntry): number {
    const groupId = groupIdByPrimaryId.get(root.id);
    return groupId ? relativeLayoutByGroupId.get(groupId)!.layout.contentWidth : root.layout.size.width;
  }

  // Pass 2: reflow every "cluster root" (a real group's primary, or a standalone page — anything
  // that isn't itself a pack sibling) left to right with a consistent gap, using each one's *actual
  // current* footprint. Bundled starting sizes (see BannersTab's "+") begin evenly spaced by their
  // own bare widths; the moment one of them grows a wide sibling pack, every cluster after it needs
  // to shift right to keep from overlapping, which is exactly what this recomputes on every render
  // rather than baking a fixed offset in at creation time. Order follows the bundle's explicit
  // `canvasRootOrder` (drag-to-reorder writes there — see startClusterRootDrag) when one exists;
  // a lone, never-bundled canvas falls back to plain position order.
  const rawClusterRoots = entries.filter((e) => !siblingIds.has(e.id));
  const explicitClusterOrder = effectiveActiveId ? canvasRootOrder[effectiveActiveId] : undefined;
  const clusterRoots = explicitClusterOrder
    ? [
        ...explicitClusterOrder.map((id) => rawClusterRoots.find((r) => r.id === id)).filter((r): r is PageEntry => Boolean(r)),
        ...rawClusterRoots.filter((r) => !explicitClusterOrder.includes(r.id)),
      ]
    : rawClusterRoots.sort((a, b) => a.pos.x - b.pos.x);
  // Anchored at the *smallest* stored x among current members, not whichever one is first in
  // `order` — otherwise promoting a later-created (further-right) column to first place would drag
  // the whole bundle's start point along with it, jumping everyone right on every swap. Every
  // cluster root's rendered x is fully order-derived from that one fixed point, matching how a
  // group's sibling pack is entirely derived from its primary's position rather than each
  // sibling's own (inert) stored coordinates.
  const clusterAnchorX = clusterRoots.length ? Math.min(...clusterRoots.map((r) => r.pos.x)) : 0;
  let clusterCursorX = clusterAnchorX;
  for (const root of clusterRoots) {
    root.pos = { x: clusterCursorX, y: root.pos.y };
    clusterCursorX += footprintWidthOf(root) + PAGE_GAP;
  }
  // Deliberately *not* overridden here for the entry mid cluster-reorder-drag (see clusterReorderDrag
  // below) — this settled cascade position is what the "PRIMARY SIZE"/"ALL SIZES" header, divider,
  // and any sibling pack all anchor to, and none of that should swim around with the cursor; only
  // the dragged card's own on-screen position (applied at final render) floats free.

  // Pass 3: group cluster roots created together (see BannersTab's "+") by their shared
  // canvasRootByPage value. Once at least *two* bundle members have grown their own sibling pack,
  // those members get ONE shared "PRIMARY SIZE"/"ALL SIZES" header spanning just their columns —
  // and each of *their* own sibling packs is shifted to start at one shared line, so every included
  // column's "All sizes" row begins at the same Y regardless of how tall its own primary happens to
  // be. A bundle member with no sizes of its own yet is left out of this shared line entirely (even
  // if it sits between two members that do have one) — it keeps its own single-column "Add more
  // sizes" pill until it has sizes to report, joining the shared line only once it does. A lone
  // (unbundled) cluster root, or a bundle where fewer than two members have sizes, is untouched
  // here and keeps its ordinary single-column treatment below.
  type UnifiedHeader = {
    originX: number;
    originY: number;
    primaryLabelY: number;
    headerY: number;
    totalWidth: number;
    icons: Array<{ x: number; entry: PageEntry }>;
  };
  const unifiedHeaders: UnifiedHeader[] = [];
  const bundledGroupIds = new Set<string>();
  const siblingsYDeltaByGroupId = new Map<string, number>();

  const bundleByKey = new Map<string, PageEntry[]>();
  for (const root of clusterRoots) {
    const key = canvasRootByPage[root.id] ?? root.id;
    const list = bundleByKey.get(key) ?? [];
    list.push(root);
    bundleByKey.set(key, list);
  }
  for (const bundle of bundleByKey.values()) {
    // Only a bundle member that has *actually* grown its own sibling pack joins the shared,
    // connected line — a freshly-added primary with nothing added yet stays its own separate
    // column (with just its own "Add more sizes" pill below it) until it has sizes of its own to
    // report, rather than being swept into a line/icon that doesn't apply to it yet.
    const withSizes = bundle.filter((root) => groupIdByPrimaryId.has(root.id));
    if (withSizes.length < 2) continue;
    const sorted = [...withSizes].sort((a, b) => a.pos.x - b.pos.x);

    const originX = sorted[0].pos.x;
    const originY = sorted[0].pos.y;
    const maxPrimaryHeight = Math.max(...sorted.map((root) => root.layout.size.height));
    const headerY = maxPrimaryHeight + SECTION_GAP_TOP;
    const sharedSiblingsY = headerY + SECTION_HEADER_HEIGHT + SECTION_GAP_BOTTOM;

    const icons = sorted.map((root) => ({ x: root.pos.x - originX + footprintWidthOf(root) / 2, entry: root }));
    const last = sorted[sorted.length - 1];
    const totalWidth = last.pos.x - originX + footprintWidthOf(last);

    unifiedHeaders.push({ originX, originY, primaryLabelY: -PRIMARY_LABEL_RESERVE - titleClearance, headerY, totalWidth, icons });

    for (const root of sorted) {
      const groupId = groupIdByPrimaryId.get(root.id);
      if (!groupId) continue;
      bundledGroupIds.add(groupId);
      const localLayout = relativeLayoutByGroupId.get(groupId)!.layout;
      siblingsYDeltaByGroupId.set(groupId, sharedSiblingsY - (localLayout.headerY + SECTION_HEADER_HEIGHT + SECTION_GAP_BOTTOM));
    }
  }

  // Pass 4: now that every cluster root's `.pos` (and every bundle's Y-alignment delta) is final,
  // anchor each group's siblings relative to its (possibly just-reflowed) primary — both the
  // primary card and the sibling pack simply left-align to the group's origin, whichever is
  // narrower. `originX`/`originY` stay the group's true left edge throughout — used unchanged
  // below for the "PRIMARY SIZE"/"ALL SIZES" label and divider, which still span the group's full
  // `contentWidth` starting there.
  for (const [groupId, { primaryEntry, siblingEntries, layout }] of relativeLayoutByGroupId) {
    const originX = primaryEntry.pos.x;
    const originY = primaryEntry.pos.y;
    groupLayoutById.set(groupId, {
      primaryEntry,
      originX,
      originY,
      layout: {
        ...layout,
        primaryLabelY: layout.primaryLabelY - titleClearance,
      },
    });
    const yDelta = siblingsYDeltaByGroupId.get(groupId) ?? 0;

    primaryEntry.pos = { x: originX, y: originY };

    for (const box of layout.siblings) {
      const target = siblingEntries.find((e) => e.id === box.id);
      if (target)
        target.pos = {
          x: originX + box.x,
          y: originY + box.y + titleClearance + yDelta,
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
    const rawX = (viewport.width - contentW * zoom) / 2 - bounds.minX * zoom;
    const rawY = (viewport.height - contentH * zoom) / 2 - bounds.minY * zoom;
    // Snapped to the dot grid's own tile size so a dot always lands right at the viewport's edge
    // on load/fit — otherwise whatever fractional phase the centering math happens to produce can
    // leave an arbitrarily wide dot-free gap along that edge.
    const tile = DOT_SPACING * zoom;
    const x = Math.round(rawX / tile) * tile;
    const y = Math.round(rawY / tile) * tile;
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
      animateCameraTo({ x, y, zoom });
    }
    clearFocusPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPageId, viewport.width, viewport.height]);

  // Duplicating a scene requests this instead of `focusPageId` — a plain pan to bring the new copy
  // into view, at whatever zoom the canvas is already at, rather than `focusPageId`'s zoom-to-fill.
  useEffect(() => {
    if (!revealPageId || viewport.width === 0) return;
    const entry = entries.find((e) => e.id === revealPageId);
    if (entry) {
      const zoom = camera.zoom;
      const x = viewport.width / 2 - (entry.pos.x + entry.layout.size.width / 2) * zoom;
      const y = viewport.height / 2 - (entry.pos.y + entry.layout.size.height / 2) * zoom;
      animateCameraTo({ x, y, zoom });
    }
    clearRevealPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealPageId, viewport.width, viewport.height]);

  // Zoom bar: jump to an exact zoom level, keeping the viewport's own center point fixed in
  // canvas-space (same "zoom around a point" math the wheel handler below uses, just centered on
  // the viewport instead of the cursor).
  function setZoomPct(pct: number) {
    stopCameraAnim();
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
    stopCameraAnim();
    const fit = computeFitCamera();
    if (fit) setCamera(fit);
  }

  // React's onWheel is passive by default, so preventDefault must go through a native listener.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    function onWheelNative(e: WheelEvent) {
      e.preventDefault();
      stopCameraAnim();
      // A pinch gesture on a trackpad fires wheel events with ctrlKey set (a browser convention,
      // not an actual held-down key), and holding Ctrl/Cmd with a real scroll wheel does the same
      // deliberately — either way, that's "zoom". Everything else (a plain two-finger scroll) pans
      // the camera instead, matching how every other design tool treats the two gestures.
      if (e.ctrlKey || e.metaKey) {
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
        return;
      }
      setCamera((prev) => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
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
          return layout && !layout.hidden ? { id, width: layout.size.width, height: layout.size.height } : null;
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

  // Drag-to-reorder the "cluster roots" sharing one canvas view (a bundle's main-size columns) —
  // the exact same swap-on-center-cross interaction as startSiblingReorderDrag, mirrored onto
  // `canvasRootOrder` instead of a group's `memberIds`. Reads fresh store state on every move for
  // the same staleness reasons.
  function startClusterRootDrag(e: ReactMouseEvent, rootId: string, entry: PageEntry) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = camera.zoom;
    const startPos = entry.pos;
    const w = entry.layout.size.width;
    const h = entry.layout.size.height;
    let order = canvasRootOrder[rootId] ?? clusterRoots.map((r) => r.id);
    let dragging = false;

    function footprintWidthFresh(state: ReturnType<typeof useAppStore.getState>, root: { id: string; layout: Layout }): number {
      const groupId = state.pageGroupIdByPage[root.id];
      const group = groupId ? state.pageGroups[groupId] : null;
      if (!group || group.memberIds.length < 2) return root.layout.size.width;
      const siblingBoxes = group.memberIds
        .slice(1)
        .map((id) => {
          const set = state.setsById[id];
          const layout = set ? state.layoutsById[set.sourceLayoutId] : null;
          return layout && !layout.hidden ? { id, width: layout.size.width, height: layout.size.height } : null;
        })
        .filter((b): b is { id: string; width: number; height: number } => Boolean(b));
      return computeGroupLayout(root.layout.size, siblingBoxes).contentWidth;
    }

    function onMove(ev: globalThis.MouseEvent) {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dxScreen, dyScreen) < PAN_THRESHOLD) return;
        dragging = true;
      }
      const x = startPos.x + dxScreen / zoom;
      const y = startPos.y + dyScreen / zoom;
      setClusterReorderDrag({ rootId, entryId: entry.id, x, y });

      const state = useAppStore.getState();
      const liveRootOf = (id: string) =>
        canvasRootOf({ pageGroupIdByPage: state.pageGroupIdByPage, pageGroups: state.pageGroups, canvasRootByPage: state.canvasRootByPage }, id);
      const memberEntries = order
        .map((id) => {
          if (liveRootOf(id) !== rootId) return null;
          const set = state.setsById[id];
          const layout = set ? state.layoutsById[set.sourceLayoutId] : null;
          const pos = state.pagePositions[id] ?? { x: 0, y: 0 };
          return set && layout ? { id, layout, pos } : null;
        })
        .filter((r): r is { id: string; layout: Layout; pos: PagePosition } => Boolean(r));

      // Same left-to-right cascade as Pass 2's own render pass (anchored at the smallest stored x
      // among these members), recomputed fresh from the *current* order so the hit test matches
      // what's actually on screen right now.
      const anchorX = memberEntries.length ? Math.min(...memberEntries.map((m) => m.pos.x)) : 0;
      let cursorX = anchorX;
      const boxes = memberEntries.map((m) => {
        const width = footprintWidthFresh(state, m);
        const left = cursorX;
        cursorX += width + PAGE_GAP;
        return { id: m.id, left, top: m.pos.y, width, height: m.layout.size.height };
      });

      // Only swaps once the dragged box's own center point actually lands inside another cluster
      // root's box — the "middle point dragged over the neighbor" trigger, same as sibling reorder.
      const draggedCenterX = x + w / 2;
      const draggedCenterY = y + h / 2;
      const targetBox = boxes.find((box) => {
        if (box.id === entry.id) return false;
        return draggedCenterX >= box.left && draggedCenterX <= box.left + box.width && draggedCenterY >= box.top && draggedCenterY <= box.top + box.height;
      });
      if (!targetBox) return;
      const fromIndex = order.indexOf(entry.id);
      const toIndex = order.indexOf(targetBox.id);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      order = arrayMove(order, fromIndex, toIndex);
      reorderCanvasRoot(rootId, order);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setClusterReorderDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Dragging on empty canvas rubber-bands a selection box — any scene it overlaps joins
  // `selectedSceneIds`, live as the box grows. A plain click (no movement past the pan threshold)
  // never starts a box, so it still falls through to handleCanvasClick's deselect-everything.
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
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;

    function onMove(ev: globalThis.MouseEvent) {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < PAN_THRESHOLD) return;
        dragging = true;
        // Reuses the pan gesture's own "didn't just click" flag so handleCanvasClick doesn't also
        // fire its deselect-everything behavior right after the drag finishes.
        didPanRef.current = true;
      }
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
    // Background dragging pans the camera in the hand ("move") tool; in every other tool the same
    // drag instead rubber-bands a selection box, and a plain click is click-to-deselect.
    if (activeTool !== 'move') {
      startMarqueeSelect(e);
      return;
    }
    stopCameraAnim();
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
    // Whichever platform this batch's sizes came from (if any) — a mixed-platform batch just takes
    // the first one, since picking sizes from more than one platform in a single confirm is a rare
    // edge case, not a meaningful "this group belongs to two platforms" scenario.
    const platformId = results.find((r) => r.platformId)?.platformId;
    // Only used when this call actually creates a brand-new group (groupPagesWith ignores
    // `name`/`platformId` when extending an existing one) — named after the primary banner
    // itself, so the group reads the same as the size that spawned it. Renamable afterward.
    groupPagesWith(source.id, newIds, source.set.name, platformId);
    // If the source was still ungrouped, it just moved off the shared default canvas onto its own
    // — follow it there so the set doesn't vanish right after you added sizes to it. A no-op when
    // this only extended a group the source (and the active canvas) already belonged to. Reading
    // the canvas root (not the raw group id) keeps this correct even when the source is bundled
    // alongside other independent primaries (see canvasRootOf) — otherwise this would jump to
    // showing *only* the source's own new group, hiding the rest of the bundle.
    setActiveCanvas(canvasRootOf(useAppStore.getState(), source.id));
    // The source scene was selected (that's what showed the "add sizes" affordance in the first
    // place) — leaving it selected would dim every sibling just generated, reading as if something
    // went wrong. Clear it so the whole new group shows at full opacity.
    selectScene(null);
  }

  // The scene right-click menu's "Duplicate banner" — a plain copy (fresh set/product/element ids)
  // that joins the source's existing group as a new sibling appended after the current sizes — or,
  // if the source isn't grouped yet, becomes the primary of a brand-new 2-member group with it —
  // never a standalone page off to the side.
  function handleDuplicateScene(entry: PageEntry) {
    const source = entry.layout;
    const newLayoutId = nextId('layout');
    const newSetId = nextId('set');
    const newProductId = nextId('product');
    const newLayout: Layout = {
      ...source,
      id: newLayoutId,
      setId: newSetId,
      productId: newProductId,
      elements: source.elements.map((el) => ({ ...el, id: nextId('el') })),
      isSource: true,
      detached: false,
      adaptationNotes: [],
    };
    const newSet: BannerSet = { id: newSetId, name: entry.set.name, sourceLayoutId: newLayoutId, layoutIds: [newLayoutId], productIds: [] };
    const rootId = pageGroupIdByPage[entry.id] ?? entry.id;
    const group = pageGroups[rootId];
    const sourcePageId = group ? group.memberIds[0] : rootId;
    upsertLayout(newLayout);
    loadSet(newSet, { x: entry.pos.x, y: entry.pos.y + source.size.height + PAGE_GAP });
    groupPagesWith(sourcePageId, [newSetId], setsById[sourcePageId]?.name ?? source.size.label);
    // groupPagesWith always appends the new sibling at the very end of the pack order — slot it in
    // right after the specific size that was actually duplicated instead, so it visually lands
    // directly below what was right-clicked (the pack stacks siblings vertically in member order),
    // regardless of where that happened to sit in a larger group.
    const groupIdAfter = useAppStore.getState().pageGroupIdByPage[sourcePageId];
    const groupAfter = groupIdAfter ? useAppStore.getState().pageGroups[groupIdAfter] : undefined;
    if (groupAfter) {
      const siblingIds = groupAfter.memberIds.slice(1).filter((id) => id !== newSetId);
      const insertAfterIndex = entry.id === groupAfter.memberIds[0] ? -1 : siblingIds.indexOf(entry.id);
      const nextSiblingIds =
        insertAfterIndex === -1
          ? [newSetId, ...siblingIds]
          : [...siblingIds.slice(0, insertAfterIndex + 1), newSetId, ...siblingIds.slice(insertAfterIndex + 1)];
      reorderGroupSiblings(groupIdAfter, nextSiblingIds);
    }
    // The general auto-fit effect keys on `entries.length` and would otherwise zoom out to frame
    // the whole (now one-bigger) set the instant this lands — pre-seed its key with what that
    // effect will compute next render so it sees no change and skips, then separately request a
    // plain pan (current zoom kept as-is) to bring just the new copy into view.
    const nextRootId = canvasRootOf(useAppStore.getState(), sourcePageId);
    fitKeyRef.current = `${nextRootId}:${entries.length + 1}:${viewport.width}:${viewport.height}`;
    requestRevealPage(newSetId);
    selectElement(null);
    selectScene(newSetId);
    setActiveCanvas(nextRootId);
    setActiveLayout(newLayoutId);
  }

  function handleDeleteScene(entry: PageEntry) {
    deletePage(entry.id);
  }

  // Once a group has more than one size, adding more happens through the "All size variations"
  // header's own "+" — the per-page hotspots would just duplicate that and clutter the packed
  // layout. Checking `memberIds.includes(pageId)` (not just that `pageGroupIdByPage[pageId]`
  // resolves to *some* group) is belt-and-suspenders: canvas-root sharing (attachStandalonePage)
  // is a fully separate concern from pack membership now (see canvasRootOf), so it shouldn't be
  // possible for this to resolve to a group `pageId` isn't actually in — but staying defensive
  // here is what keeps a bundled-but-ungrouped page's own hotspots working regardless.
  function isMultiMemberGroupPage(pageId: string) {
    const group = pageGroups[pageGroupIdByPage[pageId]];
    return Boolean(group && group.memberIds.includes(pageId) && group.memberIds.length > 1);
  }

  // A non-primary member of a multi-member group — these are the "All sizes" pack, draggable to
  // reorder amongst themselves (see startSiblingReorderDrag). The primary itself always keeps the
  // free-form, snap-to-align drag it already had (startPageDrag) — it isn't part of this pack.
  function isReorderableSibling(pageId: string) {
    const group = pageGroups[pageGroupIdByPage[pageId]];
    return Boolean(group && group.memberIds.length > 1 && group.memberIds.includes(pageId) && group.memberIds[0] !== pageId);
  }

  return (
    <>
      <div
        ref={outerRef}
        className="absolute inset-0 overflow-hidden"
        style={{
          // Below 30% zoom the dots are so densely packed they just read as a grey haze — hiding
          // them entirely there looks cleaner than a pattern that no longer reads as a grid.
          backgroundImage: camera.zoom >= 0.3 ? 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)' : 'none',
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
          Array.from(groupLayoutById.entries())
            .filter(([groupId]) => !bundledGroupIds.has(groupId))
            .map(([groupId, { primaryEntry, originX, originY, layout }]) => {
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
                    <UnifiedAllSizesHeader
                      left={left}
                      top={headerTop}
                      totalWidth={dividerWidth}
                      icons={[
                        {
                          // Centered on the group's own contentWidth — exactly where Pass 4 above
                          // also centers the primary card itself, so the icon and the primary line up.
                          x: dividerWidth / 2,
                          entry: primaryEntry,
                          onConfirm: (results) => handleAddAdjacent(primaryEntry, 'right', results),
                          onFocusPrimary: () => requestFocusPage(primaryEntry.id),
                        },
                      ]}
                    />
                  )}
                </div>
              );
            })}

        {viewport.width > 0 &&
          unifiedHeaders.map((header, i) => {
            const left = camera.x + header.originX * camera.zoom;
            const labelTop = camera.y + (header.originY + header.primaryLabelY) * camera.zoom;
            const headerTop = camera.y + (header.originY + header.headerY) * camera.zoom;
            return (
              <div key={i} className="pointer-events-none absolute inset-0">
                <div className="absolute text-base text-white/45" style={{ left, top: labelTop }}>
                  {t('PRIMARY SIZE')}
                </div>
                <UnifiedAllSizesHeader
                  left={left}
                  top={headerTop}
                  totalWidth={header.totalWidth * camera.zoom}
                  icons={header.icons.map(({ x, entry }) => ({
                    x: x * camera.zoom,
                    entry,
                    onConfirm: (results) => handleAddAdjacent(entry, 'right', results),
                    onFocusPrimary: () => requestFocusPage(entry.id),
                  }))}
                />
              </div>
            );
          })}

        {viewport.width > 0 &&
          entries.map((entry) => {
            // "Hide banner" removes the scene from the canvas entirely, rather than just dimming it
            // — its own data (and its slot in any sibling pack) is untouched, only rendering skips it.
            if (entry.layout.hidden) return null;
            const isDraggingThis = reorderDrag?.siblingId === entry.id;
            // A cluster-root drag only ever floats the one card being dragged — its own "PRIMARY
            // SIZE" header, divider, and any sibling pack all stay put at their settled cascade slot
            // (see Pass 2 above) until an actual swap re-sorts them, so only this exact entry's
            // render position is overridden here, never a sibling riding along underneath it.
            const isDraggingCluster = clusterReorderDrag?.entryId === entry.id;
            const posX = isDraggingThis ? reorderDrag.x : isDraggingCluster ? clusterReorderDrag!.x : entry.pos.x;
            const posY = isDraggingThis ? reorderDrag.y : isDraggingCluster ? clusterReorderDrag!.y : entry.pos.y;
            const groupId = pageGroupIdByPage[entry.id];
            const canReorder = isReorderableSibling(entry.id);
            // Only the *other* siblings in the group currently being reordered ever transition
            // their position (to visibly slide into their new slot) — every other card, including
            // these same two once the drag ends, renders with no position transition at all, so
            // panning/zooming the camera moves everything in perfect lockstep, instantly.
            const isReflowingPeer = reorderDrag !== null && reorderDrag.groupId === groupId && !isDraggingThis;
            // Same idea one level up: every OTHER cluster root (and, if the dragged one is a group's
            // own primary, its own siblings too, once a swap actually re-sorts them) slides smoothly
            // into its recomputed slot instead of snapping.
            const isReflowingClusterPeer = clusterReorderDrag !== null && !isDraggingCluster;
            const canClusterReorder = !siblingIds.has(entry.id) && clusterRoots.length > 1;
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
                entered={entry.id === viewAllActivePageId}
                isLoading={Boolean(loadingPageIds[entry.id])}
                isPrimary={isPrimaryPage({ pageGroupIdByPage, pageGroups }, entry.id)}
                showCascadeToolbar={pageGroups[pageGroupIdByPage[entry.id]]?.memberIds[0] === entry.id && Boolean(pendingCascadeSetIds[entry.id])}
                dimmed={
                  !isMultiSceneElementSelection &&
                  selectedSceneIds.length > 0 &&
                  !selectedSceneIds.includes(entry.id) &&
                  !(groupId && selectedGroupIds.has(groupId))
                }
                dragging={isDraggingThis || isDraggingCluster}
                reflowing={isReflowingPeer || isReflowingClusterPeer}
                onActivate={() => setViewAllActivePage(entry.id)}
                onStartDrag={(e) =>
                  canReorder && groupId
                    ? startSiblingReorderDrag(e, groupId, entry)
                    : canClusterReorder && effectiveActiveId
                      ? startClusterRootDrag(e, effectiveActiveId, entry)
                      : startPageDrag(e, entry)
                }
                onRename={(name) => renamePage(entry.id, name)}
                renaming={renamingEntryId === entry.id}
                onRenamingChange={(v) => setRenamingEntryId(v ? entry.id : null)}
                showRightAdd={!isMultiMemberGroupPage(entry.id) && !hasBlockerToRight(entry, entries)}
                showBottomAdd={!isMultiMemberGroupPage(entry.id) && !hasBlockerBelow(entry, entries)}
                onAddAdjacent={(edge, results) => handleAddAdjacent(entry, edge, results)}
                onSceneContextMenu={(e) => setSceneContextMenu({ x: e.clientX, y: e.clientY, entryId: entry.id })}
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
      {showRulers && <RulerOverlay camera={camera} viewport={viewport} />}

      <div className="pointer-events-none absolute right-6 bottom-6 z-10">
        <CanvasZoomBar
          zoomPct={camera.zoom * 100}
          onSetZoom={setZoomPct}
          onFitToScreen={handleFitToScreen}
          showRulers={showRulers}
          onToggleRulers={toggleRulers}
        />
      </div>

      {sceneContextMenu &&
        (() => {
          const entry = entries.find((e) => e.id === sceneContextMenu.entryId);
          if (!entry) return null;
          return (
            <SceneContextMenu
              x={sceneContextMenu.x}
              y={sceneContextMenu.y}
              hidden={Boolean(entry.layout.hidden)}
              onClose={() => setSceneContextMenu(null)}
              onEdit={() => setViewAllActivePage(entry.id)}
              onToggleHidden={() => updateLayoutStyle(entry.layout.id, { hidden: !entry.layout.hidden })}
              onRename={() => setRenamingEntryId(entry.id)}
              onDuplicate={() => handleDuplicateScene(entry)}
              onDelete={() => handleDeleteScene(entry)}
            />
          );
        })()}
    </>
  );
}
