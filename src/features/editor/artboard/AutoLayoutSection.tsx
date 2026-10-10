import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { DEFAULT_TEXT_AUTO_LAYOUT } from '@/lib/text-auto-layout';
import type { TextAutoLayout } from '@/types';
import { NumberField, type EditorTarget } from './PanelKit';

type Side = keyof TextAutoLayout['padding'];

/** Keeps a scaled-across-sizes value like 12.5 readable without silently rounding it away on blur. */
function formatPadding(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function PaddingField({ icon, label, value, onCommit }: { icon: string; label: string; value: string; onCommit: (value: string) => void }) {
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-2" title={label}>
      <img src={icon} alt="" className="size-4 shrink-0" />
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

/**
 * Text panel's "Auto Layout" section — padding inside the text box, plus per-axis Hug switches.
 * Closed (just a "+") until turned on; on/off lives on the element itself (`style.autoLayout`), so
 * unlike the Border section there's no separate expanded flag to keep in sync. Padding shows as
 * horizontal/vertical pairs by default, or all four sides once the button on the right is toggled.
 */
export function AutoLayoutSection({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const autoLayout = primary.style.autoLayout;
  const padding = autoLayout?.padding ?? DEFAULT_TEXT_AUTO_LAYOUT.padding;

  // Opens on all four sides whenever the layer already has uneven padding, so nothing it holds is
  // hidden behind a "Mixed" pair — reset per selection, same as the Border section's own flag.
  const isUneven = padding.left !== padding.right || padding.top !== padding.bottom;
  const [individual, setIndividual] = useState(isUneven);
  useEffect(() => {
    setIndividual(isUneven);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.id]);

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

  function commitPadding(sides: Side[], raw: string) {
    // Blurring a "Mixed" pair untouched must not flatten both sides to 0.
    if (raw === t('Mixed')) return;
    const value = Math.max(0, Number(raw) || 0);
    patchAutoLayout((current) => ({ padding: { ...current.padding, ...Object.fromEntries(sides.map((side) => [side, value])) } }));
  }

  const pairValue = (a: number, b: number) => (a === b ? formatPadding(a) : t('Mixed'));

  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Auto Layout')}</span>
        <button
          type="button"
          aria-label={autoLayout ? t('Remove auto layout') : t('Add auto layout')}
          onClick={toggle}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-chrome-border-subtle hover:text-white"
        >
          {autoLayout ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>

      {autoLayout && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] tracking-[-0.01em] text-white/65">{t('Padding')}</span>
            <div className="flex items-center gap-4">
              {individual ? (
                <>
                  <PaddingField icon="/icons/edit_panel/padding-left%2016.svg" label={t('Left padding')} value={formatPadding(padding.left)} onCommit={(v) => commitPadding(['left'], v)} />
                  <PaddingField icon="/icons/edit_panel/padding-top%2016.svg" label={t('Top padding')} value={formatPadding(padding.top)} onCommit={(v) => commitPadding(['top'], v)} />
                </>
              ) : (
                <>
                  <PaddingField
                    icon="/icons/edit_panel/padding-lr%2016.svg"
                    label={t('Horizontal padding')}
                    value={pairValue(padding.left, padding.right)}
                    onCommit={(v) => commitPadding(['left', 'right'], v)}
                  />
                  <PaddingField
                    icon="/icons/edit_panel/padding-tb%2016.svg"
                    label={t('Vertical padding')}
                    value={pairValue(padding.top, padding.bottom)}
                    onCommit={(v) => commitPadding(['top', 'bottom'], v)}
                  />
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
                <PaddingField icon="/icons/edit_panel/padding-right%2016.svg" label={t('Right padding')} value={formatPadding(padding.right)} onCommit={(v) => commitPadding(['right'], v)} />
                <PaddingField icon="/icons/edit_panel/padding-bottom%2016.svg" label={t('Bottom padding')} value={formatPadding(padding.bottom)} onCommit={(v) => commitPadding(['bottom'], v)} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 py-1">
            <HugCheckbox checked={autoLayout.hugWidth} onChange={(hugWidth) => patchAutoLayout(() => ({ hugWidth }))}>
              {t('Hug width')}
            </HugCheckbox>
            <HugCheckbox checked={autoLayout.hugHeight} onChange={(hugHeight) => patchAutoLayout(() => ({ hugHeight }))}>
              {t('Hug height')}
            </HugCheckbox>
          </div>
        </>
      )}
    </div>
  );
}
