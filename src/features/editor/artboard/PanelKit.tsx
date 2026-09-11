import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { layoutHasSiblingSizes } from '@/lib/match-select';
import { useT } from '@/lib/i18n';
import type { LayoutElement } from '@/types';

/** One selected element, paired with the scene (layout) it lives in — a multi-select can span scenes. */
export type EditorTarget = { element: LayoutElement; layoutId: string };

/** Shared visual kit for the right-corner editing panels (text/shape/image/scene). */
export function PanelCard({ width = 279, gap = 8, children }: { width?: number; gap?: number; children: ReactNode }) {
  return (
    <div
      data-panel-card
      className="flex h-full min-h-0 flex-col items-stretch overflow-y-auto rounded-xl border border-[#26262C] py-4"
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
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[-0.01em] text-white uppercase">{title}</span>
      {trailing}
    </div>
  );
}

/** A header icon that already bakes in its own tile background/border/shadow (the `icons/edit_panel/*` set) — rendered slightly oversized so that built-in drop shadow isn't clipped. */
export function PanelHeaderIcon({ src }: { src: string }) {
  return <img src={src} alt="" className="-ml-1 size-8 shrink-0" />;
}

/**
 * Sits at the right edge of the text/shape/image panels' own header row — while on (the default),
 * selecting this layer in its own scene also selects its matching layer in every other size of
 * the group; this icon toggles it off (dropping every cross-scene match, keeping just the current
 * scene's own selection) or back on (re-expanding immediately). Hidden entirely until at least one
 * other size exists to match against.
 */
export function MatchSelectButton({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const matchSelectEnabled = useAppStore((s) => s.matchSelectEnabled);
  const enableMatchSelect = useAppStore((s) => s.enableMatchSelect);
  const disableMatchSelect = useAppStore((s) => s.disableMatchSelect);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const pageGroups = useAppStore((s) => s.pageGroups);

  const primary = targets[0];
  const groupState = { setsById, layoutsById, pageGroupIdByPage, pageGroups };
  if (!primary || !layoutHasSiblingSizes(groupState, primary.layoutId)) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={matchSelectEnabled ? t('Stop select in all sizes') : t('Select in all sizes')}
          onClick={() => (matchSelectEnabled ? disableMatchSelect() : enableMatchSelect())}
          className={cn('flex size-6 shrink-0 items-center justify-center rounded-md transition-colors', matchSelectEnabled ? 'bg-button-primary' : 'bg-[#40404A] hover:bg-white/20')}
        >
          <img src="/icons/match_select.svg" alt="" className="size-4" />
        </button>
      </TooltipTrigger>
      {/* No custom background here — TooltipContent's own arrow is a separate element with a
          hardcoded fill that only matches the component's default background; overriding just
          the body color leaves the arrow looking like a stray dark shape next to it. */}
      <TooltipContent side="top">{matchSelectEnabled ? t('Stop select in all sizes') : t('Select in all sizes')}</TooltipContent>
    </Tooltip>
  );
}

const ALIGN_H_OPTIONS = [
  { value: 'left', icon: '/icons/edit_panel/layers-align-left.svg' },
  { value: 'center', icon: '/icons/edit_panel/layers-align-center.svg' },
  { value: 'right', icon: '/icons/edit_panel/layers-align-right.svg' },
] as const;
const ALIGN_V_OPTIONS = [
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

function AlignIconGroup({ options }: { options: readonly { value: string; icon: string }[] }) {
  const t = useT();
  return (
    <div className="flex flex-1 items-center gap-0.5 rounded-md bg-chrome-border-subtle p-0.5">
      {options.map((opt) => (
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
 */
export function PositionSection({ x, y, showPositionMode = true }: { x: number; y: number; showPositionMode?: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<PositionMode>('smart');
  const [vertical, setVertical] = useState<VerticalAnchor>('center');
  const [horizontal, setHorizontal] = useState<HorizontalAnchor>('center');
  const [showPreview, setShowPreview] = useState(false);
  const [previewShapeIndex, setPreviewShapeIndex] = useState(0);
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorBoxRef = useRef<HTMLDivElement>(null);

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
    <div ref={rootRef} className="flex flex-col gap-3 px-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/65">{t('Alignment')}</span>
        <div className="flex items-center gap-1.5">
          <AlignIconGroup options={ALIGN_H_OPTIONS} />
          <AlignIconGroup options={ALIGN_V_OPTIONS} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/65">{t('Position')}</span>
        <div className="flex items-center gap-2">
          <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm">
            <span className="text-white/65">X</span>
            <span className="ml-auto text-white">{Math.round(x)}</span>
          </div>
          <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm">
            <span className="text-white/65">Y</span>
            <span className="ml-auto text-white">{Math.round(y)}</span>
          </div>
        </div>
      </div>

      {/* Hover anywhere across this whole block (title, mode select, edge-pin picker) to preview —
          not just the mode dropdown itself. */}
      {showPositionMode && (
        <div className="flex flex-col gap-3" onMouseEnter={() => mode === 'anchored' && setShowPreview(true)}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-white/65">{t('Position mode')}</span>
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
    </div>
  );
}

export function PanelSection({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
        {icon}
        {label}
      </span>
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
  return <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />;
}

export function ColorRow({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t('Color')}
        onClick={() => inputRef.current?.click()}
        className="size-8 shrink-0 rounded-full border border-black/20"
        style={{ background: color }}
      />
      <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-chrome-border bg-chrome-border-subtle px-3 text-sm text-chrome-fg">
        <span className="flex-1 truncate uppercase">{color}</span>
        <span className="shrink-0 text-white/45">100%</span>
      </div>
      <input ref={inputRef} type="color" value={color} onChange={(e) => onChange(e.target.value)} className="sr-only" tabIndex={-1} />
    </div>
  );
}

export const BORDER_STYLE_ICONS: Record<'none' | 'solid' | 'dashed' | 'dotted', string> = {
  none: '/icons/edit_panel/border-none%2016.svg',
  solid: '/icons/edit_panel/border-solid%2016.svg',
  dashed: '/icons/edit_panel/border-dashed%2016.svg',
  dotted: '/icons/edit_panel/border-dotted%2016.svg',
};

/** Number field + the uniform/per-corner radius toggle. Only "uniform" (the current single-value
 * radius model) actually does anything — the per-corner button is a visual placeholder for a mode
 * the layout engine doesn't support yet. */
export function RadiusRow({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <NumberField className="w-full" value={String(value)} onCommit={(v) => onCommit(Math.max(0, Number(v) || 0))} />
      <button
        type="button"
        aria-label={t('Uniform radius')}
        className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-[#26262C] text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)]"
      >
        <img src="/icons/edit_panel/radius_all.svg" alt="" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={t('Per-corner radius')}
        className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10"
      >
        <img src="/icons/edit_panel/radius-each%20corner.svg" alt="" className="size-4" />
      </button>
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
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      defaultValue={value}
      key={value}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={cn(
        'flex h-8 items-center rounded-md border border-chrome-border bg-chrome-border-subtle px-2 text-center text-base font-bold text-chrome-fg outline-none',
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
    <div className="flex items-center gap-0.5 rounded-lg bg-chrome-border-subtle p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex h-8 flex-1 items-center justify-center rounded-md text-white/70 transition-colors',
            opt.value === value ? 'bg-[#41414A] text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)]' : 'hover:bg-white/5',
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

export function IconNumberField({ icon, value, onCommit }: { icon: string; value: string; onCommit: (value: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <img src={icon} alt="" className="size-4 shrink-0 opacity-70" />
      <NumberField className="w-full" value={value} onCommit={onCommit} />
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

export function IconPopoverButton({ icon, active, children }: { icon: string; active?: boolean; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border border-chrome-border bg-chrome-border-subtle transition-colors hover:bg-white/10',
            active && 'bg-white/10',
          )}
        >
          <img src={icon} alt="" className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-auto min-w-[140px] border-chrome-border bg-[#26262C]/95 p-1 text-chrome-fg backdrop-blur-lg">
        <div className="flex flex-col gap-0.5">{children}</div>
      </PopoverContent>
    </Popover>
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
            'flex h-8 flex-1 items-center gap-2 rounded-lg border border-chrome-border bg-chrome-border-subtle px-3 text-sm text-chrome-fg',
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

/** Bottom-of-panel export action — only the scene/banner-level panels (SceneEditorPanel,
 * MultiSceneContentPanel) get this; the per-layer panels don't have anything to export on their own. */
export function PanelExportFooter({ onExport }: { onExport: () => void }) {
  const t = useT();
  return (
    <>
      <PanelDivider />
      <div className="px-4">
        <button
          type="button"
          onClick={onExport}
          className="flex h-8 w-full items-center justify-center gap-2 rounded-full text-[13px] text-white transition-colors hover:brightness-110"
          style={{ background: '#26262C' }}
        >
          <img src="/icons/download%2024.svg" alt="" className="size-4" />
          {t('Export')}
        </button>
      </div>
    </>
  );
}
