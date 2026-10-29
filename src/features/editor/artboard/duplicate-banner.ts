import { useAppStore } from '@/store/useAppStore';
import { nextId } from '@/lib/create-layout';
import { canvasRootOf, PAGE_GAP } from '@/lib/canvas-layout';
import type { BannerSet, Layout } from '@/types';

/**
 * A plain copy of banner `setId` (fresh set/product ids) that joins its group as a new size right
 * after it — or, if it isn't grouped yet, becomes the primary's first size in a new group with it —
 * never a standalone page off to the side. Shared by the canvas's right-click "Duplicate banner"
 * and the Replace table's row menu. Returns the copy's id.
 *
 * `keepElementIds` keeps the layers' ids, as sizes adapted from a primary do — the Replace table
 * finds each piece of content by its id across a group's banners, so a copy with fresh ids would
 * show up there with nothing in any column.
 */
export function duplicateBanner(setId: string, { keepElementIds = false }: { keepElementIds?: boolean } = {}): string | null {
  const state = useAppStore.getState();
  const set = state.setsById[setId];
  const source = set ? state.layoutsById[set.sourceLayoutId] : undefined;
  if (!set || !source) return null;
  const pos = state.pagePositions[setId] ?? { x: 0, y: 0 };
  const newLayoutId = nextId('layout');
  const newSetId = nextId('set');
  const newProductId = nextId('product');
  const newLayout: Layout = {
    ...source,
    id: newLayoutId,
    setId: newSetId,
    productId: newProductId,
    elements: keepElementIds ? source.elements.map((el) => ({ ...el })) : source.elements.map((el) => ({ ...el, id: nextId('el') })),
    isSource: true,
    detached: false,
    adaptationNotes: [],
  };
  const newSet: BannerSet = { id: newSetId, name: set.name, sourceLayoutId: newLayoutId, layoutIds: [newLayoutId], productIds: [] };
  const rootId = state.pageGroupIdByPage[setId] ?? setId;
  const group = state.pageGroups[rootId];
  const sourcePageId = group ? group.memberIds[0] : rootId;
  state.upsertLayout(newLayout);
  state.loadSet(newSet, { x: pos.x, y: pos.y + source.size.height + PAGE_GAP });
  state.groupPagesWith(sourcePageId, [newSetId], state.setsById[sourcePageId]?.name ?? source.size.label);
  // groupPagesWith always appends the new sibling at the very end of the pack order — slot it in
  // right after the specific size that was actually duplicated instead, so it visually lands
  // directly below it (the pack stacks siblings vertically in member order), regardless of where
  // that happened to sit in a larger group.
  const after = useAppStore.getState();
  const groupIdAfter = after.pageGroupIdByPage[sourcePageId];
  const groupAfter = groupIdAfter ? after.pageGroups[groupIdAfter] : undefined;
  if (groupIdAfter && groupAfter) {
    const siblingIds = groupAfter.memberIds.slice(1).filter((id) => id !== newSetId);
    const insertAfterIndex = setId === groupAfter.memberIds[0] ? -1 : siblingIds.indexOf(setId);
    const nextSiblingIds =
      insertAfterIndex === -1 ? [newSetId, ...siblingIds] : [...siblingIds.slice(0, insertAfterIndex + 1), newSetId, ...siblingIds.slice(insertAfterIndex + 1)];
    after.reorderGroupSiblings(groupIdAfter, nextSiblingIds);
  }
  after.setActiveCanvas(canvasRootOf(useAppStore.getState(), sourcePageId));
  return newSetId;
}
