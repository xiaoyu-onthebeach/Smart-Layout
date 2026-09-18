import type { Slice, UiSlice } from './types';
import { findMatchingRefsAcrossGroup } from '@/lib/match-select';

const PAGE_LOADING_DURATION_MS = 5000;

export const createUiSlice: Slice<UiSlice> = (set) => ({
  step: 'playgrounds',
  sizeSelectOpen: false,
  addSizesOpen: false,
  bulkProductsOpen: false,
  generating: false,
  downloading: false,
  selectedElements: [],
  autoMatchedElements: [],
  activeGuides: [],
  activeLayoutId: null,
  selectedSceneIds: [],
  editingTextElementId: null,
  activeTool: 'select',
  shapeToolKind: 'rect',
  viewAllActivePageId: null,
  selectedGroupId: null,
  loadingPageIds: {},
  pendingCascadeSetIds: {},
  focusPageId: null,
  revealPageId: null,
  uploadedAssetUrls: [],
  activeCanvasRootId: null,
  pickingFocusForLayoutId: null,
  focusPickConfirmed: false,
  matchSelectEnabled: true,
  showRulers: false,
  canvasDotBackground: null,
  language: 'en',

  goTo: (step) => set({ step }),
  openSizeSelect: () => set({ sizeSelectOpen: true, step: 'editor' }),
  closeSizeSelect: () => set({ sizeSelectOpen: false }),
  openAddSizes: () => set({ addSizesOpen: true }),
  closeAddSizes: () => set({ addSizesOpen: false }),
  openBulkProducts: () => set({ bulkProductsOpen: true }),
  closeBulkProducts: () => set({ bulkProductsOpen: false }),
  setGenerating: (value) => set({ generating: value }),
  setDownloading: (value) => set({ downloading: value }),
  selectElement: (ref, additive) =>
    set((state) => {
      if (!ref) return { selectedElements: [], autoMatchedElements: [], editingTextElementId: null };
      const clicked = state.layoutsById[ref.layoutId]?.elements.find((el) => el.id === ref.elementId);
      // A locked layer can't be selected at all — from the layers panel or the canvas alike, since
      // both funnel every click through this one action.
      if (clicked?.locked) return {};
      // A grouped element always selects (or deselects) its whole group as one unit — clicking any
      // member is equivalent to clicking every member. Purely an in-scene concept, so this doesn't
      // combine with cross-scene match-select below (a grouped element skips match-expansion).
      const groupRefs = clicked?.groupId
        ? state.layoutsById[ref.layoutId]!.elements.filter((el) => el.groupId === clicked.groupId).map((el) => ({ layoutId: ref.layoutId, elementId: el.id }))
        : [ref];
      if (!additive) {
        // A plain click replaces the selection with just `ref` (or its whole group) — plus, while
        // match-select is on, whatever matches it in every other size of the group (see
        // match-select.ts). Shift-click (the `additive` branch below) never auto-expands: it's for
        // building one ad-hoc multi-selection, not for opting into cross-scene matching. `matches`
        // is also tracked separately so the canvas can outline only the literal clicked element,
        // not every auto-matched sibling (see autoMatchedElements).
        const matches = !clicked?.groupId && state.matchSelectEnabled ? findMatchingRefsAcrossGroup(state, ref) : [];
        return { selectedElements: [...groupRefs, ...matches], autoMatchedElements: matches, editingTextElementId: null };
      }
      const isRef = (r: { layoutId: string; elementId: string }, g: { layoutId: string; elementId: string }) => r.layoutId === g.layoutId && r.elementId === g.elementId;
      const alreadySelected = groupRefs.every((g) => state.selectedElements.some((r) => isRef(r, g)));
      return {
        selectedElements: alreadySelected
          ? state.selectedElements.filter((r) => !groupRefs.some((g) => isRef(r, g)))
          : [...state.selectedElements, ...groupRefs.filter((g) => !state.selectedElements.some((r) => isRef(r, g)))],
        // A shift-clicked ref is always a literal click, never an auto-match — drop it (and its
        // whole group) from autoMatchedElements too (a no-op unless it happens to already be there).
        autoMatchedElements: state.autoMatchedElements.filter((r) => !groupRefs.some((g) => isRef(r, g))),
        editingTextElementId: null,
      };
    }),
  setSelectedElements: (refs) => set({ selectedElements: refs, autoMatchedElements: [], editingTextElementId: null }),
  setActiveGuides: (guides) => set({ activeGuides: guides }),
  setActiveLayout: (id) =>
    set({ activeLayoutId: id, selectedSceneIds: [], selectedElements: [], autoMatchedElements: [], editingTextElementId: null }),
  selectScene: (setId, additive) =>
    set((state) => {
      if (!setId) return { selectedSceneIds: [] };
      if (!additive) return { selectedSceneIds: [setId] };
      const exists = state.selectedSceneIds.includes(setId);
      return { selectedSceneIds: exists ? state.selectedSceneIds.filter((id) => id !== setId) : [...state.selectedSceneIds, setId] };
    }),
  selectScenes: (setIds) => set({ selectedSceneIds: setIds }),
  setEditingTextElement: (id) => set({ editingTextElementId: id }),
  // Arming a placement tool (text/shape) starts a fresh element, not an edit of whatever was
  // already selected — clear that selection right on the toolbar click, rather than leaving the
  // old layer's selection box showing on canvas until the new element gets placed and takes over.
  setActiveTool: (tool) =>
    set(
      tool === 'text' || tool === 'shape'
        ? { activeTool: tool, selectedElements: [], autoMatchedElements: [], editingTextElementId: null }
        : { activeTool: tool },
    ),
  setShapeToolKind: (kind) => set({ shapeToolKind: kind }),
  // Entering edit mode on a view-all page card should immediately show it as selected (the white
  // outline) — otherwise it silently takes a second click before any selection feedback appears.
  setViewAllActivePage: (setId) =>
    set({
      viewAllActivePageId: setId,
      selectedSceneIds: setId !== null ? [setId] : [],
      selectedElements: [],
      autoMatchedElements: [],
      editingTextElementId: null,
      selectedGroupId: null,
    }),
  selectGroup: (groupId) => set({ selectedGroupId: groupId }),
  startPageLoading: (pageId, durationMs = PAGE_LOADING_DURATION_MS) => {
    set((state) => ({ loadingPageIds: { ...state.loadingPageIds, [pageId]: true } }));
    setTimeout(() => {
      set((state) => {
        const next = { ...state.loadingPageIds };
        delete next[pageId];
        return { loadingPageIds: next };
      });
    }, durationMs);
  },
  requestFocusPage: (pageId) => set({ focusPageId: pageId }),
  clearFocusPage: () => set({ focusPageId: null }),
  requestRevealPage: (pageId) => set({ revealPageId: pageId }),
  clearRevealPage: () => set({ revealPageId: null }),
  setActiveCanvas: (rootId) => set({ activeCanvasRootId: rootId }),
  startPickingFocus: (layoutId) => set({ pickingFocusForLayoutId: layoutId, focusPickConfirmed: false }),
  stopPickingFocus: () => set({ pickingFocusForLayoutId: null, focusPickConfirmed: false }),
  confirmFocusPick: () => set({ focusPickConfirmed: true }),
  addUploadedAsset: (url) => set((state) => ({ uploadedAssetUrls: [url, ...state.uploadedAssetUrls] })),
  enableMatchSelect: () =>
    set((state) => {
      // Re-expand whatever's currently selected in the current scene to its matches, the same way
      // a plain click would if this had already been on — so flipping the toggle takes effect
      // immediately instead of waiting for the next selection. The anchor scene is whichever
      // layout the first selected ref lives in — selectElement always puts the originally-clicked
      // ref first (see its `[ref, ...matches]` construction) — rather than the view-all canvas's
      // own "active page" state, which doesn't reliably track which scene a click landed in (a
      // scene can become interactive via selectedSceneIds without ever becoming viewAllActivePageId).
      const anchorLayoutId = state.selectedElements[0]?.layoutId ?? null;
      const anchorRefs = anchorLayoutId ? state.selectedElements.filter((r) => r.layoutId === anchorLayoutId) : state.selectedElements;
      const matches = anchorRefs.flatMap((ref) => findMatchingRefsAcrossGroup(state, ref));
      return { matchSelectEnabled: true, selectedElements: [...anchorRefs, ...matches], autoMatchedElements: matches };
    }),
  disableMatchSelect: () =>
    set((state) => {
      // Drops every cross-scene match, deselecting them on the canvas, and keeps only the anchor
      // scene's own element(s) selected — so the panel immediately reverts to that single layer's
      // own name (Image/Shape/Text) instead of the "N layers" plural. See enableMatchSelect for
      // why the anchor is derived from the selection itself rather than view-all's active-page state.
      const anchorLayoutId = state.selectedElements[0]?.layoutId ?? null;
      return {
        matchSelectEnabled: false,
        selectedElements: anchorLayoutId ? state.selectedElements.filter((r) => r.layoutId === anchorLayoutId) : [],
        autoMatchedElements: [],
      };
    }),
  toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
  setCanvasDotBackground: (bg) => set({ canvasDotBackground: bg }),
  setLanguage: (language) => set({ language }),
});
