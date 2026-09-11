import type { PagePosition, Slice, SetSlice } from './types';
import { nextId } from '@/lib/create-layout';
import { PAGE_GAP, nextStackY } from '@/lib/canvas-layout';

export const createSetSlice: Slice<SetSlice> = (set, get) => ({
  setsById: {},
  pageOrder: [],
  pagePositions: {},
  pageGroups: {},
  pageGroupIdByPage: {},
  canvasRootByPage: {},
  canvasRootOrder: {},
  currentSet: null,
  loadSet: (bannerSet, position) =>
    set((state) => {
      const isNew = !state.pageOrder.includes(bannerSet.id);
      let pos: PagePosition | undefined = position;

      if (!pos) {
        if (isNew) {
          // Independent new page (not adjacency-placed) — stack below everything so far. A page
          // that's part of a group sits inside a visually padded container box, so its *effective*
          // bottom edge (for gap purposes) is further down than its raw frame — otherwise the gap
          // above a group would look smaller than the gap between two ordinary sibling pages.
          // (See nextStackY's ×4 note on GROUP_PAD_BOTTOM for why that padding is approximate.)
          pos = { x: 0, y: nextStackY({ ...state, layoutsById: get().layoutsById }, PAGE_GAP) };
        } else {
          pos = state.pagePositions[bannerSet.id] ?? { x: 0, y: 0 };
        }
      }

      return {
        setsById: { ...state.setsById, [bannerSet.id]: bannerSet },
        pageOrder: isNew ? [...state.pageOrder, bannerSet.id] : state.pageOrder,
        pagePositions: { ...state.pagePositions, [bannerSet.id]: pos! },
        currentSet: bannerSet,
      };
    }),
  selectPage: (setId) => {
    const bannerSet = get().setsById[setId];
    if (!bannerSet) return;
    set({ currentSet: bannerSet });
    get().setActiveLayout(bannerSet.sourceLayoutId);
    get().goTo('editor');
    get().requestFocusPage(setId);
  },
  renamePage: (setId, name) =>
    set((state) => {
      const bannerSet = state.setsById[setId];
      const trimmed = name.trim();
      if (!bannerSet || !trimmed) return state;
      const nextSet = { ...bannerSet, name: trimmed };
      return {
        setsById: { ...state.setsById, [setId]: nextSet },
        currentSet: state.currentSet?.id === setId ? nextSet : state.currentSet,
      };
    }),
  clearSet: () => set({ currentSet: null }),
  groupPagesWith: (sourcePageId, newPageIds, name, platformId) =>
    set((state) => {
      const existingGroupId = state.pageGroupIdByPage[sourcePageId];
      const existingGroup = existingGroupId ? state.pageGroups[existingGroupId] : undefined;

      if (existingGroup) {
        const nextByPage = { ...state.pageGroupIdByPage };
        for (const id of newPageIds) nextByPage[id] = existingGroupId;
        return {
          pageGroups: { ...state.pageGroups, [existingGroupId]: { ...existingGroup, memberIds: [...existingGroup.memberIds, ...newPageIds] } },
          pageGroupIdByPage: nextByPage,
        };
      }

      const groupId = nextId('group');
      const memberIds = [sourcePageId, ...newPageIds];
      const nextByPage = { ...state.pageGroupIdByPage };
      for (const id of memberIds) nextByPage[id] = groupId;
      return {
        pageGroups: { ...state.pageGroups, [groupId]: { id: groupId, name, platformId, memberIds } },
        pageGroupIdByPage: nextByPage,
      };
    }),
  setGroupPrimary: (setId) =>
    set((state) => {
      const groupId = state.pageGroupIdByPage[setId];
      if (!groupId) return state;
      const group = state.pageGroups[groupId];
      if (!group || group.memberIds[0] === setId) return state;
      const memberIds = [setId, ...group.memberIds.filter((id) => id !== setId)];
      return { pageGroups: { ...state.pageGroups, [groupId]: { ...group, memberIds } } };
    }),
  // Replaces the pack order of every sibling (everyone but the primary, which always stays
  // memberIds[0]) — drives the "All sizes" shelf-pack order directly, so a drag-to-reorder gesture
  // just needs to compute the new sibling order and hand it here; the layout itself always
  // re-derives from memberIds on the next render.
  reorderGroupSiblings: (groupId, siblingIds) =>
    set((state) => {
      const group = state.pageGroups[groupId];
      if (!group) return state;
      return { pageGroups: { ...state.pageGroups, [groupId]: { ...group, memberIds: [group.memberIds[0], ...siblingIds] } } };
    }),
  movePagesBy: (pageIds, dx, dy) =>
    set((state) => {
      const nextPositions = { ...state.pagePositions };
      for (const id of pageIds) {
        const p = nextPositions[id] ?? { x: 0, y: 0 };
        nextPositions[id] = { x: p.x + dx, y: p.y + dy };
      }
      return { pagePositions: nextPositions };
    }),
  deletePage: (setId) =>
    set((state) => {
      const bannerSet = state.setsById[setId];
      if (!bannerSet) return state;

      const nextSetsById = { ...state.setsById };
      delete nextSetsById[setId];
      const nextPositions = { ...state.pagePositions };
      delete nextPositions[setId];
      const nextLayoutsById = { ...state.layoutsById };
      delete nextLayoutsById[bannerSet.sourceLayoutId];
      const nextLoadingPageIds = { ...state.loadingPageIds };
      delete nextLoadingPageIds[setId];
      const nextPendingCascadeSetIds = { ...state.pendingCascadeSetIds };
      delete nextPendingCascadeSetIds[setId];

      const groupId = state.pageGroupIdByPage[setId];
      let nextGroups = state.pageGroups;
      let nextGroupByPage = state.pageGroupIdByPage;
      if (groupId && state.pageGroups[groupId]) {
        const group = state.pageGroups[groupId];
        const remainingMembers = group.memberIds.filter((id) => id !== setId);
        nextGroupByPage = { ...state.pageGroupIdByPage };
        delete nextGroupByPage[setId];
        nextGroups = { ...state.pageGroups };
        if (remainingMembers.length <= 1) {
          // A group of one is no longer a group — dissolve it.
          delete nextGroups[groupId];
          for (const id of remainingMembers) delete nextGroupByPage[id];
        } else {
          nextGroups[groupId] = { ...group, memberIds: remainingMembers };
        }
      }

      const nextCanvasRootByPage = { ...state.canvasRootByPage };
      delete nextCanvasRootByPage[setId];

      let nextCanvasRootOrder = state.canvasRootOrder;
      for (const [rootId, order] of Object.entries(state.canvasRootOrder)) {
        if (!order.includes(setId)) continue;
        if (nextCanvasRootOrder === state.canvasRootOrder) nextCanvasRootOrder = { ...state.canvasRootOrder };
        nextCanvasRootOrder[rootId] = order.filter((id) => id !== setId);
      }

      const nextPageOrder = state.pageOrder.filter((id) => id !== setId);

      return {
        setsById: nextSetsById,
        pageOrder: nextPageOrder,
        pagePositions: nextPositions,
        layoutsById: nextLayoutsById,
        loadingPageIds: nextLoadingPageIds,
        pendingCascadeSetIds: nextPendingCascadeSetIds,
        pageGroups: nextGroups,
        pageGroupIdByPage: nextGroupByPage,
        canvasRootByPage: nextCanvasRootByPage,
        canvasRootOrder: nextCanvasRootOrder,
        currentSet: state.currentSet?.id === setId ? null : state.currentSet,
        activeLayoutId: state.activeLayoutId === bannerSet.sourceLayoutId ? null : state.activeLayoutId,
        viewAllActivePageId: state.viewAllActivePageId === setId ? null : state.viewAllActivePageId,
        focusPageId: state.focusPageId === setId ? null : state.focusPageId,
      };
    }),
  attachStandalonePage: (pageId, rootId) =>
    set((state) => {
      const order = state.canvasRootOrder[rootId] ?? [];
      // The root itself counts as the first "cluster root" in its own order — include it the
      // first time anything gets attached to it, so the order array always lists every column,
      // not just the ones attached after the fact.
      const withRoot = order.includes(rootId) ? order : [rootId, ...order];
      const nextOrder = withRoot.includes(pageId) ? withRoot : [...withRoot, pageId];
      return {
        canvasRootByPage: { ...state.canvasRootByPage, [pageId]: rootId },
        canvasRootOrder: { ...state.canvasRootOrder, [rootId]: nextOrder },
      };
    }),
  reorderCanvasRoot: (rootId, order) => set((state) => ({ canvasRootOrder: { ...state.canvasRootOrder, [rootId]: order } })),
});
