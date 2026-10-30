import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { ChevronDown, Minus, Plus, RefreshCw } from 'lucide-react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { groupSizeCount, layoutHasSiblingSizes } from '@/lib/match-select';
import { useT } from '@/lib/i18n';
import { exportLayout, type ExportFileType, type ExportScale } from '@/lib/export-image';
import { isGradient } from '@/lib/gradient';
import { isValidHex } from '@/lib/color';
import { ColorPickerPopover } from './ColorPickerPopover';
import type { Layout, LayoutElement, ShadowStyle, VectorPath } from '@/types';
import { boundsOf } from '@/lib/svg-geometry';
import { allControlPoints, jointsToRoundedPathD } from '@/lib/vector-path';

/** One selected element, paired with the scene (layout) it lives in — a multi-select can span scenes. */
export type EditorTarget = { element: LayoutElement; layoutId: string };

/** Shared visual kit for the right-corner editing panels (text/shape/image/scene). */
export function PanelCard({ width = 279, gap = 8, children }: { width?: number; gap?: number; children: ReactNode }) {
  return (
    <div
      data-panel-card
      className="flex max-h-full min-h-0 flex-col items-stretch overflow-y-auto rounded-xl border-[0.5px] border-[#26262C] py-4"
      style={{ width, gap, background: '#19191D' }}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ icon, title, trailing }: { icon: ReactNode; title: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pb-1">
      {icon}
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-white">{title}</span>
      {trailing}
    </div>
  );
}

/** A header icon that already bakes in its own tile background/border/shadow (the `icons/edit_panel/*` set) — rendered slightly oversized so that built-in drop shadow isn't clipped.
 * `style` is an escape hatch for a specific asset whose own glyph sits off-center within its
 * transparent canvas (the box itself is always centered against sibling content via flex
 * `items-center`; a lopsided asset still needs its own nudge on top of that). */
export function PanelHeaderIcon({ src, style }: { src: string; style?: CSSProperties }) {
  return <img src={src} alt="" className="-ml-1 size-8 shrink-0" style={style} />;
}

/** A vector layer's own glyph: a tiny outline preview of its actual path (not a generic shape
 * silhouette), on the same dark rounded-square backdrop every sibling `panel_*.svg` bakes in —
 * used for both the layers-list row thumbnail and this element's own panel header icon. Always
 * stroked, never filled, regardless of the element's real fill/stroke style (matching how the
 * plain shape thumbnails in the layers list ignore fill too). */
export function VectorShapeIcon({ path, radius = 0, size = 32 }: { path: VectorPath | undefined; radius?: number; size?: number }) {
  if (!path || path.joints.length < 2) {
    return <div className="shrink-0 rounded-lg" style={{ width: size, height: size, background: '#26262C' }} />;
  }
  const bounds = boundsOf(allControlPoints(path.joints));
  const w = Math.max(bounds.maxX - bounds.minX, 1e-3);
  const h = Math.max(bounds.maxY - bounds.minY, 1e-3);
  // Longer side maxes out at innerMax (20 at the usual 32px size) — same fit-to-box math `ShapeThumb`
  // (LayersTab.tsx) uses, so a vector's glyph reads at the same visual scale as every other kind's.
  const innerMax = size * 0.625;
  const ratio = w / h;
  const renderedW = Math.max(4, ratio >= 1 ? innerMax : innerMax * ratio);
  const renderedH = Math.max(4, ratio >= 1 ? innerMax / ratio : innerMax);
  return (
    <div className="flex shrink-0 items-center justify-center rounded-lg" style={{ width: size, height: size, background: '#26262C' }}>
      <svg width={renderedW} height={renderedH} viewBox={`${bounds.minX} ${bounds.minY} ${w} ${h}`} style={{ overflow: 'visible' }}>
        <path
          d={jointsToRoundedPathD(path, radius)}
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/** Shared toggle state/logic behind both `MatchSelectButton` (the compact header icon) and
 * `MatchSelectRow` (the Text panel's own labeled row) — while on (the default), selecting a layer
 * in its own scene also selects its matching layer in every other size of the group; toggling off
 * drops every cross-scene match, keeping just the current scene's own selection. `visible` is
 * false until at least one other size exists to match against, at which point both renderers
 * should show nothing at all. */
function useMatchSelectToggle(targets: EditorTarget[]) {
  const matchSelectEnabled = useAppStore((s) => s.matchSelectEnabled);
  const enableMatchSelect = useAppStore((s) => s.enableMatchSelect);
  const disableMatchSelect = useAppStore((s) => s.disableMatchSelect);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const pageGroups = useAppStore((s) => s.pageGroups);

  const primary = targets[0];
  const groupState = { setsById, layoutsById, pageGroupIdByPage, pageGroups };
  const visible = Boolean(primary && layoutHasSiblingSizes(groupState, primary.layoutId));
  const sizeCount = primary ? groupSizeCount(groupState, primary.layoutId) : 0;
  return { visible, matchSelectEnabled, sizeCount, toggle: () => (matchSelectEnabled ? disableMatchSelect() : enableMatchSelect()) };
}

/** Sits at the right edge of the shape/image panels' own header row (see `MatchSelectRow` for the
 * Text panel's own labeled version of the same toggle). */
export function MatchSelectButton({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const { visible, matchSelectEnabled, toggle } = useMatchSelectToggle(targets);
  if (!visible) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={matchSelectEnabled ? t('Stop select in all sizes') : t('Select in all sizes')}
          onClick={toggle}
          className={cn('flex size-6 shrink-0 items-center justify-center rounded-md transition-colors', matchSelectEnabled ? 'bg-button-primary' : 'bg-[#40404A] hover:bg-white/20')}
        >
          <img src="/icons/apply-change.svg" alt="" className="size-5" />
        </button>
      </TooltipTrigger>
      {/* No custom background here — TooltipContent's own arrow is a separate element with a
          hardcoded fill that only matches the component's default background; overriding just
          the body color leaves the arrow looking like a stray dark shape next to it. */}
      <TooltipContent side="top">{matchSelectEnabled ? t('Stop select in all sizes') : t('Select in all sizes')}</TooltipContent>
    </Tooltip>
  );
}

/** The Text panel's own "layer selection" row — a labeled, always-visible counterpart to
 * `MatchSelectButton`'s compact header icon (which doesn't have room for a label of its own).
 * Label left, icon button right; off by default ("Select matching layers"), switching to a count
 * of the group's own size once turned on ("Selected in N sizes"). `TextEditorPanel` also calls
 * `useMatchSelectVisible` once of its own to decide whether to render the dividers around this row
 * at all — this component already hides itself the same way, but the dividers aren't its to own. */
export function MatchSelectRow({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const { visible, matchSelectEnabled, sizeCount, toggle } = useMatchSelectToggle(targets);
  if (!visible) return null;
  const label = matchSelectEnabled ? t('Selected in {{count}} sizes').replace('{{count}}', String(sizeCount)) : t('Select matching layers');

  return (
    <div className="flex shrink-0 items-center justify-between gap-1.5 px-4 py-2">
      <span className="text-[13px] leading-7 font-semibold tracking-[-0.01em] text-white">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={matchSelectEnabled}
        onClick={toggle}
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-md transition-colors', matchSelectEnabled ? 'bg-button-primary' : 'bg-[#2F2F37] hover:bg-white/20')}
      >
        <img src="/icons/apply-change.svg" alt="" className="size-6" />
      </button>
    </div>
  );
}

/** Whether `MatchSelectRow` would render anything — exported so a caller that wraps the row in its
 * own dividers (`TextEditorPanel`) can skip those too when there's nothing between them. */
export function useMatchSelectVisible(targets: EditorTarget[]) {
  return useMatchSelectToggle(targets).visible;
}

/** One combined 6-up row (not two separate 3-up groups) sharing a single pill background — matches
 * the "Alignment" row's own spec: one `#26262C` strip, items flush against each other (no inner
 * gap), left/center/right followed directly by top/middle/bottom. */
const ALIGN_OPTIONS_ALL = [
  { value: 'left', icon: '/icons/edit_panel/layers-align-left.svg' },
  { value: 'center', icon: '/icons/edit_panel/layers-align-center.svg' },
  { value: 'right', icon: '/icons/edit_panel/layers-align-right.svg' },
  { value: 'top', icon: '/icons/edit_panel/layers-align-top.svg' },
  { value: 'middle', icon: '/icons/edit_panel/layers-align-middle.svg' },
  { value: 'bottom', icon: '/icons/edit_panel/layers-align-bottom.svg' },
] as const;

const AXIS_LABELS: Record<string, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
};

function AlignIconRow() {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-1 items-center rounded-md p-0.5" style={{ background: '#26262C' }}>
      {ALIGN_OPTIONS_ALL.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={t(AXIS_LABELS[opt.value] ?? opt.value)}
          className="flex h-6 flex-1 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <img src={opt.icon} alt="" className="size-4" />
        </button>
      ))}
    </div>
  );
}

const ANCHOR_ACTIVE = '#4570FF';
const ANCHOR_INACTIVE = '#50505D';

type PositionMode = 'smart' | 'anchored';
type VerticalAnchor = 'top' | 'bottom' | 'top-bottom' | 'center';
type HorizontalAnchor = 'left' | 'right' | 'left-right' | 'center';

const VERTICAL_ANCHOR_OPTIONS: { value: VerticalAnchor; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'top-bottom', label: 'Top + Bottom' },
  { value: 'center', label: 'Center' },
];
const HORIZONTAL_ANCHOR_OPTIONS: { value: HorizontalAnchor; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'left-right', label: 'Left + Right' },
  { value: 'center', label: 'Center' },
];

/**
 * The little edge-pin diagram shown in "anchored" mode — click a bar to pin that edge (mirrored in
 * the two dropdowns beside it). Purely decorative for now (no real anchor/pinning concept exists in
 * the layout engine yet): it's a self-contained preview of what pinning *would* look like.
 */
function AnchorEdgePicker({
  vertical,
  horizontal,
  onSetVertical,
  onSetHorizontal,
}: {
  vertical: VerticalAnchor;
  horizontal: HorizontalAnchor;
  onSetVertical: (v: VerticalAnchor) => void;
  onSetHorizontal: (h: HorizontalAnchor) => void;
}) {
  const topActive = vertical === 'top' || vertical === 'top-bottom';
  const bottomActive = vertical === 'bottom' || vertical === 'top-bottom';
  const leftActive = horizontal === 'left' || horizontal === 'left-right';
  const rightActive = horizontal === 'right' || horizontal === 'left-right';
  const showCenterDot = vertical === 'center' && horizontal === 'center';

  function selectCenter() {
    onSetVertical('center');
    onSetHorizontal('center');
  }

  return (
    <div className="relative flex shrink-0 items-center justify-center rounded-xl" style={{ width: 119, height: 80, background: '#26262C' }}>
      {/* Centered target rect — sized with enough margin that the 4 edge bars never touch it.
          Centered via the container's own flex centering (not hardcoded offsets) so it — and every
          bar below, each centered on its own cross-axis the same way — stays exactly centered
          regardless of the container's exact size. */}
      <button
        type="button"
        aria-label="Center"
        onClick={selectCenter}
        className="flex items-center justify-center rounded-md"
        style={{ width: 52, height: 34, background: '#2F2F37' }}
      >
        {showCenterDot && <div className="rounded-full" style={{ width: 16, height: 16, background: ANCHOR_ACTIVE }} />}
      </button>
      <button
        type="button"
        aria-label="Top"
        onClick={() => onSetVertical('top')}
        className="absolute rounded-full transition-colors"
        style={{ left: '50%', top: 9, width: 6, height: 14, transform: 'translateX(-50%)', background: topActive ? ANCHOR_ACTIVE : ANCHOR_INACTIVE }}
      />
      <button
        type="button"
        aria-label="Bottom"
        onClick={() => onSetVertical('bottom')}
        className="absolute rounded-full transition-colors"
        style={{ left: '50%', bottom: 9, width: 6, height: 14, transform: 'translateX(-50%)', background: bottomActive ? ANCHOR_ACTIVE : ANCHOR_INACTIVE }}
      />
      <button
        type="button"
        aria-label="Left"
        onClick={() => onSetHorizontal('left')}
        className="absolute rounded-full transition-colors"
        style={{ left: 9, top: '50%', width: 14, height: 6, transform: 'translateY(-50%)', background: leftActive ? ANCHOR_ACTIVE : ANCHOR_INACTIVE }}
      />
      <button
        type="button"
        aria-label="Right"
        onClick={() => onSetHorizontal('right')}
        className="absolute rounded-full transition-colors"
        style={{ right: 9, top: '50%', width: 14, height: 6, transform: 'translateY(-50%)', background: rightActive ? ANCHOR_ACTIVE : ANCHOR_INACTIVE }}
      />
    </div>
  );
}

const PREVIEW_SHAPES = ['square', 'vertical', 'horizontal'] as const;
type PreviewShape = (typeof PREVIEW_SHAPES)[number];
const PREVIEW_CYCLE_MS = 1400;

const PREVIEW_RECT_STYLE: Record<PreviewShape, CSSProperties> = {
  square: { left: 39, top: 39, width: 47, height: 47 },
  vertical: { left: 39, top: 10, width: 47, height: 109 },
  horizontal: { left: 9, top: 39, width: 108, height: 47 },
};

/** One frame of the hover flyout — the same anchor selection applied to a square/tall/wide "content
 * area", so the user can see how it holds up across aspect ratios before committing to it. */
function AnchorPreviewFrame({ shape, vertical, horizontal }: { shape: PreviewShape; vertical: VerticalAnchor; horizontal: HorizontalAnchor }) {
  const justify = horizontal === 'left' ? 'justify-start' : horizontal === 'right' ? 'justify-end' : 'justify-center';
  const align = vertical === 'top' ? 'items-start' : vertical === 'bottom' ? 'items-end' : 'items-center';
  return (
    <div className="relative size-[125px] shrink-0 overflow-hidden rounded-2xl border" style={{ background: '#26262C', borderColor: '#40404A' }}>
      <div
        className="absolute rounded-lg transition-all ease-in-out"
        style={{ ...PREVIEW_RECT_STYLE[shape], background: '#2F2F37', transitionDuration: '500ms' }}
      >
        {/* No transition needed here directly — flex alignment recalculates every frame as the
            parent rect above animates, so the square rides along smoothly for free. */}
        <div className={cn('flex size-full p-1', justify, align)}>
          <div className="size-6 shrink-0 rounded-[4px]" style={{ background: ANCHOR_ACTIVE }} />
        </div>
      </div>
    </div>
  );
}

/**
 * "Position" block shared by every editor panel — alignment-to-frame icons, X/Y readout, and the
 * position-mode picker (Smart, or Anchored to specific edges). Purely visual for now: nothing here
 * is wired to real behavior yet (no anchor/pinning concept exists in the layout engine), so every
 * control is a self-contained, no-op preview of what the interaction would look like.
 *
 * `showPositionMode` also doubles as "is this a primary size banner" — a sibling's own added sizes
 * never get the mode picker at all (see `isPrimaryBannerLayout`), so there's no "smart" default to
 * preserve for them; a primary defaults to Anchored (with its anchor picker already open) rather
 * than Smart, since anchoring — not cascading behavior — is what a primary's own position choice
 * is actually for.
 */
/**
 * The frame's own axis-aligned bounding box once `rotation` (degrees, pivoting around the frame's
 * own center — matches every renderer's plain `transform: rotate()`, see `useElementDrag`'s
 * `startRotate`) is applied: the center stays fixed, but a rotated rect's tightest enclosing
 * axis-aligned box is wider/taller than the rect itself, so its own top-left (what "Position"
 * means once the shape is tilted) shifts too, even though `frame.x`/`frame.y` themselves never do.
 */
function rotatedBoundingOrigin(frame: { x: number; y: number; w: number; h: number }, rotation: number) {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const boundingW = frame.w * cos + frame.h * sin;
  const boundingH = frame.w * sin + frame.h * cos;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  return { x: cx - boundingW / 2, y: cy - boundingH / 2 };
}

export function PositionSection({
  x,
  y,
  w = 0,
  h = 0,
  rotation = 0,
  showPositionMode = true,
  resetKey,
  extra,
}: {
  /** The frame's own unrotated top-left corner and size — `w`/`h` are only needed alongside
   * `rotation` to derive the rotated bounding box's origin shown below; omit both (or leave
   * `rotation` at 0) to show `x`/`y` as-is. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  showPositionMode?: boolean;
  /** Re-defaults `mode` (back to Anchored, for a primary) whenever this changes — pass the
   * selected element's own id so switching selection resets the preview instead of carrying over
   * whatever mode a previously-selected element was left in. */
  resetKey?: string;
  /** Extra rows (e.g. Rotation) rendered inside this same padded block, after everything else —
   * keeps a caller's own per-element row visually part of this one section (no divider, shared
   * top/bottom padding) instead of it being a separate sibling the parent has to pad itself. */
  extra?: ReactNode;
}) {
  const displayOrigin = rotation ? rotatedBoundingOrigin({ x, y, w, h }, rotation) : { x, y };
  const t = useT();
  const [mode, setMode] = useState<PositionMode>(showPositionMode ? 'anchored' : 'smart');
  const [vertical, setVertical] = useState<VerticalAnchor>('center');
  const [horizontal, setHorizontal] = useState<HorizontalAnchor>('center');
  const [showPreview, setShowPreview] = useState(false);
  const [previewShapeIndex, setPreviewShapeIndex] = useState(0);
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(showPositionMode ? 'anchored' : 'smart');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPositionMode, resetKey]);

  useEffect(() => {
    if (mode !== 'anchored') setShowPreview(false);
  }, [mode]);

  // Cycles the demo shape (square/vertical/horizontal) while the flyout is open, so the same
  // anchor selection's behavior across aspect ratios is visible without extra interaction.
  useEffect(() => {
    if (!showPreview) return;
    setPreviewShapeIndex(0);
    const id = window.setInterval(() => setPreviewShapeIndex((i) => (i + 1) % PREVIEW_SHAPES.length), PREVIEW_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [showPreview]);

  // Anchored to the panel's own left edge (8px gap) and top-aligned with the edge-pin diagram —
  // measured rather than laid out in flow, since the flyout renders outside the panel's own
  // scrollable box (see the `position: fixed` wrapper below).
  useLayoutEffect(() => {
    if (!showPreview) return;
    const panelEl = rootRef.current?.closest('[data-panel-card]') as HTMLElement | null;
    const anchorRect = anchorBoxRef.current?.getBoundingClientRect();
    const panelRect = panelEl?.getBoundingClientRect();
    if (!anchorRect || !panelRect) return;
    setFlyoutPos({ left: panelRect.left - 8 - 125, top: anchorRect.top });
  }, [showPreview]);

  // The flyout is a DOM descendant of the panel card (even though `position: fixed` renders it
  // visually outside it), so hovering the flyout itself never triggers this — only actually
  // leaving the panel (and the flyout) does.
  useEffect(() => {
    if (!showPreview) return;
    const panelEl = rootRef.current?.closest('[data-panel-card]');
    if (!panelEl) return;
    const handleLeave = () => setShowPreview(false);
    panelEl.addEventListener('mouseleave', handleLeave);
    return () => panelEl.removeEventListener('mouseleave', handleLeave);
  }, [showPreview]);

  return (
    <div ref={rootRef} className="flex flex-col gap-2 px-4 pt-2 pb-4">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Position')}</span>
        <IconSlot />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] leading-4 text-white/45">{t('Alignment')}</span>
        <div className="flex items-center gap-2">
          <AlignIconRow />
          <IconSlot />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] leading-4 text-white/65">{t('Position')}</span>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-7 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-[11px]">
              <span className="text-white/65">X</span>
              <span className="text-white">{Math.round(displayOrigin.x)}</span>
            </div>
            <div className="flex h-7 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-[11px]">
              <span className="text-white/65">Y</span>
              <span className="text-white">{Math.round(displayOrigin.y)}</span>
            </div>
          </div>
          <IconSlot />
        </div>
      </div>

      {/* Hover anywhere across this whole block (title, mode select, edge-pin picker) to preview —
          not just the mode dropdown itself. */}
      {showPositionMode && (
        <div className="flex flex-col gap-3" onMouseEnter={() => mode === 'anchored' && setShowPreview(true)}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] leading-4 text-white/65">{t('Position mode')}</span>
            <SelectField
              value={mode}
              onChange={(v) => setMode(v as PositionMode)}
              // `flex-1`'s default flex-basis of 0% only affects the *width* it competes for in a
              // row — reused here on a single field inside a `flex-col` parent, where height is the
              // main axis, it silently overrides the explicit height below back to content size, so
              // it needs canceling with `flex-none` for the height to actually take effect.
              triggerClassName="h-[35px] flex-none"
              options={[
                {
                  value: 'smart',
                  label: (
                    <span className="flex items-center gap-2">
                      <img src="/icons/edit_panel/position_smart.svg" alt="" className="size-4" />
                      {t('Smart')}
                    </span>
                  ),
                },
                {
                  value: 'anchored',
                  label: (
                    <span className="flex items-center gap-2">
                      <img src="/icons/edit_panel/position-anchored.svg" alt="" className="size-4" />
                      {t('Anchored')}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          {mode === 'anchored' && (
            <div className="flex items-start gap-2">
              <div ref={anchorBoxRef}>
                <AnchorEdgePicker vertical={vertical} horizontal={horizontal} onSetVertical={setVertical} onSetHorizontal={setHorizontal} />
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                <SelectField
                  value={vertical}
                  onChange={(v) => setVertical(v as VerticalAnchor)}
                  triggerClassName="h-[35px] flex-none"
                  icon="/icons/edit_panel/vertical.svg"
                  options={VERTICAL_ANCHOR_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                />
                <SelectField
                  value={horizontal}
                  onChange={(v) => setHorizontal(v as HorizontalAnchor)}
                  triggerClassName="h-[35px] flex-none"
                  icon="/icons/edit_panel/horizontal.svg"
                  options={HORIZONTAL_ANCHOR_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showPreview && flyoutPos && (
        <div className="pointer-events-none fixed z-50" style={{ left: flyoutPos.left, top: flyoutPos.top }}>
          <AnchorPreviewFrame shape={PREVIEW_SHAPES[previewShapeIndex]} vertical={vertical} horizontal={horizontal} />
        </div>
      )}

      {extra}
    </div>
  );
}

/** A fixed-width slot at a row's trailing edge — rendered (and taking up its space) whether or not
 * `children` is given, so a row's main content stays the same width all the way down a section
 * regardless of which particular rows happen to have a real icon there. */
export function IconSlot({ children }: { children?: ReactNode }) {
  return <div className="flex size-7 shrink-0 items-center justify-center">{children}</div>;
}

export function PanelSection({
  label,
  icon,
  trailing,
  children,
  style,
}: {
  label: string;
  icon?: ReactNode;
  /** Rendered in the header's own always-reserved trailing `IconSlot` — e.g. Border's +/- toggle. */
  trailing?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div data-panel-section className="flex flex-col gap-2 px-4 pt-2 pb-4" style={style}>
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-white">
          {icon}
          {label}
        </span>
        <IconSlot>{trailing}</IconSlot>
      </div>
      {children}
    </div>
  );
}

/** Small square icon tile that precedes a section label (e.g. "Text", "Image") in the content-only
 * template panels — `tone="amber"` matches the template accent used for the "Edit content" header. */
export function SectionIconBadge({ tone = 'default', children }: { tone?: 'default' | 'amber'; children: ReactNode }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-md"
      style={
        tone === 'amber'
          ? { background: 'rgba(234,178,46,0.2)' }
          : { background: '#26262C', border: '1px solid #40404A', boxShadow: '0px 1px 8px 1px rgba(0,0,0,0.24)' }
      }
    >
      {children}
    </span>
  );
}

/** Wraps an image preview so hovering it dims the image and surfaces a "Replace" pill on top —
 * shared by the template content panel and the multi-scene bulk panel's Image sections. */
export function ImageHoverReplace({ onReplace, children }: { onReplace: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="group/img relative overflow-hidden rounded-2xl">
      {children}
      <div
        className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/img:opacity-100"
        style={{ background: 'rgba(38,38,44,0.88)' }}
      >
        <button
          type="button"
          onClick={onReplace}
          className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] text-white transition-colors hover:brightness-110"
          style={{ background: '#4570FF', borderColor: '#40404A' }}
        >
          <RefreshCw className="size-3.5" />
          {t('Replace')}
        </button>
      </div>
    </div>
  );
}

export function PanelDivider() {
  return <div className="h-px w-full shrink-0" style={{ background: '#26262C' }} />;
}

/** Every Fill/Border/Style/Radius/Weight control in a panel using `InlineRow` shares this width so
 * their left edges line up — each one's natural content width differs (a color pill vs. a
 * segmented control vs. a number field), so without a shared width only their *right* edges
 * (pinned by the row's own `justify-between`) would ever align. */
export const INLINE_VALUE_COL_WIDTH = 151;

/** A "label left, control right, one row" field — shared by the banner panel and the per-element
 * panels (text/shape/image) for their Fill/Border/Style/Radius/Weight rows, distinct from the
 * other stacked `PanelSection` layout (label above, full-width content below). No horizontal
 * padding of its own — every caller already nests this inside a `px-4` parent (`PanelSection` or
 * an equivalent section wrapper), so adding it here too would double it. */
export function InlineRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="shrink-0 text-[9px] leading-4 text-white/65">{label}</span>
      {children}
    </div>
  );
}

/** Local "type to commit" state for a hex text field — mirrors the same draft/blur-commit/revert-
 * on-invalid pattern `ColorPickerPopover`'s own hex row uses, so typing a color code here behaves
 * identically to typing one inside the popover. */
function useHexDraft(color: string, onChange: (color: string) => void) {
  const gradient = isGradient(color);
  const [draft, setDraft] = useState(gradient ? '' : color);
  useEffect(() => setDraft(gradient ? '' : color), [color, gradient]);
  function commit() {
    if (isValidHex(draft)) onChange(draft.startsWith('#') ? draft.toUpperCase() : `#${draft.toUpperCase()}`);
    else setDraft(color);
  }
  return { gradient, draft, setDraft, commit };
}

/**
 * Local "type to commit" state for the opacity percentage shown next to a fill's hex code. There's
 * no per-fill alpha concept in the data model yet — like `PositionSection`'s alignment icons and
 * anchor preview elsewhere in this file, it's a self-contained, no-op preview of the control rather
 * than something wired to a real value, so typing a number here just clamps/redisplays it.
 */
function useOpacityDraft() {
  const [draft, setDraft] = useState('100');
  function commit() {
    setDraft(String(Math.round(Math.min(100, Math.max(0, Number(draft) || 0)))));
  }
  return { draft, setDraft, commit };
}

/** Fill/Border's value control — swatch, hex, and opacity all inside one pill, divided by a
 * hairline, rather than a separate swatch button beside a field (the shared `ColorRow`'s layout).
 * Passing `onClear` makes the fill optional: `color` may then be undefined ("no fill"), and the
 * picker gains a "no fill" preset to get back there. */
export function InlineColorField({
  color,
  onChange,
  onClear,
  width = INLINE_VALUE_COL_WIDTH,
  compact,
  opacity: opacityValue,
  onOpacityCommit,
}: {
  color: string | undefined;
  onChange: (color: string) => void;
  onClear?: () => void;
  /** Overrides the shared `INLINE_VALUE_COL_WIDTH` pill width — e.g. the Text panel's own Text
   * fill/Shape fill rows, which split their row into two columns instead. Pass `'flex-1'` (instead
   * of a pixel number) to grow and fill whatever space is left in a flex row alongside a sibling —
   * a literal `width: '100%'` style doesn't account for that sibling at all and overflows past it,
   * since percentage sizing on a flex item is resolved against the row's own full width, not
   * "100% of what's left over" the way `flex-grow` is. */
  width?: number | 'flex-1';
  /** Squeezes the internal padding/gaps and tightens the hex text's own letter-spacing — needed at
   * any width under ~140px or the hex + opacity text won't fit. Defaults to on for `width:
   * 'flex-1'`, but can also be forced on for a fixed pixel width that's just as tight (the Border
   * section's own 100.5px columns, say) — pass `false` to opt back out at a width narrow enough
   * that it would otherwise default to on. */
  compact?: boolean;
  /** A real, persisted opacity (and its commit handler) — e.g. the Shadow section's own
   * `shadow.opacity`. Pass both together to wire the pill's opacity field up for real; omit both
   * (the common case — Text/Shape fill, Border color — none of which have a real per-fill alpha in
   * the data model yet) and the opacity shown stays a decorative, un-wired draft, same as
   * `PositionSection`'s own anchor picker elsewhere in this file. */
  opacity?: number;
  onOpacityCommit?: (value: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hex = useHexDraft(color ?? '', onChange);
  const decorativeOpacity = useOpacityDraft();
  const wired = opacityValue !== undefined && onOpacityCommit !== undefined;
  const [realOpacityDraft, setRealOpacityDraft] = useState(String(opacityValue ?? 100));
  useEffect(() => setRealOpacityDraft(String(opacityValue ?? 100)), [opacityValue]);
  const opacity = wired
    ? { draft: realOpacityDraft, setDraft: setRealOpacityDraft, commit: () => onOpacityCommit!(realOpacityDraft) }
    : decorativeOpacity;
  const active = open || focused;
  const isCompact = compact ?? width === 'flex-1';
  return (
    <div
      className={cn(
        'flex h-7 items-center justify-between rounded-lg border transition-colors',
        isCompact ? 'min-w-0 gap-0.5 px-0.5' : 'px-3',
        // flex-1 (flex-basis: 0%) only makes sense when this field is meant to grow along a row's
        // horizontal main axis (width === 'flex-1'). Applying it unconditionally broke fixed-width
        // compact fields (Border/Shadow Color) nested in a flex-col wrapper, where flex-basis hijacks
        // *vertical* sizing and collapses the pill below its explicit h-7 height.
        width === 'flex-1' ? 'flex-1' : 'shrink-0',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: width === 'flex-1' ? undefined : width,
        background: active || hovered ? FIELD_HOVER_BG : '#26262C',
        borderColor: active ? FIELD_ACTIVE_BORDER : 'transparent',
      }}
    >
      <div className={cn('flex min-w-0 items-center', isCompact ? 'gap-0.5' : 'gap-2')}>
        {/* Opens on white when there's no fill yet, so the first drag in the picker lands on a real color. */}
        <ColorPickerPopover color={color ?? '#FFFFFF'} onChange={onChange} onClear={onClear} onOpenChange={setOpen}>
          {color ? (
            <button type="button" aria-label={t('Color')} className="size-4 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
          ) : (
            <button type="button" aria-label={t('No fill')} className="shrink-0">
              <img src="/icons/no-fill%2016.svg" alt="" className="size-4" />
            </button>
          )}
        </ColorPickerPopover>
        {hex.gradient ? (
          <span className="truncate text-[11px] text-white uppercase">{t('Linear')}</span>
        ) : (
          <input
            value={hex.draft}
            onChange={(e) => hex.setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              hex.commit();
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder={t('No fill')}
            className={cn(
              'w-full min-w-0 bg-transparent text-[11px] text-white uppercase outline-none placeholder:normal-case placeholder:text-white/45',
              isCompact && 'tracking-tighter',
            )}
          />
        )}
      </div>
      <div className={cn('flex shrink-0 items-center', isCompact ? 'gap-0.5' : 'gap-2', !color && 'invisible')}>
        <div className="h-4 w-px shrink-0" style={{ background: '#40404A' }} />
        <div className="flex shrink-0 items-center">
          <input
            value={opacity.draft}
            onChange={(e) => opacity.setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              opacity.commit();
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={cn('bg-transparent text-right text-[11px] text-white/65 outline-none', isCompact ? 'w-4 tracking-tighter' : 'w-5')}
          />
          <span className="text-[11px] text-white/65">%</span>
        </div>
      </div>
    </div>
  );
}

export function ColorRow({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const hex = useHexDraft(color, onChange);
  const opacity = useOpacityDraft();
  const active = open || focused;
  return (
    <div className="flex items-center gap-2">
      <ColorPickerPopover color={color} onChange={onChange} onOpenChange={setOpen}>
        <button type="button" aria-label={t('Color')} className="size-8 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
      </ColorPickerPopover>
      <div
        className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-chrome-border bg-chrome-border-subtle px-3 text-sm text-chrome-fg transition-colors"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: active || hovered ? FIELD_HOVER_BG : undefined,
          borderColor: active ? FIELD_ACTIVE_BORDER : undefined,
        }}
      >
        {/* A gradient's own CSS string is an implementation detail, not something worth spelling
            out in full here — "Linear" names the fill kind the same way a hex value names a color. */}
        {hex.gradient ? (
          <span className="flex-1 truncate uppercase">{t('Linear')}</span>
        ) : (
          <input
            value={hex.draft}
            onChange={(e) => hex.setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              hex.commit();
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full min-w-0 flex-1 bg-transparent uppercase outline-none"
          />
        )}
        <div className="flex shrink-0 items-center text-white/45">
          <input
            value={opacity.draft}
            onChange={(e) => opacity.setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              opacity.commit();
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-6 bg-transparent text-right outline-none"
          />
          <span>%</span>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_SHADOW: ShadowStyle = { enabled: true, x: 0, y: 4, blur: 4, color: '#000000', opacity: 100 };

/** Enable/disable control for a shadow row — a +/- icon button matching the Border section's own
 * add/remove convention, rather than the on/off switch this used to be. */
function ShadowToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={checked ? `Remove ${label}` : `Add ${label}`}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      {checked ? <Minus className="size-4" /> : <Plus className="size-4" />}
    </button>
  );
}

/** An editable "X"/"Y" pill matching the read-only Position section's own X/Y fields elsewhere in
 * these panels (label at 65% opacity, 11px value, same `#26262C` pill) — this one just has a real
 * `<input>` instead of a static span, with the same drag-to-scrub every other number field here has. */
function LabeledNumberInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useScrubDrag(Number(value) || 0, onCommit);
  const [focused, setFocused] = useState(false);
  const active = focused || scrub.dragging;
  const highlighted = active || scrub.hovered;
  return (
    <div
      className="flex h-7 w-full items-center gap-2 rounded-md border px-3 text-[11px] transition-colors"
      onMouseDown={(e) => scrub.handleMouseDown(e, inputRef.current)}
      onMouseEnter={() => scrub.setHovered(true)}
      onMouseLeave={() => scrub.setHovered(false)}
      style={{ background: highlighted ? FIELD_HOVER_BG : '#26262C', borderColor: active ? FIELD_ACTIVE_BORDER : 'transparent', cursor: highlighted ? SCRUB_CURSOR : undefined }}
    >
      <span className="shrink-0 text-white/65">{label}</span>
      <input
        ref={inputRef}
        defaultValue={value}
        key={value}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          onCommit(e.target.value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-0 min-w-0 flex-1 bg-transparent text-white outline-none"
      />
    </div>
  );
}

/** The Shadow section's own row shape — a fixed ~101.5px label column and ~101.5px value column
 * (matching the Border section's own equal-column rows), plus the same reserved trailing `IconSlot`
 * every row in these panels gets: 101.5 + 8 (gap) + 101.5 + 8 (gap) + 28 (icon) = 247px, exactly
 * this panel's own standard content width — so this row needs that full width, same as every other
 * row, with nothing else (like a left indent) eating into it first. `children` can be one field
 * (Blur, Color) or a small vertical stack of them (Position's X then Y), which is why the value
 * column is its own flex-col rather than assuming a single child. `align="start"` top-aligns the
 * label with the first value field instead of centering it against the whole stack — Position's own
 * "X" row, specifically, rather than sitting centered between X and Y. */
/** The shared 101.5px/101.5px two-column row — a label and its field(s), plus the panel's usual
 * trailing 28px reserved slot. Used by Shadow (Position/Blur/Color), the Shape/Image Border section,
 * and the Radius row below; `trailing` fills that slot with a real control (e.g. Radius's
 * all/per-corner toggle) instead of leaving it empty. */
export function GridFieldRow({
  label,
  children,
  align = 'center',
  trailing,
}: {
  label: string;
  children: ReactNode;
  align?: 'start' | 'center';
  trailing?: ReactNode;
}) {
  return (
    <div className={cn('flex gap-2', align === 'start' ? 'items-start' : 'items-center')}>
      <div className={cn('grid min-w-0 flex-1 grid-cols-[101.5px_101.5px] gap-2', align === 'start' ? 'items-start' : 'items-center')}>
        <span className="text-[9px] leading-4 text-white/65">{label}</span>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
      <IconSlot>{trailing}</IconSlot>
    </div>
  );
}

/** A self-contained Rotation row — matches dragging just outside a selected element's corner handle.
 * Shared by Text/Shape/Image (via `PositionSection`'s `extra` slot) so all three stay pixel-identical. */
export function RotationRow({ rotation, onCommit }: { rotation: number; onCommit: (value: number) => void }) {
  const t = useT();
  const rotationField = useFieldHighlight();
  const rotationRounded = Math.round(rotation ?? 0);
  const [rotationDraft, setRotationDraft] = useState(String(rotationRounded));
  useEffect(() => setRotationDraft(String(rotationRounded)), [rotationRounded]);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] leading-4 text-white/65">{t('Rotation')}</span>
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 shrink-0 items-center gap-2 rounded-lg border px-3 text-[11px] transition-colors"
          onMouseEnter={() => rotationField.setHovered(true)}
          onMouseLeave={() => rotationField.setHovered(false)}
          style={{ width: 105, ...fieldHighlightStyle(rotationField.hovered, rotationField.focused) }}
        >
          <img src="/icons/angle.svg" alt="" className="size-4 shrink-0" />
          {/* The number and ° are nested in their own gap-less flex group — the parent's own
              `gap-2` (meant for the icon-to-value spacing) was landing between them too when
              they were plain siblings of it. */}
          <div className="flex shrink-0 items-center">
            {/* Exact-width auto-sizing via an invisible mirror span that sets the wrapper's own
                size through normal text flow, with the input absolutely positioned over it so it
                never contributes its own (much wider) intrinsic size to that calculation. */}
            <span className="relative inline-block shrink-0">
              <span className="invisible whitespace-pre">{rotationDraft || '0'}</span>
              <input
                type="text"
                value={rotationDraft}
                onChange={(e) => setRotationDraft(e.target.value)}
                onFocus={() => rotationField.setFocused(true)}
                onBlur={(e) => {
                  rotationField.setFocused(false);
                  onCommit(Number(e.target.value) || 0);
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="absolute inset-0 w-full bg-transparent text-white outline-none"
              />
            </span>
            <span className="shrink-0 text-white">°</span>
          </div>
        </div>
        <IconSlot />
      </div>
    </div>
  );
}

function ShadowRow({
  icon,
  label,
  shadow,
  onChange,
}: {
  icon: string;
  label: string;
  shadow: ShadowStyle | undefined;
  onChange: (next: ShadowStyle) => void;
}) {
  const t = useT();
  const enabled = shadow?.enabled ?? false;
  const current = shadow ?? DEFAULT_SHADOW;

  function patch(fields: Partial<ShadowStyle>) {
    onChange({ ...current, ...fields, enabled: true });
  }

  return (
    <div className="flex flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2">
        <img src={icon} alt="" className="size-4 shrink-0" />
        <span className={cn('flex-1 truncate text-[11px] tracking-[-0.01em]', enabled ? 'text-white' : 'text-white/65')}>{label}</span>
        <ShadowToggle checked={enabled} onChange={(next) => onChange({ ...current, enabled: next })} label={label} />
      </div>
      {/* No left indent — unlike before this redesign, each row now needs the full standard
          247px content width (101.5 + 8 + 101.5 + 8 + 28), the same every other row in this panel
          gets; an indent here would eat into that budget and leave the reserved icon slot short of
          its own proper 16px clearance from the panel's own right edge. */}
      {enabled && (
        <div className="flex flex-col gap-2 pb-1">
          <GridFieldRow label={t('Position')} align="start">
            <LabeledNumberInput label="X" value={String(current.x)} onCommit={(v) => patch({ x: Math.round(Number(v) || 0) })} />
            <LabeledNumberInput label="Y" value={String(current.y)} onCommit={(v) => patch({ y: Math.round(Number(v) || 0) })} />
          </GridFieldRow>

          <GridFieldRow label={t('Blur')}>
            <IconNumberField
              scrubbable
              icon="/icons/blur%2016.svg"
              className="w-full"
              value={String(current.blur)}
              onCommit={(v) => patch({ blur: Math.max(0, Math.round(Number(v) || 0)) })}
            />
          </GridFieldRow>

          {/* Same color field style as Border/Styles — swatch + hex + opacity in one pill, not the
              separate swatch-button + opacity-box this used to be. */}
          <GridFieldRow label={t('Color')}>
            <InlineColorField
              color={current.color}
              onChange={(color) => patch({ color })}
              opacity={current.opacity}
              onOpacityCommit={(v) => patch({ opacity: Math.min(100, Math.max(0, Math.round(Number(v) || 0))) })}
              width={101.5}
              compact
            />
          </GridFieldRow>
        </div>
      )}
    </div>
  );
}

/** Text/Shape/Image editor panels' own "Shadow" section — Drop shadow renders as a real CSS
 * `box-shadow` (or `text-shadow` on text, which has no `inset` mode, so Inner shadow is a stored
 * no-op there) via ElementRenderer; see src/lib/shadow.ts for how the two combine. */
export function ShadowSection({
  dropShadow,
  innerShadow,
  onPatch,
}: {
  dropShadow: ShadowStyle | undefined;
  innerShadow: ShadowStyle | undefined;
  onPatch: (patch: { dropShadow?: ShadowStyle; innerShadow?: ShadowStyle }) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1 px-4 pt-2 pb-4">
      <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Shadow')}</span>
      <div className="flex flex-col gap-1">
        <ShadowRow icon="/icons/shadow-outer.svg" label={t('Drop shadow')} shadow={dropShadow} onChange={(next) => onPatch({ dropShadow: next })} />
        <ShadowRow icon="/icons/shadow-inner.svg" label={t('Inner shadow')} shadow={innerShadow} onChange={(next) => onPatch({ innerShadow: next })} />
      </div>
    </div>
  );
}

export const BORDER_STYLE_ICONS: Record<'none' | 'solid' | 'dashed' | 'dotted', string> = {
  none: '/icons/edit_panel/border-none%2016.svg',
  solid: '/icons/edit_panel/border-solid%2016.svg',
  dashed: '/icons/edit_panel/border-dashed%2016.svg',
  dotted: '/icons/edit_panel/border-dotted%2016.svg',
};

type SolidBorderStyle = 'solid' | 'dashed' | 'dotted';
const BORDER_STYLE_LABELS: Record<SolidBorderStyle, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/** The collapsed-by-default "+ Border" row (Style/Color/Weight once expanded) — shared by
 * ShapeEditorPanel and VectorPathPanel so the two panels' Border sections never drift apart. Starts
 * expanded only if the style it's handed already has a border, same lazy-init convention the text
 * panel's own Border section uses. */
export function BorderSection({ style, onPatch }: { style: LayoutElement['style']; onPatch: (patch: Partial<LayoutElement['style']>) => void }) {
  const t = useT();
  const [borderExpanded, setBorderExpanded] = useState(() => (style.strokeWidth ?? 0) > 0);
  const strokeStyle: SolidBorderStyle = style.strokeStyle ?? 'solid';

  function toggleBorder() {
    if (borderExpanded) {
      onPatch({ strokeWidth: 0 });
      setBorderExpanded(false);
    } else {
      onPatch({ strokeWidth: style.strokeWidth || 1, strokeStyle: style.strokeStyle ?? 'solid' });
      setBorderExpanded(true);
    }
  }

  const borderStyleOptions: { value: SolidBorderStyle; label: string; icon: ReactNode }[] = (['solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Border')}</span>
        <button
          type="button"
          aria-label={borderExpanded ? t('Remove border') : t('Add border')}
          onClick={toggleBorder}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {borderExpanded ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>
      {borderExpanded && (
        <div className="flex flex-col gap-2">
          <GridFieldRow label={t('Style')}>
            <SegmentedControl options={borderStyleOptions} value={strokeStyle} onChange={(v) => onPatch({ strokeStyle: v })} />
          </GridFieldRow>

          <GridFieldRow label={t('Color')}>
            <InlineColorField color={style.strokeColor ?? '#000000'} onChange={(strokeColor) => onPatch({ strokeColor })} width={101.5} compact />
          </GridFieldRow>

          <GridFieldRow label={t('Weight')}>
            <NumberField
              scrubbable
              className="w-full bg-[#26262C] text-[11px] font-normal"
              value={String(style.strokeWidth ?? 1)}
              onCommit={(v) => onPatch({ strokeWidth: Math.max(0, Number(v) || 0) })}
            />
          </GridFieldRow>
        </div>
      )}
    </div>
  );
}

// Reused for every corner via CSS rotation (see the per-corner radius row below) — one asset, four orientations.
const CORNER_ROTATIONS = [0, 90, -90, -180];

/** The custom left/right drag glyph shown while hovering or actively scrubbing a number field —
 * `ew-resize` is the fallback for any browser that can't load the custom cursor image. */
const SCRUB_CURSOR = "url('/icons/drag-cursor.svg') 16 16, ew-resize";

/** Shared highlight colors for every editable pill across these panels — hovering alone (not yet
 * editing) tints just the background; actively editing (focused), dragging to scrub, or having a
 * color picker open additionally outlines the pill in blue. Exported so the per-panel bespoke
 * fields (Size/Rotation in Image/Shape/Text) can match without duplicating the literals. */
export const FIELD_HOVER_BG = '#2F2F37';
export const FIELD_ACTIVE_BORDER = '#4570FF';

/** Hover/focus tracking for the bespoke Size/Rotation pills (Image/Shape/Text panels), which are
 * plain `<input>`s with no drag-to-scrub — just enough state to tint on hover and outline on focus,
 * matching every other editable pill without pulling those fields onto `useScrubDrag`. */
export function useFieldHighlight() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return { hovered, setHovered, focused, setFocused };
}

/** `style` for a pill using `useFieldHighlight`'s state — background tints on hover or while
 * active, border stays transparent until active so the pill's size never shifts. */
export function fieldHighlightStyle(hovered: boolean, focused: boolean) {
  return {
    background: hovered || focused ? FIELD_HOVER_BG : '#26262C',
    borderColor: focused ? FIELD_ACTIVE_BORDER : 'transparent',
  };
}

/**
 * Shared drag-to-scrub mechanics for a plain number input (border weight, shadow position/blur/
 * opacity, ...) — mousedown-and-drag left/right adjusts `currentValue` 1:1 with however many px the
 * cursor has moved, tracked at the window level so the drag keeps working once the cursor leaves the
 * field. Hands the raw next value to `onCommit` as a string — the same shape a plain typed edit
 * already produces — so whatever clamping that field's own commit handler does for a typed value
 * (0+ for a weight, 0-100 for an opacity, unclamped for a signed shadow offset, ...) applies here
 * too, without this hook needing to know that range itself. A press that never moves past a few px
 * still resolves as a normal click, so the field stays directly typable. Doesn't touch hover/cursor
 * styling itself — callers read back `hovered`/`dragging` to render that however fits their own
 * layout (a bare input vs. one with a leading label inside the same box).
 */
function useScrubDrag(currentValue: number, onCommit: (value: string) => void, step: number = 1) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  function handleMouseDown(e: ReactMouseEvent, blurTarget: HTMLElement | null) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startValue = currentValue;
    let moved = false;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 3) {
        moved = true;
        setDragging(true);
        // Drops the caret/selection before the drag takes over, same reasoning as the radius
        // field's own scrub — a drag across the page shouldn't also drag out a text selection.
        blurTarget?.blur();
        document.body.style.cursor = SCRUB_CURSOR;
      }
      if (moved) {
        ev.preventDefault();
        const next = startValue + dx * step;
        // A sub-1 step (line height's own 0.01-per-px) needs real decimal precision — rounding
        // that to the nearest whole number the way every other field's step=1 already does would
        // make it impossible to land on anything but whole multiples.
        onCommit(String(step < 1 ? Math.round(next * 100) / 100 : Math.round(next)));
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { hovered, setHovered, dragging, handleMouseDown };
}

/**
 * A number field that doubles as a drag-to-scrub control — mousedown-and-drag left/right adjusts
 * the value 1:1 with however many px the cursor has moved from where the drag started, tracked via
 * window-level listeners so a fast drag isn't capped by the field's own small width (the cursor can
 * leave it entirely and the drag keeps tracking). A press that never moves past a few px still
 * resolves as a normal click, so the field stays directly typable too. Hovering (or actively
 * dragging) swaps the background to `#2F2F37` and the cursor to `SCRUB_CURSOR`, so the affordance
 * reads the same everywhere this is used. While actively dragging, the cursor is set on `body`
 * (not just this field) so it stays the drag glyph even once the mouse has left the field, matching
 * how the drag itself keeps tracking past the field's own edge.
 */
function ScrubbableNumberField({
  value,
  max,
  onCommit,
  icon,
  wrapperClassName,
  inputClassName,
}: {
  value: number;
  max: number;
  onCommit: (value: number) => void;
  /** An optional leading icon inside the same hover/drag-highlighted pill (the per-corner fields'
   * own orientation glyph) — absent for the plain uniform field, which is just the input itself. */
  icon?: ReactNode;
  wrapperClassName: string;
  inputClassName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  function handleMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startValue = value;
    let moved = false;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 3) {
        moved = true;
        setDragging(true);
        // Drops the caret/selection before the drag takes over, so dragging across the page never
        // also drags out a native text selection underneath it.
        inputRef.current?.blur();
        document.body.style.cursor = SCRUB_CURSOR;
      }
      if (moved) {
        ev.preventDefault();
        onCommit(Math.round(Math.min(max, Math.max(0, startValue + dx))));
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const active = focused || dragging;
  const highlighted = active || hovered;

  return (
    <div
      className={wrapperClassName}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: highlighted ? FIELD_HOVER_BG : undefined,
        border: `1px solid ${active ? FIELD_ACTIVE_BORDER : 'transparent'}`,
        cursor: highlighted ? SCRUB_CURSOR : undefined,
      }}
    >
      {icon}
      <input
        ref={inputRef}
        defaultValue={String(value)}
        key={value}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          onCommit(Math.min(max, Math.max(0, Number(e.target.value) || 0)));
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={inputClassName}
      />
    </div>
  );
}

/** "Radius" row shared by the text/shape/image panels — the trailing toggle (one static icon,
 * same in both states, per spec) flips between a single uniform field and four per-corner fields
 * below it, each its own 101.5px pill in a 2-column grid (same track widths as every other field
 * row in this panel). The four fields are still decorative (no per-corner radius concept exists in
 * the layout engine yet) — dragging/typing the uniform field above overwrites all four's own local
 * state to match, the same way it always overwrites the one real `value` this row is wired to;
 * typing the same value into every corner likewise folds back into that one real value. */
export function CornerRadiusRow({
  value,
  onCommit,
  max,
  allowIndividual = true,
  layout = 'grid',
}: {
  value: number;
  onCommit: (value: number) => void;
  max: number;
  /** A vector's joints have no fixed "4 corners" to split a uniform radius across — the per-corner
   * toggle (and whatever it would even mean here) doesn't apply, so this hides it rather than
   * leaving a control with nothing real to do. The toggle's own slot still reserves the same width
   * in its place either way, so the field doesn't grow to fill the gap. */
  allowIndividual?: boolean;
  /** 'grid' (default, unchanged) is `GridFieldRow`'s own fixed label|field halves — what Text/Image
   * panels still use. 'stacked' puts the label on its own line above a field that spans the row's
   * full width, matching Fill's own layout in `ShapeEditorPanel`/`VectorPathPanel`. */
  layout?: 'grid' | 'stacked';
}) {
  const t = useT();
  const [individual, setIndividual] = useState(false);
  const [corners, setCorners] = useState<number[]>([value, value, value, value]);
  const isMixed = individual && corners.some((v) => v !== corners[0]);

  function commitUniform(next: number) {
    onCommit(next);
    setCorners([next, next, next, next]);
  }

  function commitCorner(index: number, next: number) {
    setCorners((prev) => {
      const nextCorners = prev.map((v, i) => (i === index ? next : v));
      if (nextCorners.every((v) => v === nextCorners[0])) onCommit(nextCorners[0]);
      return nextCorners;
    });
  }

  const toggleButton = allowIndividual ? (
    <button
      type="button"
      aria-label={individual ? t('Uniform radius') : t('Per-corner radius')}
      aria-pressed={individual}
      onClick={() => setIndividual((v) => !v)}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
    >
      <img src="/icons/radius_4.svg" alt="" className="size-4" />
    </button>
  ) : undefined;

  const field = isMixed ? (
    <div className="flex h-7 w-full items-center gap-2 rounded-md bg-[#26262C] px-3 text-[11px] text-white transition-colors">
      <img src="/icons/radius-all%2016.svg" alt="" className="size-4 shrink-0" style={{ opacity: 0.45 }} />
      <span className="min-w-0 flex-1 truncate">{t('Mixed')}</span>
    </div>
  ) : (
    <IconNumberField
      scrubbable
      icon="/icons/radius-all%2016.svg"
      iconStyle={{ opacity: 0.45 }}
      className="w-full"
      value={String(value)}
      onCommit={(raw) => commitUniform(Math.max(0, Math.min(max, Math.round(Number(raw) || 0))))}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {layout === 'stacked' ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/65">{t('Radius')}</span>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{field}</div>
            <IconSlot>{toggleButton}</IconSlot>
          </div>
        </div>
      ) : (
        <GridFieldRow label={t('Radius')} trailing={toggleButton}>
          {field}
        </GridFieldRow>
      )}
      {individual && (
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-[101.5px_101.5px] gap-2">
            {CORNER_ROTATIONS.map((deg, idx) => (
              <ScrubbableNumberField
                key={idx}
                value={corners[idx]}
                max={max}
                onCommit={(next) => commitCorner(idx, next)}
                icon={<img src="/icons/edit_panel/radius-each%20corner.svg" alt="" className="size-3.5 shrink-0" style={{ transform: `rotate(${deg}deg)` }} />}
                wrapperClassName="flex h-7 items-center justify-center gap-2 rounded-md bg-[#26262C] px-3 transition-colors"
                inputClassName="w-0 min-w-0 flex-1 bg-transparent text-center text-[11px] font-normal text-white outline-none"
              />
            ))}
          </div>
          <IconSlot />
        </div>
      )}
    </div>
  );
}

export function OpacityRow({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#26262C]">
        <img src="/icons/edit_panel/opacity%2016.svg" alt="" className="size-4" />
      </div>
      <div className="flex h-8 flex-1 items-center gap-1 rounded-lg border border-chrome-border bg-chrome-border-subtle px-3 text-sm text-chrome-fg">
        <input
          type="text"
          defaultValue={value}
          key={value}
          onBlur={(e) => onCommit(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-8 flex-1 bg-transparent text-right outline-none"
        />
        <span className="shrink-0 text-white/45">%</span>
      </div>
    </div>
  );
}

export function NumberField({
  value,
  onCommit,
  className,
  scrubbable = false,
  scrubStep = 1,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  /** Opts into the same drag-to-scrub behavior as the radius/shadow fields — off by default since
   * plenty of this component's callers (font size, letter spacing, ...) weren't asked to scrub. */
  scrubbable?: boolean;
  /** How much the value changes per px dragged — 1 (the default) for a plain px/percent/whole-
   * number field; a sub-1 value (line height's own 0.01) for a field whose whole usable range would
   * otherwise blow past in a few px. */
  scrubStep?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useScrubDrag(Number(value) || 0, onCommit, scrubStep);
  const [focused, setFocused] = useState(false);
  const active = focused || scrub.dragging;
  const highlighted = active || scrub.hovered;
  return (
    <input
      ref={inputRef}
      defaultValue={value}
      key={value}
      onMouseDown={scrubbable ? (e) => scrub.handleMouseDown(e, inputRef.current) : undefined}
      onMouseEnter={() => scrub.setHovered(true)}
      onMouseLeave={() => scrub.setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false);
        onCommit(e.target.value);
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      style={{
        background: highlighted ? FIELD_HOVER_BG : undefined,
        borderColor: active ? FIELD_ACTIVE_BORDER : 'transparent',
        cursor: scrubbable && scrub.hovered ? SCRUB_CURSOR : undefined,
      }}
      className={cn(
        'flex h-7 items-center rounded-md border bg-chrome-border-subtle px-3 text-center text-base font-bold text-chrome-fg outline-none transition-colors',
        className,
      )}
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    // 2px padding on all 4 sides + 24px buttons = 28px total — was 2px padding + 28px buttons
    // (32px total), taller than every other 28px field in these panels.
    <div className="flex items-center gap-0.5 rounded-lg bg-chrome-border-subtle p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex h-6 flex-1 items-center justify-center rounded-md text-white/70 transition-colors',
            opt.value === value ? 'bg-[#131316] text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)]' : 'hover:bg-white/5',
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

/** A single pill (icon + value sharing one background/border, not a bare icon beside a separately
 * boxed `NumberField`) — matches every other icon-leading field in this panel (Rotation, Padding).
 * `icon` is usually an asset path, rendered as an `<img>` — but a couple of fields (e.g. rotation)
 * have no matching 16px asset yet, so a `ReactNode` (a lucide icon) is accepted directly too. */
export function IconNumberField({
  icon,
  iconStyle,
  value,
  onCommit,
  scrubbable = false,
  scrubStep = 1,
  unit,
  title,
  className,
}: {
  icon: string | ReactNode;
  /** Only meaningful when `icon` is an asset path — e.g. rotating a reused glyph 90° for a
   * vertical variant (the group panel's own gap field). */
  iconStyle?: CSSProperties;
  value: string;
  onCommit: (value: string) => void;
  scrubbable?: boolean;
  scrubStep?: number;
  /** A fixed, non-editable suffix shown after the value (e.g. "px") — purely a display label, never
   * part of the editable text or the committed value itself. */
  unit?: string;
  title?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useScrubDrag(Number(value) || 0, onCommit, scrubStep);
  const [focused, setFocused] = useState(false);
  const active = focused || scrub.dragging;
  const highlighted = active || scrub.hovered;
  return (
    <div
      title={title}
      className={cn('flex h-7 items-center gap-2 rounded-md border px-3 text-[11px] text-white transition-colors', className)}
      onMouseDown={scrubbable ? (e) => scrub.handleMouseDown(e, inputRef.current) : undefined}
      onMouseEnter={() => scrub.setHovered(true)}
      onMouseLeave={() => scrub.setHovered(false)}
      style={{ background: highlighted ? FIELD_HOVER_BG : '#26262C', borderColor: active ? FIELD_ACTIVE_BORDER : 'transparent', cursor: scrubbable && scrub.hovered ? SCRUB_CURSOR : undefined }}
    >
      {typeof icon === 'string' ? <img src={icon} alt="" className="size-4 shrink-0" style={iconStyle} /> : <span className="flex size-4 shrink-0 items-center justify-center text-white/70">{icon}</span>}
      <input
        ref={inputRef}
        defaultValue={value}
        key={value}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          onCommit(e.target.value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-0 min-w-0 flex-1 bg-transparent text-white outline-none"
      />
      {unit && <span className="shrink-0 text-white/45">{unit}</span>}
    </div>
  );
}

export function PopoverMenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <PopoverClose asChild>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-8 shrink-0 items-center rounded-md px-3 text-left text-sm whitespace-nowrap transition-colors hover:bg-white/10',
          active ? 'text-white' : 'text-white/70',
        )}
      >
        {children}
      </button>
    </PopoverClose>
  );
}

export function SelectField({
  value,
  options,
  onChange,
  triggerClassName,
  icon,
}: {
  value: string;
  options: { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
  triggerClassName?: string;
  /** A fixed icon shown on the trigger regardless of which option is selected — e.g. marking which
   * axis a dropdown controls, as opposed to an icon baked into each option's own label. */
  icon?: string;
}) {
  const activeLabel = options.find((o) => o.value === value)?.label ?? value;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-7 flex-1 items-center gap-2 rounded-lg border border-transparent bg-chrome-border-subtle px-3 text-[11px] text-chrome-fg',
            triggerClassName,
          )}
        >
          {icon && <img src={icon} alt="" className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-white/45" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[220px] border-chrome-border bg-[#26262C]/95 p-1 text-chrome-fg backdrop-blur-lg">
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {options.map((opt) => (
            <PopoverClose asChild key={opt.value}>
              <button
                type="button"
                onClick={() => onChange(opt.value)}
                className={cn(
                  'flex h-8 shrink-0 items-center rounded-md px-3 text-left text-sm transition-colors hover:bg-white/10',
                  opt.value === value ? 'text-white' : 'text-white/70',
                )}
              >
                {opt.label}
              </button>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const EXPORT_FILE_TYPES: ExportFileType[] = ['PNG', 'JPG'];
const EXPORT_SCALES: ExportScale[] = [1, 2];

/** The footer's own format dropdown — shares its row (and width) evenly with the scale dropdown
 * beside it, distinct from the shared `SelectField` (which has a border that doesn't fit this
 * row's borderless look). */
function ExportFormatSelect({ value, onChange }: { value: ExportFileType; onChange: (value: ExportFileType) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 flex-1 items-center justify-between rounded-lg px-3 text-xs text-white" style={{ background: '#26262C' }}>
          <span>{value}</span>
          <ChevronDown className="size-3.5 shrink-0 text-white/45" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[139px] border-chrome-border bg-[#26262C]/95 p-1 text-chrome-fg backdrop-blur-lg">
        <div className="flex flex-col gap-0.5">
          {EXPORT_FILE_TYPES.map((opt) => (
            <PopoverClose asChild key={opt}>
              <button
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  'flex h-8 shrink-0 items-center rounded-md px-3 text-left text-xs transition-colors hover:bg-white/10',
                  opt === value ? 'text-white' : 'text-white/70',
                )}
              >
                {opt}
              </button>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The footer's own export-resolution dropdown — 1x (native size) or 2x. */
function ExportScaleSelect({ value, onChange }: { value: ExportScale; onChange: (value: ExportScale) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 flex-1 items-center justify-between rounded-lg px-3 text-xs text-white" style={{ background: '#26262C' }}>
          <span>{value}x</span>
          <ChevronDown className="size-3.5 shrink-0 text-white/45" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[100px] border-chrome-border bg-[#26262C]/95 p-1 text-chrome-fg backdrop-blur-lg">
        <div className="flex flex-col gap-0.5">
          {EXPORT_SCALES.map((opt) => (
            <PopoverClose asChild key={opt}>
              <button
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  'flex h-8 shrink-0 items-center rounded-md px-3 text-left text-xs transition-colors hover:bg-white/10',
                  opt === value ? 'text-white' : 'text-white/70',
                )}
              >
                {opt}x
              </button>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Bottom-of-panel export action — only the scene/banner-level panels (SceneEditorPanel,
 * MultiSceneContentPanel) get this; the per-layer panels don't have anything to export on their own.
 * Renders straight to a browser download (no intermediate settings dialog) — the store's own
 * `downloading` flag drives the header's spinner for the duration. */
/** `accent`: the Export button's fill — the brand blue, or Popsicle in the Replace view (where a
 * dark label and icon read better on the light pink). */
export function PanelExportFooter({ layouts, accent = 'blue' }: { layouts: Layout[]; accent?: 'blue' | 'popsicle' }) {
  const t = useT();
  const downloading = useAppStore((s) => s.downloading);
  const setDownloading = useAppStore((s) => s.setDownloading);
  const [fileType, setFileType] = useState<ExportFileType>('PNG');
  const [scale, setScale] = useState<ExportScale>(1);

  async function handleExport() {
    if (downloading || layouts.length === 0) return;
    setDownloading(true);
    try {
      for (const layout of layouts) await exportLayout(layout, fileType, scale);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <PanelDivider />
      {/* +pt-2 on top of the card's own flex `gap` (8px) brings this row's clearance from the
          divider above up to 16px — matching the card's own bottom py-4 clearance below it. */}
      <div className="flex flex-col gap-4 px-4 pt-2">
        <div className="flex items-center gap-2">
          <ExportScaleSelect value={scale} onChange={setScale} />
          <ExportFormatSelect value={fileType} onChange={setFileType} />
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={downloading}
          className={cn('flex h-8 w-full items-center justify-center gap-2 rounded-lg text-[13px] transition-colors hover:brightness-110 disabled:opacity-60', accent === 'popsicle' ? 'text-[#131316]' : 'text-white')}
          style={{ background: accent === 'popsicle' ? 'var(--popsicle)' : '#4570FF' }}
        >
          <img src="/icons/download%2024.svg" alt="" className={cn('size-4', accent === 'popsicle' && 'brightness-0')} />
          {t('Export')}
        </button>
      </div>
    </>
  );
}
