import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
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
export function PanelCard({ width = 279, children }: { width?: number; children: ReactNode }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-stretch gap-2 overflow-y-auto rounded-xl border border-chrome-border py-4"
      style={{ width, background: '#19191D' }}
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

/**
 * The little square diagram in "Anchor type" — which frame edges the element is pinned to. Purely
 * decorative for now (no real anchor/pinning concept exists yet): defaults to every edge
 * unpinned, and a click just previews what "pinned left + top" would look like.
 */
function AnchorFocusPicker() {
  const [pinnedTopLeft, setPinnedTopLeft] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setPinnedTopLeft((v) => !v)}
      className="relative size-[125px] shrink-0 rounded-2xl"
      style={{ background: '#26262C' }}
    >
      {/* Centered target square — sized/positioned with enough margin that the 4 edge bars never touch it. */}
      <div className="absolute rounded-lg" style={{ left: 39, top: 39, width: 47, height: 47, background: '#2F2F37' }} />
      {/* Top */}
      <div className="absolute rounded-full" style={{ left: 58, top: 8, width: 8, height: 21, background: pinnedTopLeft ? ANCHOR_ACTIVE : ANCHOR_INACTIVE }} />
      {/* Bottom */}
      <div className="absolute rounded-full" style={{ left: 58, top: 96, width: 8, height: 21, background: ANCHOR_INACTIVE }} />
      {/* Left */}
      <div className="absolute rounded-full" style={{ left: 8, top: 58, width: 21, height: 8, background: pinnedTopLeft ? ANCHOR_ACTIVE : ANCHOR_INACTIVE }} />
      {/* Right */}
      <div className="absolute rounded-full" style={{ left: 96, top: 58, width: 21, height: 8, background: ANCHOR_INACTIVE }} />
    </button>
  );
}

/**
 * "Position" block shared by every editor panel — alignment-to-frame icons, X/Y readout, and the
 * anchor-type pin picker. Purely visual for now: nothing here is wired to real behavior yet (no
 * anchor/pinning concept exists in the layout engine), so every control is a no-op placeholder.
 */
export function PositionSection({ x, y }: { x: number; y: number }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 px-4">
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

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/65">{t('Anchor type')}</span>
        <div className="flex items-center gap-2">
          <AnchorFocusPicker />
          <div className="flex flex-1 flex-col gap-2.5">
            {(['Left', 'Right', 'Smart'] as const).map((label) => (
              <button
                key={label}
                type="button"
                className="flex h-[35px] items-center justify-between rounded-lg bg-[#26262C] px-2.5 text-sm text-white transition-colors hover:bg-white/10"
              >
                {t(label)}
                <ChevronDown className="size-4 shrink-0 text-white" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4">
      <span className="text-xs font-semibold text-white">{label}</span>
      {children}
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
}: {
  value: string;
  options: { value: string; label: ReactNode }[];
  onChange: (value: string) => void;
}) {
  const activeLabel = options.find((o) => o.value === value)?.label ?? value;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-chrome-border bg-chrome-border-subtle px-3 text-sm text-chrome-fg"
        >
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

export function PanelFooter({
  visible,
  onToggleVisible,
  showDownload = false,
  onDownload,
}: {
  visible: boolean;
  onToggleVisible: () => void;
  showDownload?: boolean;
  onDownload?: () => void;
}) {
  const t = useT();
  return (
    <>
      <PanelDivider />
      <div className="flex items-center gap-1 px-4 pt-1">
        <button
          type="button"
          aria-label={visible ? t('Hide layer') : t('Show layer')}
          onClick={onToggleVisible}
          className="flex size-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
        {showDownload && (
          <button
            type="button"
            aria-label={t('Export')}
            onClick={onDownload}
            className="flex size-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <img src="/icons/download%2024.svg" alt="" className="size-4" />
          </button>
        )}
      </div>
    </>
  );
}
