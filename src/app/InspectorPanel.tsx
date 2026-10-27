import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { TextEditorPanel } from '@/features/editor/artboard/TextEditorPanel';
import { ShapeEditorPanel } from '@/features/editor/artboard/ShapeEditorPanel';
import { VectorPathPanel } from '@/features/editor/artboard/VectorPathPanel';
import { ImageEditorPanel } from '@/features/editor/artboard/ImageEditorPanel';
import { SceneEditorPanel } from '@/features/editor/artboard/SceneEditorPanel';
import { CombinedEditorPanel } from '@/features/editor/artboard/CombinedEditorPanel';
import { GroupEditorPanel } from '@/features/editor/artboard/GroupEditorPanel';
import { useSelectedWholeGroup } from '@/features/editor/artboard/AutoLayoutSection';
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
  // it's open this panel steps aside entirely instead of rendering underneath/behind it.
  const addSizesOpen = useAppStore((s) => s.addSizesOpen);
  const editingVectorElementId = useAppStore((s) => s.editingVectorElementId);
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
  // A whole layer group gets its own panel (position + layout only), whatever kinds it holds.
  const wholeGroup = useSelectedWholeGroup(targets);

  let content: ReactNode = null;

  if (wholeGroup) {
    content = <GroupEditorPanel layoutId={wholeGroup.layoutId} groupId={wholeGroup.groupId} />;
  } else if (targets.length > 0) {
    const kinds = new Set(targets.map((t) => t.element.kind));
    if (kinds.size > 1) {
      content = <CombinedEditorPanel targets={targets} />;
    } else if (targets[0].element.kind === 'text') {
      content = <TextEditorPanel targets={targets} />;
    } else if (targets[0].element.kind === 'vector' && editingVectorElementId === targets[0].element.id) {
      // Double-clicked into joint-editing mode (VectorEditOverlay) — a wholly different panel, with
      // per-joint controls (align the selection, each joint's own position, Curve/mirroring) instead
      // of whole-element ones. Selected-but-not-editing still falls through to the branch below.
      content = <VectorPathPanel targets={targets} />;
    } else if (targets[0].element.kind === 'shape' || targets[0].element.kind === 'vector') {
      // A converted/imported/drawn vector gets the exact same panel a shape does whenever it's just
      // selected (not actively being joint-edited) — same style fields apply either way, and the
      // "Count" row inside it only shows up for a polygon or any vector (see ShapeEditorPanel's own
      // `showsCornerCount`).
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

  if (!content || addSizesOpen) return null;

  return (
    <div
      className="pointer-events-none absolute right-6 flex max-h-[calc(100vh-160px)] transition-[top] duration-150"
      style={{ top: 64 + (showRulers ? RULER_SIZE : 0) }}
    >
      <div className="pointer-events-auto flex max-h-full">{content}</div>
    </div>
  );
}
