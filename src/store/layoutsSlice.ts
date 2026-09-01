import type { AppState, Slice, LayoutsSlice } from './types';
import type { LayoutElement } from '@/types';
import { adaptElementsToSize } from '@/lib/adapt-elements';
import { nextId } from '@/lib/create-layout';

const CASCADE_LOADING_DURATION_MS = 3000;

/**
 * If `layoutId` belongs to the *primary* page of a group that actually has siblings, returns
 * that page's (BannerSet) id — the one "Apply changes to all sizes" would act on. Edits to a
 * sibling page (or a page with no group) never produce a pending cascade.
 */
function primarySetIdWithSiblings(state: AppState, layoutId: string): string | null {
  const ownerSetId = Object.values(state.setsById).find((s) => s.sourceLayoutId === layoutId)?.id;
  if (!ownerSetId) return null;
  const groupId = state.pageGroupIdByPage[ownerSetId];
  const group = groupId ? state.pageGroups[groupId] : undefined;
  if (!group || group.memberIds.length <= 1 || group.memberIds[0] !== ownerSetId) return null;
  return ownerSetId;
}

/** Leaves the sibling's own layers/content/positions alone; only re-styles elements that also exist on the primary (matched by id). */
function restyleMatching(primaryElements: LayoutElement[], memberElements: LayoutElement[]): LayoutElement[] {
  return memberElements.map((el) => {
    const primaryEl = primaryElements.find((p) => p.id === el.id);
    return primaryEl ? { ...el, style: { ...el.style, ...primaryEl.style } } : el;
  });
}

export const createLayoutsSlice: Slice<LayoutsSlice> = (set, get) => ({
  layoutsById: {},
  upsertLayout: (layout) => set((state) => ({ layoutsById: { ...state.layoutsById, [layout.id]: layout } })),
  removeLayout: (id) =>
    set((state) => {
      const next = { ...state.layoutsById };
      delete next[id];
      return { layoutsById: next };
    }),
  getSourceLayout: () => {
    const state = get();
    const id = state.currentSet?.sourceLayoutId;
    return id ? (state.layoutsById[id] ?? null) : null;
  },
  addElement: (layoutId, element) =>
    set((state) => {
      const layout = state.layoutsById[layoutId];
      if (!layout) return state;
      const nextLayoutsById = { ...state.layoutsById, [layoutId]: { ...layout, elements: [...layout.elements, element] } };
      const pendingSetId = primarySetIdWithSiblings(state, layoutId);
      return {
        layoutsById: nextLayoutsById,
        pendingCascadeSetIds: pendingSetId ? { ...state.pendingCascadeSetIds, [pendingSetId]: true } : state.pendingCascadeSetIds,
      };
    }),
  updateElement: (layoutId, elementId, patch) =>
    set((state) => {
      const layout = state.layoutsById[layoutId];
      if (!layout) return state;
      const nextLayoutsById = {
        ...state.layoutsById,
        [layoutId]: { ...layout, elements: layout.elements.map((el) => (el.id === elementId ? { ...el, ...patch } : el)) },
      };
      const pendingSetId = primarySetIdWithSiblings(state, layoutId);
      return {
        layoutsById: nextLayoutsById,
        pendingCascadeSetIds: pendingSetId ? { ...state.pendingCascadeSetIds, [pendingSetId]: true } : state.pendingCascadeSetIds,
      };
    }),
  removeElement: (layoutId, elementId) =>
    set((state) => {
      const layout = state.layoutsById[layoutId];
      if (!layout) return state;
      const el = layout.elements.find((e) => e.id === elementId);
      if (!el) return state;
      // The image is a required slot, not a decorative add-on — clear its content instead of
      // removing it outright, so the frame cleanly reverts to the "Choose or drag" empty state.
      const nextElements =
        el.kind === 'image'
          ? layout.elements.map((e) => (e.id === elementId ? { ...e, imageUrl: undefined, focalPoint: undefined } : e))
          : layout.elements.filter((e) => e.id !== elementId);
      const pendingSetId = primarySetIdWithSiblings(state, layoutId);
      return {
        layoutsById: { ...state.layoutsById, [layoutId]: { ...layout, elements: nextElements } },
        pendingCascadeSetIds: pendingSetId ? { ...state.pendingCascadeSetIds, [pendingSetId]: true } : state.pendingCascadeSetIds,
      };
    }),
  duplicateElement: (layoutId, elementId) =>
    set((state) => {
      const layout = state.layoutsById[layoutId];
      if (!layout) return state;
      const idx = layout.elements.findIndex((el) => el.id === elementId);
      if (idx === -1) return state;
      const original = layout.elements[idx];
      // A slot (image/headline/price/...) is unique per layout — the copy is always a free-floating
      // decorative element, even when duplicating the required image slot.
      const copy: LayoutElement = {
        ...original,
        id: nextId('el'),
        slot: null,
        frame: { ...original.frame, x: original.frame.x + 16, y: original.frame.y + 16 },
      };
      const elements = [...layout.elements];
      elements.splice(idx + 1, 0, copy);
      const pendingSetId = primarySetIdWithSiblings(state, layoutId);
      return {
        layoutsById: { ...state.layoutsById, [layoutId]: { ...layout, elements } },
        pendingCascadeSetIds: pendingSetId ? { ...state.pendingCascadeSetIds, [pendingSetId]: true } : state.pendingCascadeSetIds,
      };
    }),
  reorderElement: (layoutId, elementId, direction) =>
    set((state) => {
      const layout = state.layoutsById[layoutId];
      if (!layout) return state;
      const idx = layout.elements.findIndex((el) => el.id === elementId);
      if (idx === -1) return state;
      const elements = [...layout.elements];
      const [el] = elements.splice(idx, 1);
      if (direction === 'front') elements.push(el);
      else elements.unshift(el);
      const pendingSetId = primarySetIdWithSiblings(state, layoutId);
      return {
        layoutsById: { ...state.layoutsById, [layoutId]: { ...layout, elements } },
        pendingCascadeSetIds: pendingSetId ? { ...state.pendingCascadeSetIds, [pendingSetId]: true } : state.pendingCascadeSetIds,
      };
    }),
  updateLayoutStyle: (layoutId, patch) =>
    set((state) => {
      const layout = state.layoutsById[layoutId];
      if (!layout) return state;
      const pendingSetId = primarySetIdWithSiblings(state, layoutId);
      return {
        layoutsById: { ...state.layoutsById, [layoutId]: { ...layout, ...patch } },
        pendingCascadeSetIds: pendingSetId ? { ...state.pendingCascadeSetIds, [pendingSetId]: true } : state.pendingCascadeSetIds,
      };
    }),
  // 'full' replays the primary page's *current* elements + frame style onto every sibling, each
  // scaled to its own size — a wholesale re-derive rather than a patch replay, since by the time
  // this runs the primary may have accumulated several add/update/delete edits since the last
  // apply. 'styleOnly' leaves each sibling's own layers/content/positions untouched and only
  // re-styles the elements that already match the primary by id.
  applyCascade: (primarySetId, mode) => {
    const state = get();
    const primarySet = state.setsById[primarySetId];
    const primaryLayout = primarySet ? state.layoutsById[primarySet.sourceLayoutId] : null;
    const groupId = state.pageGroupIdByPage[primarySetId];
    const group = groupId ? state.pageGroups[groupId] : undefined;
    if (!primaryLayout || !group) return;

    const siblingSetIds = group.memberIds.filter((id) => id !== primarySetId);

    set((s) => {
      const nextLayoutsById = { ...s.layoutsById };
      for (const memberSetId of siblingSetIds) {
        const memberSet = s.setsById[memberSetId];
        const memberLayout = memberSet ? s.layoutsById[memberSet.sourceLayoutId] : null;
        if (!memberSet || !memberLayout) continue;
        nextLayoutsById[memberLayout.id] = {
          ...memberLayout,
          elements:
            mode === 'full'
              ? adaptElementsToSize(primaryLayout.elements, primaryLayout.size, memberLayout.size)
              : restyleMatching(primaryLayout.elements, memberLayout.elements),
          backgroundColor: primaryLayout.backgroundColor,
          borderColor: primaryLayout.borderColor,
          borderWidth: primaryLayout.borderWidth,
        };
      }
      const nextPending = { ...s.pendingCascadeSetIds };
      delete nextPending[primarySetId];
      return { layoutsById: nextLayoutsById, pendingCascadeSetIds: nextPending };
    });

    for (const memberSetId of siblingSetIds) {
      get().startPageLoading(memberSetId, CASCADE_LOADING_DURATION_MS);
    }
  },
});
