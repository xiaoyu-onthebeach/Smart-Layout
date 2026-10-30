import { useEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { dotGridStyle } from '@/lib/canvas-dots';
import { initUndoHistory, undo } from '@/store/undoHistory';
import { AddBannersPanel } from '@/features/size-select/AddBannersPanel';
import { MultiPageCanvas } from '@/features/editor/artboard/MultiPageCanvas';
import { RULER_SIZE } from '@/features/editor/artboard/RulerOverlay';

/** How long switching between Create and Replace animates (matches the duration-300 classes). */
const MODE_SWITCH_MS = 300;
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { PlaygroundsPage } from './PlaygroundsPage';
import { TestDataButton } from './TestDataButton';
import { DefaultModeToolbar } from './DefaultModeToolbar';
import { InspectorPanel } from './InspectorPanel';
import { BulkEditView } from './BulkEditView';
import { BulkEditDownloadPanel } from './BulkEditDownloadPanel';

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
  return <div className="pointer-events-none absolute inset-0" style={dotGridStyle(dot, dot.offsetX, dot.offsetY)} />;
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
  const workspaceView = useAppStore((s) => s.workspaceView);
  const isBulkEdit = step === 'editor' && workspaceView === 'bulkEdit';
  // Opens the Replace content panel (the table side) at 40% of the screen the first time, then at
  // whatever width it was last dragged to; closes it again (remembering that width) on the way back
  // to Create.
  const bulkPanelRef = usePanelRef();
  const bulkPanelSizeRef = useRef('40');
  useEffect(() => {
    const panel = bulkPanelRef.current;
    if (!panel) return;
    if (isBulkEdit) {
      if (panel.isCollapsed()) panel.resize(bulkPanelSizeRef.current);
    } else if (!panel.isCollapsed()) {
      bulkPanelSizeRef.current = String(panel.getSize().asPercentage);
      panel.collapse();
    }
  }, [isBulkEdit, bulkPanelRef]);
  // Switching modes animates for MODE_SWITCH_MS: the table side slides open/closed, the canvas
  // window's frame eases in/out, and the canvas itself waits, then glides to its new framing.
  // Only while switching — a transition left on the panels would make dragging the divider lag.
  const setWorkspaceSwitching = useAppStore((s) => s.setWorkspaceSwitching);
  const switching = useAppStore((s) => s.workspaceSwitching);
  // The table stays mounted for the closing slide after leaving Replace (set during render on the
  // way in, so it never misses a frame; cleared once the slide is over).
  const [tableMounted, setTableMounted] = useState(isBulkEdit);
  if (isBulkEdit && !tableMounted) setTableMounted(true);
  useEffect(() => {
    if (isBulkEdit) return;
    const id = window.setTimeout(() => setTableMounted(false), MODE_SWITCH_MS);
    return () => window.clearTimeout(id);
  }, [isBulkEdit]);
  // The table side's width while in Replace, kept for the closing slide (see the panel below).
  const tableSideRef = useRef<HTMLDivElement>(null);
  const [tableSideWidth, setTableSideWidth] = useState(0);
  useEffect(() => {
    const el = tableSideRef.current;
    if (!isBulkEdit || !el) return;
    const ro = new ResizeObserver(() => setTableSideWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isBulkEdit]);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setWorkspaceSwitching(true);
    const id = window.setTimeout(() => setWorkspaceSwitching(false), MODE_SWITCH_MS);
    return () => {
      window.clearTimeout(id);
      setWorkspaceSwitching(false);
    };
  }, [isBulkEdit, setWorkspaceSwitching]);
  // The ruler toggle only ever lives inside the editor's own canvas toolbar — this guard just
  // keeps a stale flag from a previous editor session from shifting the sidebar on another step.
  const rulersActive = showRulers && step === 'editor' && workspaceView === 'edit';
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

      // Every other shortcut acts on the canvas — none of them apply while the Bulk edit view is
      // showing instead of it.
      if (useAppStore.getState().workspaceView !== 'edit') return;

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

  if (step === 'playgrounds') {
    return (
      <>
        <PlaygroundsPage />
        <TestDataButton />
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative h-screen w-screen overflow-hidden bg-background">
        <CanvasDotBackdrop />
        {/* The canvas fills the full viewport, including behind the header, so the infinite
            canvas's dotted background reaches the top of the screen. The header floats on top
            of it (rendered after, transparent) rather than reserving its own row. */}
        <main className="absolute inset-0 flex">
          {(step === 'start' || step === 'editor') && (
            // Always the same two panels, so switching views never remounts the canvas: in Edit
            // the left (Bulk edit content) panel is collapsed to nothing and its divider hidden; in
            // Bulk edit it opens beside the canvas, which becomes a preview where only whole banners
            // can be selected (see MultiPageCanvas's own `readOnly`), and both editing panels (left
            // panel, inspector) step aside — selecting banners shows download options instead.
            <ResizablePanelGroup className={cn('flex-1', switching && '[&>[data-panel]]:transition-[flex] [&>[data-panel]]:duration-300 [&>[data-panel]]:ease-out')}>
              <ResizablePanel id="bulk-edit-content" panelRef={bulkPanelRef} collapsible collapsedSize={0} defaultSize="0" minSize="25">
                {/* Stays on screen while its side closes on the way back to Create — kept at the width
                    it had (so the closing side covers it rather than squeezing it) and fading out. */}
                {tableMounted && (
                  <div ref={tableSideRef} className={cn('h-full w-full overflow-hidden transition-opacity duration-300 ease-in', !isBulkEdit && 'opacity-0')}>
                    <div className="h-full" style={{ width: isBulkEdit ? '100%' : tableSideWidth || '100%' }}>
                      <BulkEditView />
                    </div>
                  </div>
                )}
              </ResizablePanel>
              {/* Same color as the background around it until hovered — the window's own border already
                  separates the two sides. */}
              <ResizableHandle disabled={!isBulkEdit} className={cn('bg-[#19191D] transition-colors hover:bg-white/10', !isBulkEdit && 'hidden')} />
              <ResizablePanel id="workspace" minSize="25">
                {/* In Bulk edit the canvas becomes a rounded window sitting on the view's own
                    background, below the floating header. */}
                <div className={cn('flex h-full transition-[padding,background-color] duration-300 ease-out', isBulkEdit && 'bg-[#19191D] p-2 pt-16')}>
                  {/* The ruler-driven extra push is a `transform`, not `margin`/padding — a margin
                      here would grow this flex item's own footprint, shrinking the canvas sibling's
                      measured width right along with it, which was re-triggering the canvas's
                      auto-fit-on-resize effect (silently resetting the user's own zoom/pan) every
                      time the ruler toggled. `transform` moves the panel without touching layout at
                      all, so the canvas's own size never changes and never re-fits because of it —
                      the panel just visually slides over a bit more of it, which is fine since the
                      panel's own background is already opaque. The constant `paddingTop: 56` (header
                      height, unrelated to rulers) still clears the floating header underneath. */}
                  {/* Coming back to Create, it stays hidden while the canvas grows back to full width
                      (it would otherwise ride along with the moving edge), then fades in in place. */}
                  <div className={cn('animate-in fade-in-0 transition-transform duration-150 [animation-duration:300ms]', (isBulkEdit || switching) && 'hidden')} style={{ paddingTop: 56, transform: rulersActive ? `translate(${RULER_SIZE}px, ${RULER_SIZE}px)` : undefined }}>
                    <LeftPanel />
                  </div>
                  <div className={cn('relative flex-1 overflow-hidden transition-[border-radius] duration-300 ease-out', isBulkEdit && 'rounded-2xl border border-white/10 bg-background')}>
                    {step === 'editor' && <MultiPageCanvas />}
                    {showToolbar && <DefaultModeToolbar />}
                    {step === 'editor' && !isBulkEdit && <InspectorPanel />}
                    {isBulkEdit && <BulkEditDownloadPanel />}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
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
      <TestDataButton />
    </TooltipProvider>
  );
}
