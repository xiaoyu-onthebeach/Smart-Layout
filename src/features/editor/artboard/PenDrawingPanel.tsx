import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import {
  BorderSection,
  CornerRadiusRow,
  IconSlot,
  InlineColorField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
} from './PanelKit';

// Same six, same icons, same order VectorPathPanel's own Alignment row uses — kept here too purely
// for visual consistency (there's no real multi-joint selection to align against yet while drawing
// from scratch, so every button stays disabled, same convention `canAlign={false}` already means
// elsewhere).
const ALIGN_ICONS = [
  '/icons/edit_panel/layers-align-left.svg',
  '/icons/edit_panel/layers-align-center.svg',
  '/icons/edit_panel/layers-align-right.svg',
  '/icons/edit_panel/layers-align-top.svg',
  '/icons/edit_panel/layers-align-middle.svg',
  '/icons/edit_panel/layers-align-bottom.svg',
];

/**
 * Shown instead of a real selection panel while the pen tool is actively drawing a brand-new path
 * from scratch — there's no committed `LayoutElement` yet to route the real `VectorPathPanel` off
 * of (see `penDrawingPosition`'s own doc comment in store/types.ts), so this reproduces that same
 * panel's full layout instead of just a bare Position readout: Alignment (disabled — nothing real
 * to align yet), the active joint's live Position, and Styles/Border wired to `penDrawStyle` (also
 * mirrored in the store, since this panel lives outside `ArtboardFrame`'s own component tree) —
 * whatever the user sets here is exactly what `finishDrawing` applies to the real element once the
 * path is actually committed. `x`/`y` are already absolute/native coordinates (`penDraw.joints`'
 * own space) — there's no frame yet for them to be relative to.
 */
export function PenDrawingPanel({ x, y }: { x: number; y: number }) {
  const t = useT();
  const penDrawStyle = useAppStore((s) => s.penDrawStyle);
  const setPenDrawStyle = useAppStore((s) => s.setPenDrawStyle);

  return (
    <PanelCard gap={0}>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/panel_vector.svg" />} title={t('Vector path')} />

      <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Position')}</span>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/45">{t('Alignment')}</span>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-md p-0.5 opacity-40" style={{ background: '#26262C' }}>
              {ALIGN_ICONS.map((icon) => (
                <button key={icon} type="button" disabled className="flex h-6 flex-1 items-center justify-center rounded text-white/70 disabled:cursor-not-allowed">
                  <img src={icon} alt="" className="size-4" />
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
                <span className="text-white">{Math.round(x)}</span>
              </div>
              <div className="flex h-7 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-[11px]">
                <span className="text-white/65">Y</span>
                <span className="text-white">{Math.round(y)}</span>
              </div>
            </div>
            <IconSlot />
          </div>
        </div>
      </div>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/65">{t('Fill')}</span>
          <div className="flex items-center gap-2">
            <InlineColorField
              color={penDrawStyle.fill}
              onChange={(fill) => setPenDrawStyle({ fill })}
              onClear={() => setPenDrawStyle({ fill: undefined })}
              width="flex-1"
              compact={false}
              opacity={penDrawStyle.opacity ?? 100}
              onOpacityCommit={(v) => setPenDrawStyle({ opacity: Math.max(0, Math.min(100, Number(v) || 0)) })}
            />
            <IconSlot />
          </div>
        </div>

        <CornerRadiusRow
          value={penDrawStyle.radius ?? 0}
          onCommit={(radius) => setPenDrawStyle({ radius })}
          max={500}
          allowIndividual={false}
          layout="stacked"
        />
      </PanelSection>

      <PanelDivider />

      <BorderSection style={penDrawStyle} onPatch={setPenDrawStyle} />
    </PanelCard>
  );
}
