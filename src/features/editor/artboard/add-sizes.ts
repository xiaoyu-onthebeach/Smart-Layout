import { useAppStore } from '@/store/useAppStore';
import { nextId, createAdaptedLayout } from '@/lib/create-layout';
import { canvasRootOf, isFirstPrimaryGroup, PAGE_GAP } from '@/lib/canvas-layout';
import { applyPrototypeSizeFill } from '@/lib/prototype-size-fill';
import { buildOverlayElements } from '@/lib/overlay-elements';
import type { BannerSet, Layout } from '@/types';
import type { QuickSizeResult } from './QuickSizeMenu';

/**
 * Adds new sizes of banner `sourceId` — each one adapted from its layout, placed next to it
 * (`edge`), shown loading while it "generates", and joined to its group (a new group with it if it
 * had none). Shared by the canvas's "add sizes" menus and Bulk edit's "Add size" row. Returns the
 * new banners' ids, in the order they joined the group.
 */
export function addSizesTo(sourceId: string, results: QuickSizeResult[], edge: 'right' | 'bottom' = 'right'): string[] {
  const state = useAppStore.getState();
  const set = state.setsById[sourceId];
  const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
  if (!set || !layout || results.length === 0) return [];
  const pos = state.pagePositions[sourceId] ?? { x: 0, y: 0 };
  const anchor = edge === 'right' ? { x: pos.x + layout.size.width + PAGE_GAP, y: pos.y } : { x: pos.x, y: pos.y + layout.size.height + PAGE_GAP };

  // Both of these are a demo-only convenience meant to show off the auto-fill concept once —
  // repeating it for every later primary a user adds via "+" would just be redundant noise on
  // top of a group they're deliberately building fresh. See isFirstPrimaryGroup's own comment.
  const showDemoFill = isFirstPrimaryGroup(state, sourceId);

  let cursorX = anchor.x;
  const newIds: string[] = [];
  const newHeightById: Record<string, number> = {};
  for (const result of results) {
    const setId = nextId('set');
    const productId = nextId('product');
    const adaptedLayout = createAdaptedLayout(layout, {
      setId,
      productId,
      width: result.width,
      height: result.height,
      label: result.label,
      presetId: result.presetId,
      ruleSetId: result.ruleSetId,
    });
    const filledLayout = showDemoFill ? applyPrototypeSizeFill(adaptedLayout) : adaptedLayout;
    // Mocks the finished composition (coupon/logo/headline/button/bottom_banner/product shot)
    // onto every freshly generated size, per public/samples/position-overlay-spec.md — percentage
    // positions keyed off the new size's own wide/square/tall aspect-ratio archetype.
    const newLayout: Layout = showDemoFill
      ? { ...filledLayout, elements: [...filledLayout.elements, ...buildOverlayElements(result.width, result.height)] }
      : filledLayout;
    const newSet: BannerSet = {
      id: setId,
      name: result.label,
      sourceLayoutId: newLayout.id,
      layoutIds: [newLayout.id],
      productIds: [],
    };
    state.upsertLayout(newLayout);
    state.loadSet(newSet, { x: cursorX, y: anchor.y });
    state.startPageLoading(setId);
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
  state.groupPagesWith(sourceId, newIds, set.name, platformId);
  // If the source was still ungrouped, it just moved off the shared default canvas onto its own
  // — follow it there so the set doesn't vanish right after you added sizes to it. A no-op when
  // this only extended a group the source (and the active canvas) already belonged to. Reading
  // the canvas root (not the raw group id) keeps this correct even when the source is bundled
  // alongside other independent primaries (see canvasRootOf) — otherwise this would jump to
  // showing *only* the source's own new group, hiding the rest of the bundle.
  state.setActiveCanvas(canvasRootOf(useAppStore.getState(), sourceId));
  return newIds;
}
