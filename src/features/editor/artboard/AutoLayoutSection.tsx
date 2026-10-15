import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { DEFAULT_TEXT_AUTO_LAYOUT } from '@/lib/text-auto-layout';
import { computeGroupAutoLayout, inferGroupAutoLayout, paddingOnlyGroupLayout } from '@/lib/group-auto-layout';
import type { LayoutElement, TextAutoLayout } from '@/types';
import { IconNumberField, type EditorTarget } from './PanelKit';

type Padding = TextAutoLayout['padding'];
type Side = keyof Padding;

/** Keeps a scaled-across-sizes value like 12.5 readable without silently rounding it away on blur. */
function formatPadding(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function PaddingField({ icon, iconStyle, label, value, onCommit }: { icon: string; iconStyle?: React.CSSProperties; label: string; value: string; onCommit: (value: string) => void }) {
  return (
    <IconNumberField scrubbable icon={icon} iconStyle={iconStyle} title={label} className="min-w-0 flex-1" value={value} onCommit={onCommit} />
  );
}

/** One of the Dimensions row's W/H pills — read-only: a box's size follows its content (and
 * padding), and is changed by resizing it on the canvas rather than typed here. `onReset` (given
 * once that side has been resized by hand) adds a small "Reset" that makes it fit its content again.
 * `dimmed` (on by default) shows the value at 25% opacity, reading as "derived, not yours to type
 * into" — the Dimensions row's own lock toggle turns it off, brightening to full white, once
 * unlocked. */
export function DimensionField({
  axis,
  value,
  onReset,
  onCommit,
  resetKey,
  dimmed = true,
}: {
  axis: 'W' | 'H';
  value: number;
  onReset?: () => void;
  /** When given, this axis is actually typable (Shape/Image, whose frame size isn't content-derived)
   * instead of the plain read-only display span Text/Group use. */
  onCommit?: (raw: string) => void;
  /** Forces the input to remount (so a fresh `defaultValue` takes) when the value changes from
   * outside rather than from this very field's own blur — the selected element's id is enough. */
  resetKey?: string;
  dimmed?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-[11px] tracking-[-0.01em]">
      <span className="text-white/65">{axis}</span>
      {onCommit ? (
        <input
          type="text"
          defaultValue={String(Math.round(value))}
          key={`${resetKey}-${axis}-${Math.round(value)}`}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={cn('w-0 min-w-0 flex-1 bg-transparent outline-none', dimmed ? 'text-white/25' : 'text-white')}
        />
      ) : (
        <span className={cn('min-w-0 flex-1 truncate', dimmed ? 'text-white/25' : 'text-white')}>{Math.round(value)}</span>
      )}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          title={axis === 'W' ? t('Fit width to content') : t('Fit height to content')}
          className="shrink-0 text-[11px] text-white/65 transition-colors hover:text-white"
        >
          {t('Reset')}
        </button>
      )}
    </div>
  );
}

type AutoLayoutMode = 'off' | 'vertical' | 'horizontal';

const MODES: { value: AutoLayoutMode; label: string; icon: string }[] = [
  { value: 'off', label: 'No auto layout', icon: '/icons/edit_panel/auto-layout-off%2016.svg' },
  { value: 'vertical', label: 'Vertical', icon: '/icons/edit_panel/auto-layout-vertical%2016.svg' },
  { value: 'horizontal', label: 'Horizontal', icon: '/icons/edit_panel/auto-layout-horizontal%2016.svg' },
];

/** The "Layout" section's frame — title, then (for a group only, the one place stacking layers
 * means anything) the Off / Vertical / Horizontal Auto Layout switch. */
export function LayoutShell({ mode, onModeChange, children }: { mode?: AutoLayoutMode; onModeChange?: (mode: AutoLayoutMode) => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-4">
      <div className="flex h-8 items-center">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Layout')}</span>
      </div>
      {mode && onModeChange && (
        <div className="flex h-8 items-center overflow-hidden rounded-lg border border-chrome-border-subtle">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              title={t(m.label)}
              aria-label={t(m.label)}
              aria-pressed={mode === m.value}
              onClick={() => mode !== m.value && onModeChange(m.value)}
              className={cn(
                'flex h-full flex-1 items-center justify-center rounded-[7px] transition-colors',
                mode === m.value ? 'bg-[#26262C] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]' : 'hover:bg-white/5',
              )}
            >
              <img src={m.icon} alt="" className="size-4" />
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

/** The "Dimensions" caption every layer type's W/H row sits under. */
export function DimensionsLabel() {
  const t = useT();
  return <span className="flex h-[22px] items-center text-[9px] leading-4 tracking-[-0.01em] text-white/65">{t('Dimensions')}</span>;
}

/** "Dimensions" label over the read-only W/H pills. The lock toggle beside them is a visual
 * preview only, matching this panel's other not-yet-wired controls (`PositionSection`'s anchor
 * picker) — there's no real W/H aspect-lock concept to apply since both fields already derive from
 * content rather than being independently typable; it still flips its own icon and `aria-pressed`
 * state on click, same as any other toggle, even though nothing downstream reads it yet. */
function DimensionsBlock({ w, h, onResetW, onResetH }: { w: number; h: number; onResetW?: () => void; onResetH?: () => void }) {
  const t = useT();
  const [locked, setLocked] = useState(true);
  return (
    <div className="flex flex-col gap-1">
      <DimensionsLabel />
      <div className="flex items-center gap-2">
        <DimensionField axis="W" value={w} onReset={onResetW} dimmed={locked} />
        <DimensionField axis="H" value={h} onReset={onResetH} dimmed={locked} />
        <button
          type="button"
          aria-label={locked ? t('Unlock aspect ratio') : t('Lock aspect ratio')}
          aria-pressed={locked}
          onClick={() => setLocked((v) => !v)}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_1px_6px_-1px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.03),0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:bg-white/10"
        >
          {/* Both source assets bake in their own fill color (the lock blue, the unlock white) —
              forced to plain white here regardless, per spec. */}
          <img
            src={locked ? '/icons/edit_panel/lock%2012.svg' : '/icons/edit_panel/unlock%2012.svg'}
            alt=""
            className="size-4"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </button>
      </div>
    </div>
  );
}

/** Shape/Image's own "Dimensions" row — unlike Text/Group's read-only `DimensionsBlock`, both W and
 * H are the thing actually being sized here, so they're real typable fields, and the lock toggle is
 * real too (caller owns the `locked` state and the aspect-ratio math on commit) rather than the
 * decorative, always-local one `DimensionsBlock` uses. */
export function EditableDimensionsBlock({
  w,
  h,
  locked,
  onToggleLock,
  onCommitW,
  onCommitH,
  resetKey,
}: {
  w: number;
  h: number;
  locked: boolean;
  onToggleLock: () => void;
  onCommitW: (raw: string) => void;
  onCommitH: (raw: string) => void;
  resetKey: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <DimensionsLabel />
      <div className="flex items-center gap-2">
        <DimensionField axis="W" value={w} onCommit={onCommitW} resetKey={resetKey} dimmed={false} />
        <DimensionField axis="H" value={h} onCommit={onCommitH} resetKey={resetKey} dimmed={false} />
        <button
          type="button"
          aria-label={locked ? t('Unlock aspect ratio') : t('Lock aspect ratio')}
          aria-pressed={locked}
          onClick={onToggleLock}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_1px_6px_-1px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.03),0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:bg-white/10"
        >
          {/* Both source assets bake in their own fill color (the lock blue, the unlock white) —
              forced to plain white here regardless, per spec, same as Dimensions' own lock. */}
          <img
            src={locked ? '/icons/edit_panel/lock%2012.svg' : '/icons/edit_panel/unlock%2012.svg'}
            alt=""
            className="size-4"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * Padding fields — horizontal/vertical pairs by default, or all four sides once the button on the
 * right is toggled. Opens on all four whenever the padding is already uneven, so nothing is hidden
 * behind a "Mixed" pair; `resetKey` re-applies that choice when the selection changes.
 */
function PaddingControls({ padding, resetKey, onCommit }: { padding: Padding; resetKey: string; onCommit: (patch: Partial<Padding>) => void }) {
  const t = useT();
  const isUneven = padding.left !== padding.right || padding.top !== padding.bottom;
  const [individual, setIndividual] = useState(isUneven);
  useEffect(() => {
    setIndividual(isUneven);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function commit(sides: Side[], raw: string) {
    // Blurring a "Mixed" pair untouched must not flatten both sides to 0.
    if (raw === t('Mixed')) return;
    const value = Math.max(0, Number(raw) || 0);
    onCommit(Object.fromEntries(sides.map((side) => [side, value])));
  }

  const pairValue = (a: number, b: number) => (a === b ? formatPadding(a) : t('Mixed'));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] leading-4 tracking-[-0.01em] text-white/65">{t('Padding')}</span>
      <div className="flex items-center gap-2">
        {individual ? (
          <>
            <PaddingField icon="/icons/edit_panel/padding-left%2016.svg" label={t('Left padding')} value={formatPadding(padding.left)} onCommit={(v) => commit(['left'], v)} />
            <PaddingField icon="/icons/edit_panel/padding-top%2016.svg" label={t('Top padding')} value={formatPadding(padding.top)} onCommit={(v) => commit(['top'], v)} />
          </>
        ) : (
          <>
            <PaddingField icon="/icons/edit_panel/padding-lr%2016.svg" label={t('Horizontal padding')} value={pairValue(padding.left, padding.right)} onCommit={(v) => commit(['left', 'right'], v)} />
            <PaddingField icon="/icons/edit_panel/padding-tb%2016.svg" label={t('Vertical padding')} value={pairValue(padding.top, padding.bottom)} onCommit={(v) => commit(['top', 'bottom'], v)} />
          </>
        )}
        <button
          type="button"
          aria-label={t('Individual padding')}
          aria-pressed={individual}
          onClick={() => setIndividual((v) => !v)}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            individual ? 'bg-chrome-border-subtle shadow-[0_1px_1px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.02),0_2px_2px_rgba(0,0,0,0.02)]' : 'hover:bg-white/5',
          )}
        >
          <img src="/icons/edit_panel/paddings%2016.svg" alt="" className="size-4" />
        </button>
      </div>
      {individual && (
        // Right-padded by the toggle button's width + gap, so these fields line up under the row above.
        <div className="flex items-center gap-2 pr-11">
          <PaddingField icon="/icons/edit_panel/padding-right%2016.svg" label={t('Right padding')} value={formatPadding(padding.right)} onCommit={(v) => commit(['right'], v)} />
          <PaddingField icon="/icons/edit_panel/padding-bottom%2016.svg" label={t('Bottom padding')} value={formatPadding(padding.bottom)} onCommit={(v) => commit(['bottom'], v)} />
        </div>
      )}
    </div>
  );
}

/**
 * Text panel's "Layout" section — the box's dimensions (read-only: it fits its content unless it's
 * been resized from its frame on the canvas) and the padding inside it, always available. Padding
 * lives on the element itself (`style.autoLayout`), created the first time it's set.
 */
export function AutoLayoutSection({ targets }: { targets: EditorTarget[] }) {
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const padding = primary.style.autoLayout?.padding ?? DEFAULT_TEXT_AUTO_LAYOUT.padding;

  /** Merges into each target's own padding rather than copying the primary's wholesale, so an edit
   * to one side never overwrites another selected layer's other sides (or its frame-resized size). */
  function patchPadding(patch: Partial<Padding>) {
    for (const tgt of targets) {
      const current = tgt.element.style.autoLayout ?? DEFAULT_TEXT_AUTO_LAYOUT;
      updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, autoLayout: { ...current, padding: { ...current.padding, ...patch } } } });
    }
  }

  /** Back to fitting its content on that side — the measurement effect re-sizes it right away. */
  function resetSize(axis: 'w' | 'h') {
    for (const tgt of targets) {
      const current = tgt.element.style.autoLayout;
      if (!current) continue;
      updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, autoLayout: { ...current, ...(axis === 'w' ? { hugWidth: true } : { hugHeight: true }) } } });
    }
  }

  const autoLayout = primary.style.autoLayout;
  return (
    <LayoutShell>
      <DimensionsBlock
        w={primary.frame.w}
        h={primary.frame.h}
        onResetW={autoLayout && !autoLayout.hugWidth ? () => resetSize('w') : undefined}
        onResetH={autoLayout && !autoLayout.hugHeight ? () => resetSize('h') : undefined}
      />
      <PaddingControls padding={padding} resetKey={primary.id} onCommit={patchPadding} />
    </LayoutShell>
  );
}

/** The selection, if it's exactly one whole layer group (every member, nothing else) — the case
 * where the panel offers the group's own Auto Layout instead of each layer's. */
function selectedWholeGroup(targets: EditorTarget[], layoutElements: LayoutElement[] | undefined): { layoutId: string; groupId: string } | null {
  const groupId = targets[0]?.element.groupId;
  const layoutId = targets[0]?.layoutId;
  if (!groupId || !layoutElements || targets.length < 2) return null;
  if (!targets.every((tgt) => tgt.layoutId === layoutId && tgt.element.groupId === groupId)) return null;
  return layoutElements.filter((el) => el.groupId === groupId).length === targets.length ? { layoutId, groupId } : null;
}

export function useSelectedWholeGroup(targets: EditorTarget[]) {
  const elements = useAppStore((s) => (targets[0] ? s.layoutsById[targets[0].layoutId]?.elements : undefined));
  return selectedWholeGroup(targets, elements);
}

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
const hasPadding = (p: Padding) => p.top > 0 || p.right > 0 || p.bottom > 0 || p.left > 0;

/**
 * A layer group's "Layout" section — read-only dimensions and the padding around its members
 * (always available, Auto Layout or not), under an Off / Vertical / Horizontal switch. Either
 * direction stacks the members in a column or a row, `gap` apart, like a Figma auto-layout frame
 * (switching on from Off infers a starting gap from how they're already spread). Only the group's
 * own setting is touched — a member's own text padding stays as it is. The stacking itself is kept
 * up to date by ArtboardFrame.
 */
export function GroupAutoLayoutSection({ layoutId, groupId }: { layoutId: string; groupId: string }) {
  const t = useT();
  const setGroupLayout = useAppStore((s) => s.setGroupLayout);
  const elements = useAppStore((s) => s.layoutsById[layoutId]?.elements);
  const members = (elements ?? []).filter((el) => el.groupId === groupId);
  const groupLayout = members[0]?.groupLayout;
  const padding = groupLayout?.padding ?? NO_PADDING;
  const stacked = groupLayout && groupLayout.direction !== 'none' ? groupLayout : null;
  const mode: AutoLayoutMode = !groupLayout || groupLayout.direction === 'none' ? 'off' : groupLayout.direction;

  function setMode(next: AutoLayoutMode) {
    if (next === 'off') {
      // Padding stays — it isn't part of Auto Layout. Nothing left to keep → no layout at all.
      setGroupLayout(layoutId, groupId, hasPadding(padding) ? paddingOnlyGroupLayout(padding) : undefined);
    } else if (stacked) {
      setGroupLayout(layoutId, groupId, { ...stacked, direction: next });
    } else {
      setGroupLayout(layoutId, groupId, { ...inferGroupAutoLayout(members, padding), direction: next });
    }
  }

  function commitPadding(patch: Partial<Padding>) {
    const next = { ...padding, ...patch };
    if (stacked) {
      setGroupLayout(layoutId, groupId, { ...stacked, padding: next });
    } else {
      setGroupLayout(layoutId, groupId, hasPadding(next) ? paddingOnlyGroupLayout(next) : undefined);
    }
  }

  if (members.length === 0) return null;
  const { box } = computeGroupAutoLayout(members, groupLayout ?? paddingOnlyGroupLayout(NO_PADDING));

  return (
    <LayoutShell mode={mode} onModeChange={setMode}>
      <DimensionsBlock w={box.w} h={box.h} />
      <PaddingControls padding={padding} resetKey={groupId} onCommit={commitPadding} />
      {stacked && (
        <div className="flex flex-col gap-2">
          <span className="text-[9px] leading-4 tracking-[-0.01em] text-white/65">{t('Gap')}</span>
          <div className="flex w-[91.5px]">
            {/* The gap glyph is drawn for a column; turned a quarter for a row. */}
            <PaddingField
              icon="/icons/edit_panel/gap-horizontal%2016.svg"
              iconStyle={stacked.direction === 'horizontal' ? { transform: 'rotate(90deg)' } : undefined}
              label={t('Spacing between items')}
              value={formatPadding(stacked.gap)}
              onCommit={(v) => setGroupLayout(layoutId, groupId, { ...stacked, gap: Math.max(0, Number(v) || 0) })}
            />
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
