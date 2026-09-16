import type { StateCreator } from 'zustand';
import type { BannerSet, Layout, LayoutElement, Product, ShapeKind } from '@/types';
import type { SnapGuide } from '@/lib/snap-guides';

/** Top-level app step. Overlays (size-select, add-sizes, bulk-products, export) layer on top of a step. */
export type AppStep = 'playgrounds' | 'start' | 'editor' | 'allLayouts';

/** Bottom-toolbar tool. 'text'/'shape' arm a click/drag placement gesture rather than adding instantly. */
export type Tool = 'select' | 'move' | 'text' | 'shape';

/** 'full' cascades layers, content, and style; 'styleOnly' re-styles existing matching layers only. */
export type CascadeMode = 'full' | 'styleOnly';

/** UI display language — see src/lib/i18n.ts for the translation lookup this drives. */
export type Language = 'en' | 'ja';

/** A single selected element, qualified by which layout (scene) it lives in — selection can span scenes. */
export type SelectedElementRef = { layoutId: string; elementId: string };

export type UiSlice = {
  step: AppStep;
  sizeSelectOpen: boolean;
  addSizesOpen: boolean;
  bulkProductsOpen: boolean;
  generating: boolean;
  /** True while a triggered export is being rasterized/downloaded — shows the header's spinner. */
  downloading: boolean;
  /** Every currently-selected element, each qualified by its own layout — may span multiple scenes. */
  selectedElements: SelectedElementRef[];
  /**
   * The subset of `selectedElements` that were auto-added by cross-scene match-select rather than
   * clicked directly — still fully selected for bulk-edit purposes, but the canvas only draws a
   * bounding-box outline on the elements NOT in this set, so a multi-size selection shows exactly
   * one visible outline (on whichever element the user actually clicked).
   */
  autoMatchedElements: SelectedElementRef[];
  /** Alignment guide lines to draw right now, each tagged with which scene it belongs to — live only
   * for the duration of an active layer drag (see useElementDrag's snapping), empty otherwise. */
  activeGuides: (SnapGuide & { layoutId: string })[];
  activeLayoutId: string | null;
  /** Every currently-selected scene (BannerSet id) — a plain click replaces it, shift-click toggles it in/out. */
  selectedSceneIds: string[];
  /** The text element currently in contentEditable edit mode (typing/caret), if any. */
  editingTextElementId: string | null;
  activeTool: Tool;
  /** Which shape kind the armed 'shape' tool draws — set via the bottom toolbar's shape picker. */
  shapeToolKind: ShapeKind;
  /** Which page (BannerSet id) is "live"/editable within the view-all canvas; null = none entered. */
  viewAllActivePageId: string | null;
  /** Which group container is selected in the view-all canvas (click its background, not a page); null = none. */
  selectedGroupId: string | null;
  /** Page (BannerSet) ids currently showing the creation/cascade loading state. */
  loadingPageIds: Record<string, true>;
  /** Primary-page (BannerSet) ids with edits not yet cascaded to their group's other sizes. */
  pendingCascadeSetIds: Record<string, true>;
  /** Set to request the view-all canvas pan/zoom to frame this page; consumed and cleared by the canvas. */
  focusPageId: string | null;
  /** Set to request the view-all canvas pan (current zoom kept as-is) to bring this page into view —
   * unlike `focusPageId`, never changes zoom; used after duplicating a scene, where the new copy
   * should just scroll into view rather than the whole canvas zooming out to fit everything. */
  revealPageId: string | null;
  /** The layout (if any) currently in "draw the scene focus rectangle" mode — set by the "Pick" button in the add-sizes panel. */
  pickingFocusForLayoutId: string | null;
  /**
   * Whether the current picking session has confirmed a rect at least once — separates the
   * "just entered, show the instructional pop-up" state from "confirmed, just show the settled
   * rect" preview (which otherwise look identical: both have no in-progress drag rect). Reset to
   * false by startPickingFocus, so re-entering via "Change" always shows the pop-up again even if
   * a focusRect already exists from a previous session.
   */
  focusPickConfirmed: boolean;
  /**
   * Which top-level page or group is the currently visible "canvas" — the view-all canvas renders
   * only this one's content, so switching it hides everything else (a different banner set never
   * appears alongside the one you're looking at). A standalone page's own id is its own canvas.
   */
  activeCanvasRootId: string | null;
  /** Object URLs uploaded via the image picker's Upload tab this session, newest first. */
  uploadedAssetUrls: string[];
  /** When true (the default), a plain click selecting a layer also selects its matching layer in every other size in the group — see src/lib/match-select.ts. */
  matchSelectEnabled: boolean;
  /** Current UI display language — defaults to English. */
  language: Language;
  goTo: (step: AppStep) => void;
  openSizeSelect: () => void;
  closeSizeSelect: () => void;
  openAddSizes: () => void;
  closeAddSizes: () => void;
  openBulkProducts: () => void;
  closeBulkProducts: () => void;
  setGenerating: (value: boolean) => void;
  setDownloading: (value: boolean) => void;
  /** Selects `ref` — replaces the selection, unless `additive` (shift-click), which toggles it in/out of the current set. Pass `null` to clear. A grouped element always selects/deselects its whole group as one unit. */
  selectElement: (ref: SelectedElementRef | null, additive?: boolean) => void;
  /** Replaces the selection outright with exactly these refs — no group/match-select expansion, no toggling. For programmatic selection (e.g. selecting the result of a bulk duplicate). */
  setSelectedElements: (refs: SelectedElementRef[]) => void;
  /** Replaces the current set of on-canvas alignment guide lines — pass `[]` to clear them (drag end). */
  setActiveGuides: (guides: (SnapGuide & { layoutId: string })[]) => void;
  setActiveLayout: (id: string | null) => void;
  /** Selects `setId` — replaces the selection, unless `additive` (shift-click), which toggles it in/out. Pass `null` to clear. */
  selectScene: (setId: string | null, additive?: boolean) => void;
  /** Replaces the whole selection at once — used by marquee (shift-drag) selection. */
  selectScenes: (setIds: string[]) => void;
  /** Enters (id) or exits (null) contentEditable edit mode for a text element. */
  setEditingTextElement: (id: string | null) => void;
  setActiveTool: (tool: Tool) => void;
  setShapeToolKind: (kind: ShapeKind) => void;
  setViewAllActivePage: (setId: string | null) => void;
  selectGroup: (groupId: string | null) => void;
  /** Marks a page as loading; auto-clears itself after `durationMs` (default the creation-loading duration). */
  startPageLoading: (pageId: string, durationMs?: number) => void;
  /** Requests that the view-all canvas pan/zoom to frame this page. */
  requestFocusPage: (pageId: string) => void;
  clearFocusPage: () => void;
  /** Requests that the view-all canvas pan (keeping its current zoom) to bring this page into view. */
  requestRevealPage: (pageId: string) => void;
  clearRevealPage: () => void;
  /** Switches which top-level page/group's canvas is visible in the view-all canvas. */
  setActiveCanvas: (rootId: string | null) => void;
  /** Enters/exits "draw the scene focus rectangle" mode for a layout. */
  startPickingFocus: (layoutId: string) => void;
  stopPickingFocus: () => void;
  /** Marks the current picking session's rect as confirmed — see focusPickConfirmed. */
  confirmFocusPick: () => void;
  addUploadedAsset: (url: string) => void;
  /** Turns match-select back on — also immediately expands the current selection to every match in the group, so toggling it doesn't wait for the next click. */
  enableMatchSelect: () => void;
  /** Turns match-select off and drops every cross-scene match from the current selection, keeping only whatever's selected in the current scene. */
  disableMatchSelect: () => void;
  setLanguage: (language: Language) => void;
};

export type PagePosition = { x: number; y: number };

/** A visual grouping of pages spun off from one another via the view-all "+" hotspots. */
export type PageGroup = { id: string; name: string; platformId?: string; memberIds: string[] };

export type SetSlice = {
  setsById: Record<string, BannerSet>;
  pageOrder: string[];
  pagePositions: Record<string, PagePosition>;
  pageGroups: Record<string, PageGroup>;
  pageGroupIdByPage: Record<string, string>;
  /** Explicit view-all "canvas root" overrides, set only via `attachStandalonePage` — see
   * `canvasRootOf` in `src/lib/canvas-layout.ts` for how this combines with pack membership to
   * resolve any given page's actual canvas root. */
  canvasRootByPage: Record<string, string>;
  /** Left-to-right order of the "cluster roots" (independent primaries, or a real group's own
   * primary) sharing a given canvas root id — the explicit source of truth the drag-to-reorder
   * gesture between main-size columns updates, mirroring `PageGroup.memberIds` for pack siblings.
   * A canvas root with no entry here (a lone page, never bundled) falls back to position order. */
  canvasRootOrder: Record<string, string[]>;
  currentSet: BannerSet | null;
  loadSet: (set: BannerSet, position?: PagePosition) => void;
  selectPage: (setId: string) => void;
  renamePage: (setId: string, name: string) => void;
  clearSet: () => void;
  /** Groups `sourcePageId` with `newPageIds` into a shared container, extending an existing group if the source already has one. */
  groupPagesWith: (sourcePageId: string, newPageIds: string[], name: string, platformId?: string) => void;
  /** Promotes `setId` to primary within its group (first in `memberIds`) — a no-op if it isn't grouped. */
  setGroupPrimary: (setId: string) => void;
  /** Replaces every non-primary member's order within its group — drives the "All sizes" pack order (see the drag-to-reorder gesture in MultiPageCanvas). A no-op if the group doesn't exist. */
  reorderGroupSiblings: (groupId: string, siblingIds: string[]) => void;
  /** Shifts every listed page's canvas position by (dx, dy) — used to drag a single scene or a whole group container. */
  movePagesBy: (pageIds: string[], dx: number, dy: number) => void;
  /** Removes a page/scene entirely: its set, layout, canvas position, and group membership. */
  deletePage: (setId: string) => void;
  /** Makes `pageId` resolve to `rootId` as its view-all "canvas root" (see `canvasRootOf`) —
   * visible together with everyone else on that same root, entirely independent of `PageGroup`
   * pack membership, so `pageId` can freely gain, lose, or change its own real group later without
   * ever leaving this shared canvas view. Used to bundle a freshly created batch of independent
   * primary sizes (e.g. one square, one horizontal, one vertical) onto one shared canvas view. */
  attachStandalonePage: (pageId: string, rootId: string) => void;
  /** Replaces the left-to-right order of every cluster root sharing `rootId`'s canvas view — drives
   * the drag-to-reorder gesture between main-size columns, the same way `reorderGroupSiblings`
   * drives it within one group's own pack. A no-op if `rootId` has no explicit order yet. */
  reorderCanvasRoot: (rootId: string, order: string[]) => void;
};

export type LayoutsSlice = {
  layoutsById: Record<string, Layout>;
  upsertLayout: (layout: Layout) => void;
  removeLayout: (id: string) => void;
  getSourceLayout: () => Layout | null;
  addElement: (layoutId: string, element: LayoutElement) => void;
  updateElement: (layoutId: string, elementId: string, patch: Partial<LayoutElement>) => void;
  /** Removes a decorative (text/shape) element outright; the required image slot is cleared instead of removed. */
  removeElement: (layoutId: string, elementId: string) => void;
  /** Inserts a copy of the element right after the original, offset slightly, and always decorative (slot: null). Returns the new element's id. */
  duplicateElement: (layoutId: string, elementId: string) => string;
  /** Moves the element to the start/end of the layout's elements array, changing its paint order among decorative elements. */
  reorderElement: (layoutId: string, elementId: string, direction: 'front' | 'back') => void;
  /** Tags every one of `elementIds` (within `layoutId`) with a freshly-generated shared `groupId`, replacing whatever group (if any) they belonged to before. */
  groupElements: (layoutId: string, elementIds: string[]) => void;
  /** Clears `groupId` from every element in `layoutId` that currently shares it. */
  ungroupElements: (layoutId: string, groupId: string) => void;
  /** Patches the frame's own background/border, independent of any element on it. */
  updateLayoutStyle: (
    layoutId: string,
    patch: Partial<Pick<Layout, 'backgroundColor' | 'borderColor' | 'borderWidth' | 'borderStyle' | 'radius' | 'hidden' | 'focusRect'>>,
  ) => void;
  /**
   * Cascades the primary page's current state to every sibling in its group. 'full' re-derives
   * each sibling's elements wholesale (layers, content, positions, and style); 'styleOnly' leaves
   * each sibling's own layers/content/positions untouched and only re-styles elements that match
   * the primary by id.
   */
  applyCascade: (primarySetId: string, mode: CascadeMode) => void;
};

export type ProductsSlice = {
  activeProductIds: string[];
  setActiveProducts: (ids: string[]) => void;
  getActiveProducts: () => Product[];
};

export type AppState = UiSlice & SetSlice & LayoutsSlice & ProductsSlice;

export type Slice<T> = StateCreator<AppState, [], [], T>;
