import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/store/useAppStore';
import { initUndoHistory, undo } from '@/store/undoHistory';
import { AddBannersPanel } from '@/features/size-select/AddBannersPanel';
import { MultiPageCanvas } from '@/features/editor/artboard/MultiPageCanvas';
import { RULER_SIZE } from '@/features/editor/artboard/RulerOverlay';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { PlaygroundsPage } from './PlaygroundsPage';
import { DefaultModeToolbar } from './DefaultModeToolbar';
import { InspectorPanel } from './InspectorPanel';

/**
 * The canvas's dot-grid background, painted at the very top of the app (before the sidebar/canvas
 * in DOM order) so it sits behind them purely through normal paint order — no `position: fixed` +
 * negative z-index needed, which turned out to still lose to the app shell's own opaque background
 * (a fixed descendant escapes to the document's own root stacking context, where the shell's plain
 * `bg-background` fill, positioned but with no z-index of its own, still out-ranks it).
 * A separate leaf component so its frequent updates (every pan/zoom tick) don't re-render the rest
 * of Shell.
 */
function CanvasDotBackdrop() {
  const dot = useAppStore((s) => s.canvasDotBackground);
  if (!dot) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: dot.visible ? 'radial-gradient(rgba(255,255,255,0.08) 2px, transparent 2px)' : 'none',
        backgroundSize: dot.size,
        backgroundPosition: dot.position,
      }}
    />
  );
}

export function Shell() {
  const step = useAppStore((s) => s.step);
  const viewAllActivePageId = useAppStore((s) => s.viewAllActivePageId);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const deletePage = useAppStore((s) => s.deletePage);
  const removeElement = useAppStore((s) => s.removeElement);
  const duplicateElement = useAppStore((s) => s.duplicateElement);
  const reorderElement = useAppStore((s) => s.reorderElement);
  const selectElement = useAppStore((s) => s.selectElement);
  const setSelectedElements = useAppStore((s) => s.setSelectedElements);
  const groupElements = useAppStore((s) => s.groupElements);
  const editingVectorElementId = useAppStore((s) => s.editingVectorElementId);
  const setEditingVectorElement = useAppStore((s) => s.setEditingVectorElement);
  const showRulers = useAppStore((s) => s.showRulers);
  // The ruler toggle only ever lives inside the editor's own canvas toolbar — this guard just
  // keeps a stale flag from a previous editor session from shifting the sidebar on another step.
  const rulersActive = showRulers && step === 'editor';
  // The toolbar is a permanent fixture of the playground, not something that waits for a
  // selection — with nothing selected it still mounts, just narrowed to Select/Move only (see
  // DefaultModeToolbar's own `hasSceneSelected` check, which adds Text/Shape once a scene is).
  const showToolbar = step === 'editor';

  useEffect(() => {
    initUndoHistory();
  }, []);

  // Delete/Backspace removes whatever is selected: a specific layer (text/shape/image) if one is
  // selected, otherwise the whole scene — the active page in view-all, or the open page in the
  // editor. Skipped while typing (contentEditable/input) so it never eats a keystroke meant for
  // in-place text editing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      // ⌘Z undoes the most recent data change (add/move/delete an element, generate sizes, ...).
      // Still gated by the typing bail-out above, so it doesn't fight the browser's native undo
      // while editing a text element or typing into a field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Enter/Esc toggle a selected vector layer's joint-editing mode (svg import & edit spec,
      // Part 2) — Enter only when exactly one vector is selected and focused (not mid-edit already);
      // Esc only matters here while actually editing (an otherwise-focused selection has nothing to
      // back out of via Esc, so this doesn't fight any other Escape handler in the app).
      if (e.key === 'Enter' && !editingVectorElementId && selectedElements.length === 1) {
        const ref = selectedElements[0];
        const el = useAppStore.getState().layoutsById[ref.layoutId]?.elements.find((candidate) => candidate.id === ref.elementId);
        if (el?.kind === 'vector') {
          e.preventDefault();
          setEditingVectorElement(el.id);
          return;
        }
      }
      if (e.key === 'Escape' && editingVectorElementId) {
        e.preventDefault();
        setEditingVectorElement(null);
        return;
      }

      // ⌘D duplicates, ⌘C copies (to the OS clipboard, as JSON), ] / [ reorder — same shortcuts the
      // layer context menu advertises next to each item. All are no-ops with nothing selected.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selectedElements.length > 0) {
        e.preventDefault();
        const state = useAppStore.getState();
        // A group is a same-layout concept — regroup each layout's own copies separately (only
        // when that layout's selected refs are exactly one intact group) rather than treating a
        // cross-scene match-selection as one group spanning every scene.
        const byLayout = new Map<string, string[]>();
        for (const ref of selectedElements) byLayout.set(ref.layoutId, [...(byLayout.get(ref.layoutId) ?? []), ref.elementId]);
        const newRefs: { layoutId: string; elementId: string }[] = [];
        for (const [layoutId, elementIds] of byLayout) {
          const els = elementIds.map((id) => state.layoutsById[layoutId]?.elements.find((el) => el.id === id)).filter((el) => el !== undefined);
          const sharedGroupId = els[0]?.groupId;
          const isIntactGroup = els.length > 1 && Boolean(sharedGroupId) && els.every((el) => el.groupId === sharedGroupId);
          const newIds = elementIds.map((id) => duplicateElement(layoutId, id));
          if (isIntactGroup) groupElements(layoutId, newIds);
          for (const elementId of newIds) newRefs.push({ layoutId, elementId });
        }
        setSelectedElements(newRefs);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && selectedElements.length > 0) {
        e.preventDefault();
        const layoutsById = useAppStore.getState().layoutsById;
        const copied = selectedElements
          .map((ref) => layoutsById[ref.layoutId]?.elements.find((el) => el.id === ref.elementId))
          .filter(Boolean);
        navigator.clipboard?.writeText(JSON.stringify(copied)).catch(() => {});
        return;
      }
      if (e.key === ']' && selectedElements.length > 0) {
        e.preventDefault();
        for (const ref of selectedElements) reorderElement(ref.layoutId, ref.elementId, 'front');
        return;
      }
      if (e.key === '[' && selectedElements.length > 0) {
        e.preventDefault();
        for (const ref of selectedElements) reorderElement(ref.layoutId, ref.elementId, 'back');
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      // The pen tool owns Backspace/Delete while it's actively drawing (removes the last placed
      // joint — see ArtboardFrame) — nothing is "selected" mid-drawing, so without this guard this
      // handler falls through to deleting the whole page out from under the user.
      if (useAppStore.getState().activeTool === 'pen') return;

      // A vector in joint-editing mode (VectorEditOverlay) owns this keypress too — it removes
      // whichever joint(s) are selected. The vector *element* itself stays in `selectedElements`
      // the whole time joint-editing is active, so without this guard this handler would fall
      // through and delete the entire layer out from under an in-progress joint edit.
      if (editingVectorElementId) return;

      if (selectedElements.length > 0) {
        e.preventDefault();
        for (const ref of selectedElements) removeElement(ref.layoutId, ref.elementId);
        selectElement(null);
        return;
      }

      const pageId = viewAllActivePageId;
      if (!pageId) return;
      e.preventDefault();
      deletePage(pageId);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewAllActivePageId, selectedElements, deletePage, removeElement, duplicateElement, reorderElement, selectElement, setSelectedElements, groupElements, editingVectorElementId, setEditingVectorElement]);

  if (step === 'playgrounds') return <PlaygroundsPage />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative h-screen w-screen overflow-hidden bg-background">
        <CanvasDotBackdrop />
        {/* The canvas fills the full viewport, including behind the header, so the infinite
            canvas's dotted background reaches the top of the screen. The header floats on top
            of it (rendered after, transparent) rather than reserving its own row. */}
        <main className="absolute inset-0 flex">
          {(step === 'start' || step === 'editor') && (
            <>
              {/* The ruler-driven extra push is a `transform`, not `margin`/padding — a margin
                  here would grow this flex item's own footprint, shrinking the canvas sibling's
                  measured width right along with it, which was re-triggering the canvas's
                  auto-fit-on-resize effect (silently resetting the user's own zoom/pan) every
                  time the ruler toggled. `transform` moves the panel without touching layout at
                  all, so the canvas's own size never changes and never re-fits because of it —
                  the panel just visually slides over a bit more of it, which is fine since the
                  panel's own background is already opaque. The constant `paddingTop: 56` (header
                  height, unrelated to rulers) still clears the floating header underneath. */}
              <div className="transition-transform duration-150" style={{ paddingTop: 56, transform: rulersActive ? `translate(${RULER_SIZE}px, ${RULER_SIZE}px)` : undefined }}>
                <LeftPanel />
              </div>
              <div className="relative flex-1 overflow-hidden">
                {step === 'editor' && <MultiPageCanvas />}
                {showToolbar && <DefaultModeToolbar />}
                {step === 'editor' && <InspectorPanel />}
              </div>
            </>
          )}
          {step === 'allLayouts' && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              View all layouts (screen 7) — coming later
            </div>
          )}
        </main>
        <TopBar />
      </div>
      <AddBannersPanel />
      <Toaster />
    </TooltipProvider>
  );
}
