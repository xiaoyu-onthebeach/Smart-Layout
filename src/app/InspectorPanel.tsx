import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { TextEditorPanel } from '@/features/editor/artboard/TextEditorPanel';
import { ShapeEditorPanel } from '@/features/editor/artboard/ShapeEditorPanel';
import { ImageEditorPanel } from '@/features/editor/artboard/ImageEditorPanel';
import { SceneEditorPanel } from '@/features/editor/artboard/SceneEditorPanel';
import { CombinedEditorPanel } from '@/features/editor/artboard/CombinedEditorPanel';
import { MultiSceneContentPanel } from './MultiSceneContentPanel';
import type { EditorTarget } from '@/features/editor/artboard/PanelKit';
import { RULER_SIZE } from '@/features/editor/artboard/RulerOverlay';

/** Right-corner panel: swaps between text/shape/image/scene/combined editors for whatever is currently selected. */
export function InspectorPanel() {
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  // The "Add more sizes" popup (QuickSizeMenu) sits in this exact same top-right corner — while
  // it's open (non-null for its whole lifetime, cleared the instant it closes) this panel steps
  // aside entirely instead of rendering underneath/behind it.
  const pickingFocusForLayoutId = useAppStore((s) => s.pickingFocusForLayoutId);
  // Mirrors the header's own ruler-driven push-down (see TopBar/Shell) so the gap between the
  // header's bottom edge and this panel's own top edge never changes — a plain `top` offset here
  // (not a transform) is fine, unlike the sidebar: this panel is `absolute` within the canvas's
  // own flex-1 container, so its own position never feeds back into that container's measured
  // size the way the sidebar's box once did.
  const showRulers = useAppStore((s) => s.showRulers);

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

  if (!content || pickingFocusForLayoutId) return null;

  return (
    <div
      className="pointer-events-none absolute right-6 flex max-h-[calc(100vh-160px)] transition-[top] duration-150"
      style={{ top: 64 + (showRulers ? RULER_SIZE : 0) }}
    >
      <div className="pointer-events-auto flex max-h-full">{content}</div>
    </div>
  );
}
