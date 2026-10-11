import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { DEFAULT_TEXT_AUTO_LAYOUT } from '@/lib/text-auto-layout';
import { computeGroupAutoLayout, inferGroupAutoLayout } from '@/lib/group-auto-layout';
import type { GroupAutoLayout, LayoutElement, TextAutoLayout } from '@/types';
import { NumberField, type EditorTarget } from './PanelKit';

type Padding = TextAutoLayout['padding'];
type Side = keyof Padding;

/** Keeps a scaled-across-sizes value like 12.5 readable without silently rounding it away on blur. */
function formatPadding(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function PaddingField({ icon, iconStyle, label, value, onCommit }: { icon: string; iconStyle?: React.CSSProperties; label: string; value: string; onCommit: (value: string) => void }) {
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-2" title={label}>
      <img src={icon} alt="" className="size-4 shrink-0" style={iconStyle} />
      <NumberField scrubbable className="h-7 w-0 min-w-0 flex-1 rounded-[6px] border-transparent" value={value} onCommit={onCommit} />
    </div>
  );
}

function HugCheckbox({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className="group flex h-[22px] items-center gap-2">
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          checked ? 'border-[#4570FF] bg-[#4570FF]' : 'border-chrome-border bg-chrome-border-subtle group-hover:border-[#4570FF]',
        )}
      >
        {checked && <img src="/icons/edit_panel/check%2016.svg" alt="" className="size-4" />}
      </span>
      <span className="text-[13px] tracking-[-0.01em] text-white/65">{children}</span>
    </button>
  );
}

/** Section title plus its +/− on/off button — shared by the text and group variants. */
function AutoLayoutShell({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Auto Layout')}</span>
        <button
          type="button"
          aria-label={on ? t('Remove auto layout') : t('Add auto layout')}
          onClick={onToggle}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-chrome-border-subtle hover:text-white"
        >
          {on ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>
      {on && children}
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
      <span className="text-[11px] tracking-[-0.01em] text-white/65">{t('Padding')}</span>
      <div className="flex items-center gap-4">
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
        <div className="flex items-center gap-4 pr-11">
          <PaddingField icon="/icons/edit_panel/padding-right%2016.svg" label={t('Right padding')} value={formatPadding(padding.right)} onCommit={(v) => commit(['right'], v)} />
          <PaddingField icon="/icons/edit_panel/padding-bottom%2016.svg" label={t('Bottom padding')} value={formatPadding(padding.bottom)} onCommit={(v) => commit(['bottom'], v)} />
        </div>
      )}
    </div>
  );
}

function HugRow({ hugWidth, hugHeight, onChange }: { hugWidth: boolean; hugHeight: boolean; onChange: (patch: { hugWidth?: boolean; hugHeight?: boolean }) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-4 py-1">
      <HugCheckbox checked={hugWidth} onChange={(v) => onChange({ hugWidth: v })}>
        {t('Hug width')}
      </HugCheckbox>
      <HugCheckbox checked={hugHeight} onChange={(v) => onChange({ hugHeight: v })}>
        {t('Hug height')}
      </HugCheckbox>
    </div>
  );
}

/**
 * Text panel's "Auto Layout" section — padding inside the text box, plus per-axis Hug switches.
 * Closed (just a "+") until turned on; on/off lives on the element itself (`style.autoLayout`), so
 * unlike the Border section there's no separate expanded flag to keep in sync.
 */
export function AutoLayoutSection({ targets }: { targets: EditorTarget[] }) {
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const autoLayout = primary.style.autoLayout;

  /** Merges into each target's own settings rather than copying the primary's wholesale, so an
   * edit to one field never overwrites another selected layer's other padding or hug values. */
  function patchAutoLayout(patch: (current: TextAutoLayout) => Partial<TextAutoLayout>) {
    for (const tgt of targets) {
      const current = tgt.element.style.autoLayout ?? DEFAULT_TEXT_AUTO_LAYOUT;
      updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, autoLayout: { ...current, ...patch(current) } } });
    }
  }

  function toggle() {
    for (const tgt of targets) {
      updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, autoLayout: autoLayout ? undefined : DEFAULT_TEXT_AUTO_LAYOUT } });
    }
  }

  return (
    <AutoLayoutShell on={Boolean(autoLayout)} onToggle={toggle}>
      {autoLayout && (
        <>
          <PaddingControls padding={autoLayout.padding} resetKey={primary.id} onCommit={(p) => patchAutoLayout((current) => ({ padding: { ...current.padding, ...p } }))} />
          <HugRow hugWidth={autoLayout.hugWidth} hugHeight={autoLayout.hugHeight} onChange={(patch) => patchAutoLayout(() => patch)} />
        </>
      )}
    </AutoLayoutShell>
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

const DIRECTIONS = [
  { value: 'vertical', label: 'Vertical', icon: '/icons/edit_panel/auto-layout-vertical%2016.svg' },
  { value: 'horizontal', label: 'Horizontal', icon: '/icons/edit_panel/auto-layout-horizontal%2016.svg' },
] as const;

/**
 * A layer group's "Auto Layout" section — stacks the members in a column or a row with a set
 * spacing, inside padding, like a Figma auto-layout frame. Shown in place of the per-layer section
 * whenever a whole group is selected; the layout itself is kept up to date by ArtboardFrame.
 */
export function GroupAutoLayoutSection({ layoutId, groupId }: { layoutId: string; groupId: string }) {
  const t = useT();
  const setGroupLayout = useAppStore((s) => s.setGroupLayout);
  const elements = useAppStore((s) => s.layoutsById[layoutId]?.elements);
  const members = (elements ?? []).filter((el) => el.groupId === groupId);
  const groupLayout = members[0]?.groupLayout;

  function patch(next: Partial<GroupAutoLayout>) {
    if (groupLayout) setGroupLayout(layoutId, groupId, { ...groupLayout, ...next });
  }

  // Unchecking a Hug freezes that axis at the box's current size, the same as a text box's does.
  function patchHug(next: { hugWidth?: boolean; hugHeight?: boolean }) {
    if (!groupLayout) return;
    const { box } = computeGroupAutoLayout(members, groupLayout);
    patch({ ...next, ...(next.hugWidth === false && { width: box.w }), ...(next.hugHeight === false && { height: box.h }) });
  }

  return (
    <AutoLayoutShell on={Boolean(groupLayout)} onToggle={() => setGroupLayout(layoutId, groupId, groupLayout ? undefined : inferGroupAutoLayout(members))}>
      {groupLayout && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-8 flex-1 items-center overflow-hidden rounded-[6px]">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  title={t(d.label)}
                  aria-pressed={groupLayout.direction === d.value}
                  onClick={() => patch({ direction: d.value })}
                  className={cn(
                    'flex h-8 flex-1 items-center justify-center rounded-lg transition-colors',
                    groupLayout.direction === d.value ? 'bg-[#26262C] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]' : 'hover:bg-white/5',
                  )}
                >
                  <img src={d.icon} alt="" className="size-4" />
                </button>
              ))}
            </div>
            <div className="flex w-[91.5px] shrink-0">
              {/* The gap glyph is drawn for a column; turned a quarter for a row. */}
              <PaddingField
                icon="/icons/edit_panel/gap-horizontal%2016.svg"
                iconStyle={groupLayout.direction === 'horizontal' ? { transform: 'rotate(90deg)' } : undefined}
                label={t('Spacing between items')}
                value={formatPadding(groupLayout.gap)}
                onCommit={(v) => patch({ gap: Math.max(0, Number(v) || 0) })}
              />
            </div>
          </div>
          <PaddingControls padding={groupLayout.padding} resetKey={groupId} onCommit={(p) => patch({ padding: { ...groupLayout.padding, ...p } })} />
          <HugRow hugWidth={groupLayout.hugWidth} hugHeight={groupLayout.hugHeight} onChange={patchHug} />
        </>
      )}
    </AutoLayoutShell>
  );
}
