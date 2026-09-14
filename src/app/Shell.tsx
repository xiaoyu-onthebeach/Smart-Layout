import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/store/useAppStore';
import { initUndoHistory, undo } from '@/store/undoHistory';
import { AddBannersPanel } from '@/features/size-select/AddBannersPanel';
import { MultiPageCanvas } from '@/features/editor/artboard/MultiPageCanvas';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { PlaygroundsPage } from './PlaygroundsPage';
import { CanvasStart } from './CanvasStart';
import { DefaultModeToolbar } from './DefaultModeToolbar';
import { InspectorPanel } from './InspectorPanel';

export function Shell() {
  const step = useAppStore((s) => s.step);
  const viewAllActivePageId = useAppStore((s) => s.viewAllActivePageId);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const pageOrder = useAppStore((s) => s.pageOrder);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const deletePage = useAppStore((s) => s.deletePage);
  const removeElement = useAppStore((s) => s.removeElement);
  const duplicateElement = useAppStore((s) => s.duplicateElement);
  const reorderElement = useAppStore((s) => s.reorderElement);
  const selectElement = useAppStore((s) => s.selectElement);
  // A single click already selects a scene and makes it fully interactive (see MultiPageCanvas's
  // `active` prop), so the toolbar should appear right away too — not wait for the separate
  // double-click that sets `viewAllActivePageId`.
  const showToolbar = viewAllActivePageId !== null || selectedSceneIds.length > 0;

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

      // ⌘D duplicates, ⌘C copies (to the OS clipboard, as JSON), ] / [ reorder — same shortcuts the
      // layer context menu advertises next to each item. All are no-ops with nothing selected.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && selectedElements.length > 0) {
        e.preventDefault();
        for (const ref of selectedElements) duplicateElement(ref.layoutId, ref.elementId);
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
  }, [viewAllActivePageId, selectedElements, deletePage, removeElement, duplicateElement, reorderElement, selectElement]);

  if (step === 'playgrounds') return <PlaygroundsPage />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative h-screen w-screen overflow-hidden bg-background">
        {/* The canvas fills the full viewport, including behind the header, so the infinite
            canvas's dotted background reaches the top of the screen. The header floats on top
            of it (rendered after, transparent) rather than reserving its own row. */}
        <main className="absolute inset-0 flex">
          {(step === 'start' || step === 'editor') && (
            <>
              <div className="pt-14">
                <LeftPanel />
              </div>
              <div className="relative flex-1 overflow-hidden">
                {step === 'editor' && pageOrder.length === 0 && <CanvasStart />}
                {step === 'editor' && pageOrder.length > 0 && <MultiPageCanvas />}
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
