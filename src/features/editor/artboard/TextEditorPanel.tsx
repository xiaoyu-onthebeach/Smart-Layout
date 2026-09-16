import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import {
  BORDER_STYLE_ICONS,
  IconNumberField,
  IconPopoverButton,
  INLINE_VALUE_COL_WIDTH,
  InlineColorField,
  InlineRow,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  MatchSelectButton,
  PopoverMenuItem,
  PositionSection,
  SegmentedControl,
  SelectField,
  ShadowSection,
  type EditorTarget,
} from './PanelKit';

type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';
/** Purely a visual choice for text — CSS `text-stroke` has no dashed/dotted rendering mode, so
 * only 'solid' actually looks any different, but the row stays for visual parity with the
 * scene/shape panels' own Border section (and in case that CSS limitation ever gets worked around). */
type SolidBorderStyle = Exclude<BorderStyle, 'none'>;
const BORDER_STYLE_LABELS: Record<SolidBorderStyle, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

const FONT_FAMILIES = ['Saans', 'Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'];
const FONT_WEIGHTS = [
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semi Bold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'Extra Bold', value: 800 },
];
const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left', icon: <AlignLeft className="size-4" /> },
  { value: 'center', label: 'Center', icon: <AlignCenter className="size-4" /> },
  { value: 'right', label: 'Right', icon: <AlignRight className="size-4" /> },
] as const;
const DECORATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'underline', label: 'Underline' },
  { value: 'line-through', label: 'Strikethrough' },
] as const;

/** Right-corner panel shown while one or more text elements are selected — edits broadcast to every target. */
export function TextEditorPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const [contentDraft, setContentDraft] = useState(primary.content ?? '');
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setContentDraft(primary.content ?? ''), [primary.id, primary.content]);

  // Grows/shrinks with whatever's typed — resetting to 'auto' first (rather than reading
  // scrollHeight directly against whatever height is already set) is what lets it shrink back
  // down too, not just grow.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [contentDraft]);

  // Whether the Border section shows its Color/Weight fields — same collapsed-by-default,
  // reset-per-selection convention as the banner panel's own Border section.
  const [borderExpanded, setBorderExpanded] = useState(() => (primary.style.strokeWidth ?? 0) > 0);
  useEffect(() => {
    setBorderExpanded((primary.style.strokeWidth ?? 0) > 0);
  }, [primary.id]);

  function patchStyle(patch: Partial<LayoutElement['style']>) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, ...patch } });
  }
  function patchRotation(rotation: number) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { rotation });
  }
  function commitContent(content: string) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { content });
  }

  // No Style (solid/dashed/dotted) row here, unlike the scene/shape panels' own Border section —
  // CSS `text-stroke` has no dashed/dotted mode, so `strokeStyle` would have nothing to render.
  function toggleBorder() {
    if (borderExpanded) {
      patchStyle({ strokeWidth: 0 });
      setBorderExpanded(false);
    } else {
      patchStyle({ strokeWidth: primary.style.strokeWidth || 1, strokeStyle: 'solid' });
      setBorderExpanded(true);
    }
  }

  const align = (primary.style.align as 'left' | 'center' | 'right') ?? 'left';
  const decoration = primary.style.textDecoration ?? 'none';
  const strokeStyle: SolidBorderStyle = primary.style.strokeStyle ?? 'solid';
  const title =
    targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個のテキストレイヤー` : `${targets.length} text layers`;

  const fontWeightOptions = FONT_WEIGHTS.map((w) => ({ ...w, label: t(w.label) }));
  const alignOptions = ALIGN_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));
  const decorationOptions = DECORATION_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));
  const borderStyleOptions: { value: SolidBorderStyle; label: string; icon: React.ReactNode }[] = (['solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  return (
    <PanelCard gap={16}>
      {/* This asset's own glyph sits ~1px above its true center too (see SceneEditorPanel's own
          banner-icon nudge for the same reasoning) — the icon's box is already centered against
          the title via `items-center`, this just recenters the glyph within that box. */}
      <PanelHeader
        icon={<PanelHeaderIcon src="/icons/edit_panel/editing.svg" style={{ transform: 'translateY(1px)' }} />}
        title={title}
        trailing={<MatchSelectButton targets={targets} />}
      />

      <PositionSection x={primary.frame.x} y={primary.frame.y} showPositionMode={false} resetKey={primary.id} />

      {/* Appended to the same visual section as Position/Alignment above (no divider in between) —
          Size stays locked (text always auto-fits its own box to content + font size, see
          EditableTextElement's own measurement effect; there's nothing here to type into), while
          Rotation is a real, editable mirror of dragging just outside a selected corner handle. */}
      <div className="flex flex-col gap-3 px-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/65">{t('Size')}</span>
          <div className="flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm opacity-50">
              <span className="text-white/65">W</span>
              <span className="ml-auto text-white">{Math.round(primary.frame.w)}</span>
            </div>
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm opacity-50">
              <span className="text-white/65">H</span>
              <span className="ml-auto text-white">{Math.round(primary.frame.h)}</span>
            </div>
            <img src="/icons/layer%20list/Unlock%20.svg" alt="" className="size-3.5 shrink-0 opacity-45" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-white/65">{t('Rotation')}</span>
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-[#26262C] px-3 text-sm" style={{ width: 119 }}>
            <img src="/icons/angle.svg" alt="" className="size-4 shrink-0" />
            <input
              type="text"
              defaultValue={String(Math.round(primary.rotation ?? 0))}
              key={`${primary.id}-${Math.round(primary.rotation ?? 0)}`}
              onBlur={(e) => patchRotation(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-0 min-w-0 flex-1 bg-transparent text-white outline-none"
            />
            <span className="shrink-0 text-white">°</span>
          </div>
        </div>
      </div>

      <PanelDivider />

      <PanelSection label={t('Content')}>
        <textarea
          ref={contentRef}
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value)}
          onBlur={() => commitContent(contentDraft)}
          placeholder={t('placeholder text')}
          rows={1}
          className="w-full resize-none overflow-hidden rounded-lg bg-[#26262C] p-3 text-sm text-chrome-fg shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)] outline-none placeholder:text-white/45"
        />
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Typography')}>
        <div className="flex items-center gap-2">
          <SelectField
            value={primary.style.fontFamily ?? 'Saans'}
            options={FONT_FAMILIES.map((f) => ({ value: f, label: <span style={{ fontFamily: f }}>{f}</span> }))}
            onChange={(fontFamily) => patchStyle({ fontFamily })}
          />
        </div>
        <div className="flex items-center gap-2">
          <SelectField
            value={String(primary.style.fontWeight ?? 600)}
            options={fontWeightOptions.map((w) => ({ value: String(w.value), label: w.label }))}
            onChange={(v) => patchStyle({ fontWeight: Number(v) })}
          />
          <NumberField className="w-14 shrink-0" value={String(primary.style.fontSize ?? 16)} onCommit={(v) => patchStyle({ fontSize: Math.max(1, Number(v) || 16) })} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Spacing')}</span>
            <IconNumberField
              icon="/icons/letter-spacing.svg"
              value={String(primary.style.letterSpacing ?? 0)}
              onCommit={(v) => patchStyle({ letterSpacing: Number(v) || 0 })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Stretch')}</span>
            <IconNumberField
              icon="/icons/letter-stretch.svg"
              value={String(primary.style.stretch ?? 0)}
              onCommit={(v) => patchStyle({ stretch: Number(v) || 0 })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Line height')}</span>
            <IconNumberField
              icon="/icons/line-height.svg"
              value={String(primary.style.lineHeight ?? 1.2)}
              onCommit={(v) => patchStyle({ lineHeight: Number(v) || 1.2 })}
            />
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Alignment')}</span>
            <SegmentedControl
              options={alignOptions as unknown as { value: 'left' | 'center' | 'right'; label: string; icon: React.ReactNode }[]}
              value={align}
              onChange={(v) => patchStyle({ align: v })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Decoration')}</span>
            <IconPopoverButton icon="/icons/edit_panel/text_decoration.svg" active={decoration !== 'none'}>
              {decorationOptions.map((opt) => (
                <PopoverMenuItem key={opt.value} active={opt.value === decoration} onClick={() => patchStyle({ textDecoration: opt.value })}>
                  {opt.label}
                </PopoverMenuItem>
              ))}
            </IconPopoverButton>
          </div>
        </div>
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <InlineRow label={t('Fill')}>
          <InlineColorField color={primary.style.color ?? '#ffffff'} onChange={(color) => patchStyle({ color })} />
        </InlineRow>
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
