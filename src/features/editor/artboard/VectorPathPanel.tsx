import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement, MirrorMode } from '@/types';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { boundsOf } from '@/lib/svg-geometry';
import { alignJoints, convertJointToCurve, rebaseVectorFrame, setJointMirrorMode, type JointAlignMode } from '@/lib/vector-path';
import { BorderSection, CornerRadiusRow, IconSlot, InlineColorField, PanelCard, PanelDivider, PanelHeader, PanelHeaderIcon, PanelSection, SegmentedControl, type EditorTarget } from './PanelKit';

const ALIGN_BUTTONS: { mode: JointAlignMode; icon: string; label: string }[] = [
  { mode: 'left', icon: '/icons/edit_panel/layers-align-left.svg', label: 'Left' },
  { mode: 'center', icon: '/icons/edit_panel/layers-align-center.svg', label: 'Center' },
  { mode: 'right', icon: '/icons/edit_panel/layers-align-right.svg', label: 'Right' },
  { mode: 'top', icon: '/icons/edit_panel/layers-align-top.svg', label: 'Top' },
  { mode: 'middle', icon: '/icons/edit_panel/layers-align-middle.svg', label: 'Middle' },
  { mode: 'bottom', icon: '/icons/edit_panel/layers-align-bottom.svg', label: 'Bottom' },
];

const MIRROR_MODE_ICONS: Record<MirrorMode, string> = {
  sharp: '/icons/curve-sharp-16.svg',
  mirror: '/icons/curve-mirror-16.svg',
  // Literal space in the filename on disk — url-encoded, same convention every other icon path with
  // a space in it already uses in this app (e.g. "panel%20rectangle.svg").
  nomirror: '/icons/curve-no%20mirror-16.svg',
};
const MIRROR_MODE_LABELS: Record<MirrorMode, string> = { sharp: 'Sharp', mirror: 'Mirror', nomirror: 'No mirror' };

/**
 * Replaces `ShapeEditorPanel` while a vector element is actually in joint-editing mode (double-click —
 * see `InspectorPanel`'s routing). Everything here edits the *joints* `VectorEditOverlay`'s own local
 * selection currently has (mirrored up via `editingVectorJoint`), not the element as a whole: aligning
 * the selected joints, their own position (display only, same read-only convention the regular
 * Position section already uses for a whole element), and — once exactly one is selected — its
 * Curve/mirroring mode. Styles/Border below that are the same whole-element Fill/Border
 * `ShapeEditorPanel` has, minus the corner-radius row (never meaningful for a vector's own joints).
 */
export function VectorPathPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const updateElement = useAppStore((s) => s.updateElement);
  const editingVectorJoint = useAppStore((s) => s.editingVectorJoint);
  const { element: primary, layoutId } = targets[0];
  const path = primary.path;
  if (!path) return null;

  // Defensively re-filtered against this element's own current joint count — `editingVectorJoint`
  // can briefly point at a stale index through a reset path this panel has no other way to know about.
  const jointIndices = editingVectorJoint?.elementId === primary.id ? editingVectorJoint.jointIndices.filter((i) => i < path.joints.length) : [];
  // A lone joint still aligns — against the whole path's own bounding box instead of a selection
  // span it doesn't have (see `alignJoints`) — so only an empty selection disables this.
  const canAlign = jointIndices.length >= 1;

  function patchPath(nextPath: LayoutElement['path']) {
    if (!nextPath) return;
    const { frame: nextFrame, path: rebased } = rebaseVectorFrame(primary.frame, nextPath);
    updateElement(layoutId, primary.id, { frame: nextFrame, path: rebased });
  }
  function patchStyle(patch: Partial<LayoutElement['style']>) {
    updateElement(layoutId, primary.id, { style: { ...primary.style, ...patch } });
  }
  function handleAlign(mode: JointAlignMode) {
    if (!canAlign) return;
    patchPath(alignJoints(path, jointIndices, mode));
  }

  // Position — a plain display, same as the regular Position section's own X/Y today (neither is
  // wired to a real commit yet): the selection's own bounding-box top-left, in absolute layout space.
  // X and Y each show "Mixed" independently when the selected joints don't all share that one
  // coordinate (compared post-rounding, so two joints a fraction of a px apart that round to the
  // same displayed value don't read as mixed) — one axis can agree while the other doesn't.
  const selectedPoints = jointIndices.map((i) => path.joints[i]);
  const positionBounds = selectedPoints.length > 0 ? boundsOf(selectedPoints) : null;
  const roundedXs = selectedPoints.map((p) => Math.round(primary.frame.x + p.x));
  const roundedYs = selectedPoints.map((p) => Math.round(primary.frame.y + p.y));
  const xMixed = roundedXs.some((x) => x !== roundedXs[0]);
  const yMixed = roundedYs.some((y) => y !== roundedYs[0]);

  // Curve/mirroring only has meaning for exactly one selected joint.
  const curveJointIndex = jointIndices.length === 1 ? jointIndices[0] : -1;
  const curveJoint = curveJointIndex >= 0 ? path.joints[curveJointIndex] : null;
  function neighborsOf(i: number) {
    const n = path!.joints.length;
    if (path!.closed) return { prev: path!.joints[(i - 1 + n) % n], next: path!.joints[(i + 1) % n] };
    return { prev: i > 0 ? path!.joints[i - 1] : null, next: i < n - 1 ? path!.joints[i + 1] : null };
  }
  function handleMirrorModeChange(mode: MirrorMode) {
    if (!curveJoint || !editingVectorJoint) return;
    const isCurrentlyCurve = Boolean(curveJoint.handleIn || curveJoint.handleOut);
    const { prev, next } = neighborsOf(curveJointIndex);
    // Switching a sharp joint straight to Mirror/No mirror is itself the "sharp → curve" conversion —
    // it needs real handles to exist before a mode switch has anything to snap; `convertJointToCurve`
    // always lands on `mirror` first, which `setJointMirrorMode` then reconciles to whichever mode
    // was actually picked.
    const withHandles = !isCurrentlyCurve && mode !== 'sharp' ? convertJointToCurve(curveJoint, prev, next) : curveJoint;
    const nextJoint = setJointMirrorMode(withHandles, mode, editingVectorJoint.referenceSide);
    const joints = path.joints.map((j, i) => (i === curveJointIndex ? nextJoint : j));
    patchPath({ ...path, joints });
  }

  return (
    <PanelCard gap={0}>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/panel_vector.svg" />} title={t('Vector path')} />

      <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Position')}</span>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/45">{t('Alignment')}</span>
          <div className="flex items-center gap-2">
            <div className={cn('flex min-w-0 flex-1 items-center rounded-md p-0.5 transition-opacity', !canAlign && 'opacity-40')} style={{ background: '#26262C' }}>
              {ALIGN_BUTTONS.map((btn) => (
                <button
                  key={btn.mode}
                  type="button"
                  disabled={!canAlign}
                  title={t(btn.label)}
                  onClick={() => handleAlign(btn.mode)}
                  className="flex h-6 flex-1 items-center justify-center rounded text-white/70 transition-colors enabled:hover:bg-white/10 enabled:hover:text-white disabled:cursor-not-allowed"
                >
                  <img src={btn.icon} alt="" className="size-4" />
                </button>
              ))}
            </div>
            <IconSlot />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/65">{t('Position')}</span>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-7 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-[11px]">
                <span className="text-white/65">X</span>
                <span className="text-white">{xMixed ? t('Mixed') : positionBounds ? Math.round(primary.frame.x + positionBounds.minX) : ''}</span>
              </div>
              <div className="flex h-7 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-[11px]">
                <span className="text-white/65">Y</span>
                <span className="text-white">{yMixed ? t('Mixed') : positionBounds ? Math.round(primary.frame.y + positionBounds.minY) : ''}</span>
              </div>
            </div>
            <IconSlot />
          </div>
        </div>
      </div>

      {jointIndices.length > 0 && (
        <>
          <PanelDivider />
          <PanelSection label={t('Path')}>
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] leading-4 text-white/65">{t('Curve type')}</span>
              <div className="flex items-center gap-2">
                <div className={cn('min-w-0 flex-1 transition-opacity', !curveJoint && 'pointer-events-none opacity-40')}>
                  <SegmentedControl
                    options={(['sharp', 'mirror', 'nomirror'] as const).map((value) => ({
                      value,
                      label: t(MIRROR_MODE_LABELS[value]),
                      icon: <img src={MIRROR_MODE_ICONS[value]} alt="" className="size-4" />,
                    }))}
                    value={curveJoint?.mirror ?? 'sharp'}
                    onChange={handleMirrorModeChange}
                  />
                </div>
                <IconSlot />
              </div>
            </div>
          </PanelSection>
        </>
      )}

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/65">{t('Fill')}</span>
          <div className="flex items-center gap-2">
            {/* No `?? '#d9d9d9'` fallback — a vector can genuinely have no fill at all (a pen-drawn
                stroke-only path, say), and showing a fake default color there would lie about what's
                actually rendered (plain `fill="none"`). See `ShapeEditorPanel`'s identical fix for
                the same field in its own non-editing panel. */}
            <InlineColorField
              color={primary.style.fill}
              onChange={(fill) => patchStyle({ fill })}
              onClear={() => patchStyle({ fill: undefined })}
              width="flex-1"
              compact={false}
              opacity={primary.style.opacity ?? 100}
              onOpacityCommit={(v) => patchStyle({ opacity: Math.max(0, Math.min(100, Number(v) || 0)) })}
            />
            <IconSlot />
          </div>
        </div>

        <CornerRadiusRow
          value={primary.style.radius ?? 0}
          onCommit={(radius) => patchStyle({ radius })}
          max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)}
          allowIndividual={false}
          layout="stacked"
        />
      </PanelSection>

      <PanelDivider />

      <BorderSection style={primary.style} onPatch={patchStyle} />
    </PanelCard>
  );
}
