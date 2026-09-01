import { useAppStore } from '@/store/useAppStore';
import { BannersTab } from './BannersTab';
import { LayersTab } from './LayersTab';
import { AssetsPanel } from './AssetsPanel';

/** Left column: an "All banners" card that swaps to the selected scene's "Layers" view, plus an Assets card below. */
export function LeftPanel() {
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectScene = useAppStore((s) => s.selectScene);

  return (
    <aside className="flex h-full w-[279px] shrink-0 flex-col gap-3 p-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-chrome-border p-2" style={{ background: '#19191D' }}>
        {selectedSceneIds.length > 0 ? <LayersTab setId={selectedSceneIds[0]} onBack={() => selectScene(null)} /> : <BannersTab />}
      </div>

      <AssetsPanel />
    </aside>
  );
}
