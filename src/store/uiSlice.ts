import type { Slice, UiSlice } from './types';
import { findMatchingRefsAcrossGroup } from '@/lib/match-select';

const PAGE_LOADING_DURATION_MS = 5000;

export const createUiSlice: Slice<UiSlice> = (set) => ({
  step: 'editor',
  sizeSelectOpen: false,
  addSizesOpen: false,
  bulkProductsOpen: false,
  exportOpen: false,
  generating: false,
  selectedElements: [],
  autoMatchedElements: [],
  activeLayoutId: null,
  selectedSceneIds: [],
  editingTextElementId: null,
  activeTool: 'select',
  canvasMode: 'viewAll',
  viewAllActivePageId: null,
  selectedGroupId: null,
  loadingPageIds: {},
  pendingCascadeSetIds: {},
  focusPageId: null,
  uploadedAssetUrls: [],
  activeCanvasRootId: null,
  pickingFocusForLayoutId: null,
  focusPickConfirmed: false,
  matchSelectEnabled: true,
  language: 'en',

  goTo: (step) => set({ step }),
  openSizeSelect: () => set({ sizeSelectOpen: true, step: 'editor' }),
  closeSizeSelect: () => set({ sizeSelectOpen: false }),
  openAddSizes: () => set({ addSizesOpen: true }),
  closeAddSizes: () => set({ addSizesOpen: false }),
  openBulkProducts: () => set({ bulkProductsOpen: true }),
  closeBulkProducts: () => set({ bulkProductsOpen: false }),
  openExport: () => set({ exportOpen: true }),
  closeExport: () => set({ exportOpen: false }),
  setGenerating: (value) => set({ generating: value }),
  selectElement: (ref, additive) =>
    set((state) => {
      if (!ref) return { selectedElements: [], autoMatchedElements: [], editingTextElementId: null };
      if (!additive) {
        // A plain click replaces the selection with just `ref` — plus, while match-select is on,
        // whatever matches it in every other size of the group (see match-select.ts). Shift-click
        // (the `additive` branch below) never auto-expands: it's for building one ad-hoc
        // multi-selection, not for opting into cross-scene matching. `matches` is also tracked
        // separately so the canvas can outline only the literal clicked element, not every
        // auto-matched sibling (see autoMatchedElements).
        const matches = state.matchSelectEnabled ? findMatchingRefsAcrossGroup(state, ref) : [];
        return { selectedElements: [ref, ...matches], autoMatchedElements: matches, editingTextElementId: null };
      }
      const exists = state.selectedElements.some((r) => r.layoutId === ref.layoutId && r.elementId === ref.elementId);
      return {
        selectedElements: exists
          ? state.selectedElements.filter((r) => !(r.layoutId === ref.layoutId && r.elementId === ref.elementId))
          : [...state.selectedElements, ref],
        // A shift-clicked ref is always a literal click, never an auto-match — drop it from
        // autoMatchedElements too (a no-op unless it happens to already be there).
        autoMatchedElements: state.autoMatchedElements.filter((r) => !(r.layoutId === ref.layoutId && r.elementId === ref.elementId)),
        editingTextElementId: null,
      };
    }),
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
  setActiveTool: (tool) => set({ activeTool: tool }),
  setCanvasMode: (mode) => set({ canvasMode: mode }),
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
  setLanguage: (language) => set({ language }),
});
