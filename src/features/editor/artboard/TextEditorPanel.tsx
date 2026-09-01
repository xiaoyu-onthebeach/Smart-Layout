import { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import {
  ColorRow,
  IconNumberField,
  IconPopoverButton,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelFooter,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  MatchSelectButton,
  PopoverMenuItem,
  PositionSection,
  SegmentedControl,
  SelectField,
  type EditorTarget,
} from './PanelKit';

const FONT_FAMILIES = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'];
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

  useEffect(() => setContentDraft(primary.content ?? ''), [primary.id, primary.content]);

  function patchStyle(patch: Partial<LayoutElement['style']>) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, ...patch } });
  }
  function commitContent(content: string) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { content });
  }

  const align = (primary.style.align as 'left' | 'center' | 'right') ?? 'left';
  const decoration = primary.style.textDecoration ?? 'none';
  const title =
    targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個のテキストレイヤー` : `${targets.length} text layers`;

  const fontWeightOptions = FONT_WEIGHTS.map((w) => ({ ...w, label: t(w.label) }));
  const alignOptions = ALIGN_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));
  const decorationOptions = DECORATION_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));

  return (
    <PanelCard>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/edit_panel/editing.svg" />} title={title} trailing={<MatchSelectButton targets={targets} />} />

      <PositionSection x={primary.frame.x} y={primary.frame.y} />

      <PanelDivider />

      <PanelSection label={t('Content')}>
        <textarea
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value)}
          onBlur={() => commitContent(contentDraft)}
          placeholder={t('placeholder text')}
          rows={2}
          className="w-full resize-none rounded-lg bg-[#26262C] p-3 text-sm text-chrome-fg shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)] outline-none placeholder:text-white/45"
        />
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Style')}>
        <div className="flex items-center gap-2">
          <SelectField
            value={primary.style.fontFamily ?? 'Inter'}
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

      <PanelSection label={t('Fill')}>
        <ColorRow color={primary.style.color ?? '#ffffff'} onChange={(color) => patchStyle({ color })} />
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Border')}>
        <ColorRow color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} />
        <NumberField className="w-full" value={String(primary.style.strokeWidth ?? 0)} onCommit={(v) => patchStyle({ strokeWidth: Math.max(0, Number(v) || 0) })} />
      </PanelSection>

      <PanelFooter
        visible={primary.visible}
        onToggleVisible={() => {
          const next = !primary.visible;
          for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { visible: next });
        }}
      />
    </PanelCard>
  );
}
