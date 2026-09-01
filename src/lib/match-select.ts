import type { AppState } from '@/store/types';
import type { Layout, LayoutElement } from '@/types';

type MatchState = Pick<AppState, 'setsById' | 'layoutsById' | 'pageGroupIdByPage' | 'pageGroups'>;
export type ElementRef = { layoutId: string; elementId: string };

/**
 * Finds the element in `targetLayout` that "corresponds" to `element` from `sourceLayout`. A
 * required slot is unique per layout, so it's matched by `slot` directly. A decorative element
 * (`slot: null`) is matched by id first — siblings generated via cascade (`adaptElementsToSize`)
 * preserve ids — then falls back to matching position among same-kind decoratives, since siblings
 * generated fresh (`buildOverlayElements`) get new ids each time but build their elements in the
 * same deterministic order (coupon, logo, headline, button, bottom_banner) every time.
 */
export function findMatchingElement(sourceLayout: Layout, element: LayoutElement, targetLayout: Layout): LayoutElement | null {
  if (element.slot !== null) {
    return targetLayout.elements.find((e) => e.slot === element.slot) ?? null;
  }
  const byId = targetLayout.elements.find((e) => e.id === element.id);
  if (byId) return byId;
  const sourceDecoratives = sourceLayout.elements.filter((e) => e.slot === null && e.kind === element.kind);
  const index = sourceDecoratives.indexOf(element);
  if (index === -1) return null;
  const targetDecoratives = targetLayout.elements.filter((e) => e.slot === null && e.kind === element.kind);
  return targetDecoratives[index] ?? null;
}

/** Every other layout sharing `layoutId`'s own group (siblings and/or the primary), excluding itself. */
function groupSiblingLayouts(state: MatchState, layoutId: string): Layout[] {
  const ownerSet = Object.values(state.setsById).find((s) => s.sourceLayoutId === layoutId);
  if (!ownerSet) return [];
  const groupId = state.pageGroupIdByPage[ownerSet.id];
  const group = groupId ? state.pageGroups[groupId] : null;
  if (!group) return [];
  return group.memberIds
    .filter((id) => id !== ownerSet.id)
    .map((id) => {
      const set = state.setsById[id];
      return set ? state.layoutsById[set.sourceLayoutId] : null;
    })
    .filter((l): l is Layout => Boolean(l));
}

/** Whether `layoutId`'s own scene is part of a group that has other sizes at all — the match-
 * select row has nothing to offer (and stays hidden) until there's at least one other size. */
export function layoutHasSiblingSizes(state: MatchState, layoutId: string): boolean {
  return groupSiblingLayouts(state, layoutId).length > 0;
}

/** For one selected element, the matching refs across every other size in its group. */
export function findMatchingRefsAcrossGroup(state: MatchState, ref: ElementRef): ElementRef[] {
  const sourceLayout = state.layoutsById[ref.layoutId];
  const element = sourceLayout?.elements.find((e) => e.id === ref.elementId);
  if (!sourceLayout || !element) return [];
  const refs: ElementRef[] = [];
  for (const layout of groupSiblingLayouts(state, ref.layoutId)) {
    const match = findMatchingElement(sourceLayout, element, layout);
    if (match) refs.push({ layoutId: layout.id, elementId: match.id });
  }
  return refs;
}
