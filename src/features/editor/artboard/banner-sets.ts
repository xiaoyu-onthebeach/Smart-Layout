import { useAppStore } from '@/store/useAppStore';
import { nextId } from '@/lib/create-layout';
import { canvasRootOf, PAGE_GAP } from '@/lib/canvas-layout';
import { nextAvailableName } from '@/lib/main-size-naming';
import type { BannerSet, Layout } from '@/types';

/**
 * Puts a new primary banner (its layout already upserted) on the canvas as its own column, to the
 * right of every column already in `anchorRoot`'s canvas view — the same view, not a group with
 * them. Shared by the Banners panel's "Add new main banner" and duplicating a whole banner set.
 *
 * The anchor page/root is "locked in" as an explicit canvasRootByPage entry (pointing at itself)
 * the first time a second scene joins it, rather than reusing its bare id as the shared root
 * going forward: the moment that specific page later grows its own "all sizes" pack, its own id
 * becomes a real PageGroup id, which is a wholly separate concern from *canvas-root* membership
 * (see canvasRootOf) — without this lock, the bundle would fall apart the instant that happens.
 */
export function addPrimaryToCanvas(bannerSet: BannerSet, anchorRoot?: string) {
  const state = useAppStore.getState();
  if (state.pageOrder.length === 0) {
    state.loadSet(bannerSet);
    state.setActiveCanvas(bannerSet.id);
    return;
  }

  const root = anchorRoot ?? state.activeCanvasRootId ?? canvasRootOf(state, state.pageOrder[0]);
  let cursorX = 0;
  let anchorY = 0;
  let foundAny = false;
  for (const id of state.pageOrder) {
    if (canvasRootOf(state, id) !== root) continue;
    // A pack sibling shares its primary's resolved canvas root too — skip it here, or whichever
    // sibling happens to sort last in pageOrder would hand its own (irrelevant, often far-away)
    // position to `anchorY`/`cursorX` instead of the actual cluster-root column it belongs to.
    const memberGroup = state.pageGroups[state.pageGroupIdByPage[id]];
    if (memberGroup && memberGroup.memberIds.length > 1 && memberGroup.memberIds[0] !== id) continue;
    const otherSet = state.setsById[id];
    const otherLayout = otherSet ? state.layoutsById[otherSet.sourceLayoutId] : null;
    const pos = state.pagePositions[id] ?? { x: 0, y: 0 };
    const right = pos.x + (otherLayout?.size.width ?? 0);
    if (!foundAny || right > cursorX) cursorX = right;
    anchorY = pos.y;
    foundAny = true;
  }
  if (foundAny) cursorX += PAGE_GAP;

  state.loadSet(bannerSet, { x: cursorX, y: anchorY });
  // The very first time a second column joins `root`, canvasRootOrder needs seeding with
  // whichever page is *actually* anchoring that canvas view — root itself when it's a bare page,
  // but a real PageGroup's own primary page id when `root` already resolved to that group's id
  // (canvasRootOf returns the groupId, not the primary's page id, the moment a pack forms) —
  // otherwise the primary's own id never lands in the order at all and it always sorts last
  // instead of staying the leftmost column.
  if (!state.canvasRootOrder[root]?.length) {
    const anchorPrimaryId = state.pageGroups[root]?.memberIds[0] ?? root;
    state.attachStandalonePage(anchorPrimaryId, root);
  }
  state.attachStandalonePage(bannerSet.id, root);
  state.setActiveCanvas(root);
}

/**
 * Copies a whole banner set — the primary `primaryId` and all its sizes — as a new set next to it
 * on the same canvas, under a disambiguated name ("Main Square 2"...). Layers keep their ids, as
 * sizes adapted from a primary do, so the copy lines up column for column in the Replace table.
 * Returns the new primary's id.
 */
export function duplicateBannerSet(primaryId: string): string | null {
  const state = useAppStore.getState();
  const primarySet = state.setsById[primaryId];
  if (!primarySet) return null;
  const group = state.pageGroups[state.pageGroupIdByPage[primaryId]];
  const memberIds = group && group.memberIds[0] === primaryId ? group.memberIds : [primaryId];
  const name = nextAvailableName(state, primarySet.name);

  const copies: BannerSet[] = [];
  for (const id of memberIds) {
    const set = state.setsById[id];
    const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
    if (!set || !layout) continue;
    const setId = nextId('set');
    const newLayout: Layout = { ...layout, id: nextId('layout'), setId, productId: nextId('product'), elements: layout.elements.map((el) => ({ ...el })) };
    state.upsertLayout(newLayout);
    copies.push({ id: setId, name: id === primaryId ? name : set.name, sourceLayoutId: newLayout.id, layoutIds: [newLayout.id], productIds: [] });
  }
  const [primaryCopy, ...sizeCopies] = copies;
  if (!primaryCopy) return null;

  addPrimaryToCanvas(primaryCopy, canvasRootOf(state, primaryId));
  if (sizeCopies.length > 0) {
    // Positions are only a starting point: once grouped, sizes are packed under their primary.
    const pos = useAppStore.getState().pagePositions[primaryCopy.id] ?? { x: 0, y: 0 };
    for (const copy of sizeCopies) useAppStore.getState().loadSet(copy, pos);
    useAppStore.getState().groupPagesWith(primaryCopy.id, sizeCopies.map((c) => c.id), name, group?.platformId);
  }
  return primaryCopy.id;
}

/** Deletes a whole banner set: every size, then the primary. */
export function deleteBannerSet(primaryId: string) {
  const state = useAppStore.getState();
  const group = state.pageGroups[state.pageGroupIdByPage[primaryId]];
  const memberIds = group && group.memberIds[0] === primaryId ? group.memberIds : [primaryId];
  for (const id of [...memberIds].reverse()) useAppStore.getState().deletePage(id);
}
