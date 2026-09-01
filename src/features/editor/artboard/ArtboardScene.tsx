import { useEffect, useRef, useState, type RefObject } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ArtboardFrame } from './ArtboardFrame';
import { PageTitleBar } from './PageTitleBar';
import { CascadeToolbar } from './CascadeToolbar';

const MAX_BOX_WIDTH = 880;
const MAX_BOX_HEIGHT = 480;
const MIN_BOX_WIDTH = 280;
const MIN_BOX_HEIGHT = 220;
const OUTER_PADDING = 48; // matches the p-12 on the measured container
const TITLE_ROW_RESERVE = 32; // title row height + gap-3, reserved out of available height

/** Fits a W:H ratio inside the available space of `containerRef`, like object-fit: contain. */
function useContainSize(containerRef: RefObject<HTMLDivElement | null>, ratio: number) {
  const [size, setSize] = useState({ width: MIN_BOX_WIDTH, height: MIN_BOX_HEIGHT });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const availW = Math.min(el.clientWidth - OUTER_PADDING * 2, MAX_BOX_WIDTH);
      const availH = Math.min(el.clientHeight - OUTER_PADDING * 2 - TITLE_ROW_RESERVE, MAX_BOX_HEIGHT);
      let width = availW;
      let height = width / ratio;
      if (height > availH) {
        height = availH;
        width = height * ratio;
      }
      setSize({ width: Math.max(width, MIN_BOX_WIDTH), height: Math.max(height, MIN_BOX_HEIGHT) });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, ratio]);

  return size;
}

/** Screen 3/4 — the single active page, centered and fully interactive. */
export function ArtboardScene() {
  const t = useT();
  const activeLayoutId = useAppStore((s) => s.activeLayoutId);
  const layout = useAppStore((s) => (activeLayoutId ? s.layoutsById[activeLayoutId] : null));
  const currentSet = useAppStore((s) => s.currentSet);
  const renamePage = useAppStore((s) => s.renamePage);
  const selectScene = useAppStore((s) => s.selectScene);
  const selectElement = useAppStore((s) => s.selectElement);
  const isLoading = useAppStore((s) => (currentSet ? Boolean(s.loadingPageIds[currentSet.id]) : false));
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pendingCascadeSetIds = useAppStore((s) => s.pendingCascadeSetIds);

  const outerRef = useRef<HTMLDivElement>(null);
  const { width, height } = layout?.size ?? { width: 1, height: 1 };
  const box = useContainSize(outerRef, width / height);
  const scale = box.width / width;

  if (!layout) return null;

  // Same "primary set with pushable siblings" check SceneEditorPanel's ApplyCascadeRow uses —
  // this toolbar is that same cascade, just always-visible above the frame instead of tucked
  // inside the right-corner panel behind an explicit scene selection.
  const setId = currentSet?.id;
  const groupId = setId ? pageGroupIdByPage[setId] : undefined;
  const group = groupId ? pageGroups[groupId] : undefined;
  const isPrimaryWithSiblings = Boolean(group && setId && group.memberIds[0] === setId && group.memberIds.length > 1);
  const showCascadeToolbar = !isLoading && isPrimaryWithSiblings && setId !== undefined && Boolean(pendingCascadeSetIds[setId]);

  return (
    <div
      ref={outerRef}
      className="absolute inset-0 flex items-center justify-center p-12"
      onClick={() => {
        selectScene(null);
        selectElement(null);
      }}
    >
      {/* Title row and frame share this exact width so they stay aligned as one unit at every ratio. */}
      <div className="flex flex-col gap-3" style={{ width: box.width }} onClick={(e) => e.stopPropagation()}>
        <PageTitleBar
          className="flex w-full items-center gap-2"
          name={currentSet?.name ?? t('New Banner')}
          width={width}
          height={height}
          presetId={layout.size.presetId}
          layoutId={layout.id}
          onRename={currentSet ? (name) => renamePage(currentSet.id, name) : undefined}
        />
        <div className="relative" style={{ width: box.width, height: box.height }}>
          {showCascadeToolbar && setId && (
            <div className="absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2">
              <CascadeToolbar setId={setId} />
            </div>
          )}
          {isLoading ? (
            <div
              className="flex items-center justify-center border border-chrome-border-soft bg-chrome-bg"
              style={{ width: box.width, height: box.height }}
            >
              <LoadingSpinner size={Math.min(box.width, box.height) * 0.3} />
            </div>
          ) : (
            <ArtboardFrame layout={layout} scale={scale} width={box.width} height={box.height} active />
          )}
        </div>
      </div>
    </div>
  );
}
