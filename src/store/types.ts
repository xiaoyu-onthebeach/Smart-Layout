import type { StateCreator } from 'zustand';
import type { BannerSet, Layout, LayoutElement, Product } from '@/types';

/** Top-level app step. Overlays (size-select, add-sizes, bulk-products, export) layer on top of a step. */
export type AppStep = 'playgrounds' | 'start' | 'editor' | 'allLayouts';

/** Bottom-toolbar tool. 'text'/'shape' arm a click/drag placement gesture rather than adding instantly. */
export type Tool = 'select' | 'move' | 'brush' | 'eraser' | 'text' | 'shape';

/** Editing = single active page, full toolset. View-all = every page laid out on one canvas. */
export type CanvasMode = 'editing' | 'viewAll';

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
  exportOpen: boolean;
  generating: boolean;
  /** Every currently-selected element, each qualified by its own layout — may span multiple scenes. */
  selectedElements: SelectedElementRef[];
  /**
   * The subset of `selectedElements` that were auto-added by cross-scene match-select rather than
   * clicked directly — still fully selected for bulk-edit purposes, but the canvas only draws a
   * bounding-box outline on the elements NOT in this set, so a multi-size selection shows exactly
   * one visible outline (on whichever element the user actually clicked).
   */
  autoMatchedElements: SelectedElementRef[];
  activeLayoutId: string | null;
  /** Every currently-selected scene (BannerSet id) — a plain click replaces it, shift-click toggles it in/out. */
  selectedSceneIds: string[];
  /** The text element currently in contentEditable edit mode (typing/caret), if any. */
  editingTextElementId: string | null;
  activeTool: Tool;
  canvasMode: CanvasMode;
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
  openExport: () => void;
  closeExport: () => void;
  setGenerating: (value: boolean) => void;
  /** Selects `ref` — replaces the selection, unless `additive` (shift-click), which toggles it in/out of the current set. Pass `null` to clear. */
  selectElement: (ref: SelectedElementRef | null, additive?: boolean) => void;
  setActiveLayout: (id: string | null) => void;
  /** Selects `setId` — replaces the selection, unless `additive` (shift-click), which toggles it in/out. Pass `null` to clear. */
  selectScene: (setId: string | null, additive?: boolean) => void;
  /** Replaces the whole selection at once — used by marquee (shift-drag) selection. */
  selectScenes: (setIds: string[]) => void;
  /** Enters (id) or exits (null) contentEditable edit mode for a text element. */
  setEditingTextElement: (id: string | null) => void;
  setActiveTool: (tool: Tool) => void;
  setCanvasMode: (mode: CanvasMode) => void;
  setViewAllActivePage: (setId: string | null) => void;
  selectGroup: (groupId: string | null) => void;
  /** Marks a page as loading; auto-clears itself after `durationMs` (default the creation-loading duration). */
  startPageLoading: (pageId: string, durationMs?: number) => void;
  /** Requests that the view-all canvas pan/zoom to frame this page. */
  requestFocusPage: (pageId: string) => void;
  clearFocusPage: () => void;
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
  /** Inserts a copy of the element right after the original, offset slightly, and always decorative (slot: null). */
  duplicateElement: (layoutId: string, elementId: string) => void;
  /** Moves the element to the start/end of the layout's elements array, changing its paint order among decorative elements. */
  reorderElement: (layoutId: string, elementId: string, direction: 'front' | 'back') => void;
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
