import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { TextEditorPanel } from '@/features/editor/artboard/TextEditorPanel';
import { ShapeEditorPanel } from '@/features/editor/artboard/ShapeEditorPanel';
import { ImageEditorPanel } from '@/features/editor/artboard/ImageEditorPanel';
import { SceneEditorPanel } from '@/features/editor/artboard/SceneEditorPanel';
import { CombinedEditorPanel } from '@/features/editor/artboard/CombinedEditorPanel';
import { MultiSceneContentPanel } from './MultiSceneContentPanel';
import type { EditorTarget } from '@/features/editor/artboard/PanelKit';

/** Right-corner panel: swaps between text/shape/image/scene/combined editors for whatever is currently selected. */
export function InspectorPanel() {
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);

  const targets: EditorTarget[] = selectedElements
    .map((ref) => {
      const layout = layoutsById[ref.layoutId];
      const element = layout?.elements.find((el) => el.id === ref.elementId);
      return element ? { element, layoutId: ref.layoutId } : null;
    })
    .filter((t): t is EditorTarget => t !== null);

  let content: ReactNode = null;

  if (targets.length > 0) {
    const kinds = new Set(targets.map((t) => t.element.kind));
    if (kinds.size > 1) {
      content = <CombinedEditorPanel targets={targets} />;
    } else if (targets[0].element.kind === 'text') {
      content = <TextEditorPanel targets={targets} />;
    } else if (targets[0].element.kind === 'shape') {
      content = <ShapeEditorPanel targets={targets} />;
    } else if (targets[0].element.kind === 'image') {
      content = <ImageEditorPanel targets={targets} />;
    }
  } else if (selectedSceneIds.length > 1) {
    content = <MultiSceneContentPanel setIds={selectedSceneIds} />;
  } else if (selectedSceneIds.length === 1) {
    const setId = selectedSceneIds[0];
    const bannerSet = setsById[setId];
    const layout = bannerSet ? layoutsById[bannerSet.sourceLayoutId] : null;
    if (layout) content = <SceneEditorPanel layout={layout} setId={setId} />;
  }

  if (!content) return null;

  return (
    <div className="pointer-events-none absolute top-16 right-6 flex max-h-[calc(100vh-160px)]">
      <div className="pointer-events-auto flex max-h-full">{content}</div>
    </div>
  );
}
