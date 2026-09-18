import { useAppStore } from '@/store/useAppStore';
import { BannersTab } from './BannersTab';
import { LayersTab } from './LayersTab';
import { AssetsPanel } from './AssetsPanel';

/** Left column: an "All banners" card that swaps to the selected scene's "Layers" view, plus an Assets card below. */
export function LeftPanel() {
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const selectScene = useAppStore((s) => s.selectScene);

  // Selecting the scene itself (its card, or clicking empty canvas within it) isn't reason enough
  // to swap away from the banner list — only an actual element selected *inside* it is, so this
  // also switches back to the list the instant that element gets deselected again, not just when
  // the scene itself is.
  const showLayers = selectedSceneIds.length > 0 && selectedElements.length > 0;

  return (
    <aside className="flex h-full w-[319px] shrink-0 flex-col gap-3 p-3">
      <div
        className="relative flex min-h-0 flex-1 flex-col gap-3 rounded-xl border-[0.5px] p-2"
        style={{ background: '#19191D', borderColor: '#26262C' }}
      >
        {showLayers ? <LayersTab setId={selectedSceneIds[0]} onBack={() => selectScene(null)} /> : <BannersTab />}
      </div>

      <AssetsPanel />
    </aside>
  );
}
