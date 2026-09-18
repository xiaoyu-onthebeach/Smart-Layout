import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  BORDER_STYLE_ICONS,
  CornerRadiusRow,
  INLINE_VALUE_COL_WIDTH,
  InlineColorField,
  InlineRow,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  PositionSection,
  SegmentedControl,
  MatchSelectButton,
  ShadowSection,
  type EditorTarget,
} from './PanelKit';

type SolidBorderStyle = 'solid' | 'dashed' | 'dotted';
const BORDER_STYLE_LABELS: Record<SolidBorderStyle, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/** Right-corner panel shown while one or more shape elements are selected — edits broadcast to every target. */
export function ShapeEditorPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const [aspectLocked, setAspectLocked] = useState(false);

  // Same collapsed-by-default, reset-per-selection convention as the text panel's own Border section.
  const [borderExpanded, setBorderExpanded] = useState(() => (primary.style.strokeWidth ?? 0) > 0);

  function patchStyle(patch: Partial<LayoutElement['style']>) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, ...patch } });
  }
  function patchRotation(rotation: number) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { rotation });
  }
  function commitWidth(raw: string) {
    const nextW = Math.max(1, Math.round(Number(raw) || primary.frame.w));
    for (const tgt of targets) {
      const f = tgt.element.frame;
      const nextH = aspectLocked ? Math.max(1, Math.round(f.h * (nextW / f.w))) : f.h;
      updateElement(tgt.layoutId, tgt.element.id, { frame: { ...f, w: nextW, h: nextH } });
    }
  }
  function commitHeight(raw: string) {
    const nextH = Math.max(1, Math.round(Number(raw) || primary.frame.h));
    for (const tgt of targets) {
      const f = tgt.element.frame;
      const nextW = aspectLocked ? Math.max(1, Math.round(f.w * (nextH / f.h))) : f.w;
      updateElement(tgt.layoutId, tgt.element.id, { frame: { ...f, w: nextW, h: nextH } });
    }
  }

  function toggleBorder() {
    if (borderExpanded) {
      patchStyle({ strokeWidth: 0 });
      setBorderExpanded(false);
    } else {
      patchStyle({ strokeWidth: primary.style.strokeWidth || 1, strokeStyle: primary.style.strokeStyle ?? 'solid' });
      setBorderExpanded(true);
    }
  }

  const strokeStyle: SolidBorderStyle = primary.style.strokeStyle ?? 'solid';
  const title =
    targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個のシェイプレイヤー` : `${targets.length} shape layers`;

  const borderStyleOptions: { value: SolidBorderStyle; label: string; icon: React.ReactNode }[] = (['solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  return (
    <PanelCard gap={16}>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/edit_panel/shape%20header.svg" />} title={title} trailing={<MatchSelectButton targets={targets} />} />

      <PositionSection x={primary.frame.x} y={primary.frame.y} showPositionMode={false} resetKey={primary.id} />

      {/* Appended to the same visual section as Position/Alignment above (no divider in between) —
          unlike text (which always auto-fits to content), a shape's box is the thing being sized
          directly, so Size stays real and editable here, with a lock toggle to scale W/H together. */}
      <div className="flex flex-col gap-3 px-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/65">{t('Size')}</span>
          <div className="flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm">
              <span className="shrink-0 text-white/65">W</span>
              <input
                type="text"
                defaultValue={String(Math.round(primary.frame.w))}
                key={`${primary.id}-w-${Math.round(primary.frame.w)}`}
                onBlur={(e) => commitWidth(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-0 min-w-0 flex-1 bg-transparent text-right text-white outline-none"
              />
            </div>
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm">
              <span className="shrink-0 text-white/65">H</span>
              <input
                type="text"
                defaultValue={String(Math.round(primary.frame.h))}
                key={`${primary.id}-h-${Math.round(primary.frame.h)}`}
                onBlur={(e) => commitHeight(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-0 min-w-0 flex-1 bg-transparent text-right text-white outline-none"
              />
            </div>
            <button
              type="button"
              aria-label={aspectLocked ? t('Unlock aspect ratio') : t('Lock aspect ratio')}
              onClick={() => setAspectLocked((v) => !v)}
              className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors', aspectLocked ? 'bg-white/15' : 'hover:bg-white/10')}
            >
              <img src="/icons/layer%20list/Unlock%20.svg" alt="" className={cn('size-3.5 transition-opacity', aspectLocked ? 'opacity-100' : 'opacity-45')} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/65">{t('Rotation')}</span>
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm" style={{ width: 119 }}>
            <img src="/icons/angle.svg" alt="" className="size-4 shrink-0" />
            <input
              type="text"
              defaultValue={String(Math.round(primary.rotation ?? 0))}
              key={`${primary.id}-rot-${Math.round(primary.rotation ?? 0)}`}
              onBlur={(e) => patchRotation(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-0 min-w-0 flex-1 bg-transparent text-white outline-none"
            />
            <span className="shrink-0 text-white">°</span>
          </div>
        </div>
      </div>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <InlineRow label={t('Fill')}>
          <InlineColorField color={primary.style.fill ?? '#d9d9d9'} onChange={(fill) => patchStyle({ fill })} />
        </InlineRow>

        <CornerRadiusRow value={primary.style.radius ?? 0} onCommit={(radius) => patchStyle({ radius })} max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)} />
      </PanelSection>

      <PanelDivider />

      <div className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Border')}</span>
          <button
            type="button"
            aria-label={borderExpanded ? t('Remove border') : t('Add border')}
            onClick={toggleBorder}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {borderExpanded ? <Minus className="size-4" /> : <Plus className="size-4" />}
          </button>
        </div>
        {borderExpanded && (
          <div className="flex flex-col gap-3">
            <InlineRow label={t('Style')}>
              <div style={{ width: INLINE_VALUE_COL_WIDTH }}>
                <SegmentedControl options={borderStyleOptions} value={strokeStyle} onChange={(v) => patchStyle({ strokeStyle: v })} />
              </div>
            </InlineRow>

            <InlineRow label={t('Color')}>
              <InlineColorField color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} />
            </InlineRow>

            <InlineRow label={t('Weight')}>
              <div className="flex" style={{ width: INLINE_VALUE_COL_WIDTH }}>
                <NumberField
                  scrubbable
                  className="w-[72px]"
                  value={String(primary.style.strokeWidth ?? 1)}
                  onCommit={(v) => patchStyle({ strokeWidth: Math.max(0, Number(v) || 0) })}
                />
              </div>
            </InlineRow>
          </div>
        )}
      </div>

      <PanelDivider />

      <ShadowSection dropShadow={primary.style.dropShadow} innerShadow={primary.style.innerShadow} onPatch={patchStyle} />
    </PanelCard>
  );
}
