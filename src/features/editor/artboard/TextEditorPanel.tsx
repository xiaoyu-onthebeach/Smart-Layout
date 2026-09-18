import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  ALargeSmall,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseLower,
  CaseUpper,
  Italic,
  Minus,
  Plus,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import {
  BORDER_STYLE_ICONS,
  IconNumberField,
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
/** One item inside a `DecorationSegmented` group — shares `SegmentedControl`'s own per-item look
 * (dark pill, lighter highlight when active) but as a bare toggle rather than an exclusive-choice
 * group, since the "Style" row's three toggles (bold/italic/underline) are independent of each
 * other, and "Case"/"Features" both want a click on the already-active option to turn it back off
 * (an exclusive `SegmentedControl` has no "select nothing" state to return to). */
function DecorationToggleItem({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-full flex-1 items-center justify-center rounded-md text-white/70 transition-colors',
        active ? 'bg-[#41414A] text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)]' : 'hover:bg-white/5',
      )}
    >
      {children}
    </button>
  );
}

function DecorationSegmented({ children }: { children: ReactNode }) {
  return <div className="flex h-8 w-[122px] shrink-0 items-center gap-0.5 rounded-lg bg-chrome-border-subtle p-0.5">{children}</div>;
}

function DecorationRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-8 w-full items-center gap-1">
      <span className="w-[54px] shrink-0 text-[11px] tracking-[-0.01em] text-white/65">{label}</span>
      {children}
    </div>
  );
}

/**
 * Floats to the left of the panel, top-aligned with the "Decoration" row that opens it — same
 * technique `ColorPickerPopover` uses for its own trigger-relative positioning. Three independent
 * groups: Style (bold/italic/underline, all can be on at once), Case and Features (each exclusive,
 * but clicking the active option again turns it back off — there's no dedicated "none" glyph to
 * click instead).
 */
function DecorationPopover({
  fontWeight,
  fontStyle,
  textDecoration,
  textTransform,
  verticalAlign,
  onPatch,
  children,
}: {
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline' | 'line-through';
  textTransform: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
  verticalAlign: 'baseline' | 'super' | 'sub';
  onPatch: (patch: Partial<LayoutElement['style']>) => void;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const virtualAnchorRef = useRef({ getBoundingClientRect: () => new DOMRect() });
  if (anchor) {
    const { left, top } = anchor;
    virtualAnchorRef.current = { getBoundingClientRect: () => new DOMRect(left, top, 1, 1) };
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      const trigger = triggerRef.current;
      const panel = trigger?.closest('[data-panel-card]');
      const panelRect = (panel ?? trigger)?.getBoundingClientRect();
      // The row's own top (its "Decoration" label included), not just the button's — the button
      // alone sits a bit lower, since the label takes up the row's own first line above it.
      const rowRect = (trigger?.parentElement ?? trigger)?.getBoundingClientRect();
      if (panelRect && rowRect) setAnchor({ left: panelRect.left, top: rowRect.top });
    }
    setOpen(next);
  }

  const triggerWithRef = isValidElement(children) ? cloneElement(children as ReactElement<{ ref?: Ref<HTMLElement> }>, { ref: triggerRef }) : children;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor virtualRef={virtualAnchorRef} />
      <PopoverTrigger asChild>{triggerWithRef}</PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        className="flex flex-col gap-2 border-[#2F2F37] p-4 text-chrome-fg"
        style={{ width: 212, background: '#19191D', borderRadius: 16, boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)' }}
      >
        <span className="text-[11px] font-medium tracking-[-0.01em] text-white/65">{t('Text decoration')}</span>

        <DecorationRow label={t('Style')}>
          <DecorationSegmented>
            <DecorationToggleItem active={fontWeight >= 700} onClick={() => onPatch({ fontWeight: fontWeight >= 700 ? 400 : 700 })} label={t('Bold')}>
              <Bold className="size-4" />
            </DecorationToggleItem>
            <DecorationToggleItem
              active={fontStyle === 'italic'}
              onClick={() => onPatch({ fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' })}
              label={t('Italic')}
            >
              <Italic className="size-4" />
            </DecorationToggleItem>
            <DecorationToggleItem
              active={textDecoration === 'underline'}
              onClick={() => onPatch({ textDecoration: textDecoration === 'underline' ? 'none' : 'underline' })}
              label={t('Underline')}
            >
              <Underline className="size-4" />
            </DecorationToggleItem>
          </DecorationSegmented>
        </DecorationRow>

        <DecorationRow label={t('Case')}>
          <DecorationSegmented>
            <DecorationToggleItem
              active={textTransform === 'uppercase'}
              onClick={() => onPatch({ textTransform: textTransform === 'uppercase' ? 'none' : 'uppercase' })}
              label={t('Uppercase')}
            >
              <CaseUpper className="size-4" />
            </DecorationToggleItem>
            <DecorationToggleItem
              active={textTransform === 'capitalize'}
              onClick={() => onPatch({ textTransform: textTransform === 'capitalize' ? 'none' : 'capitalize' })}
              label={t('Title case')}
            >
              <ALargeSmall className="size-4" />
            </DecorationToggleItem>
            <DecorationToggleItem
              active={textTransform === 'lowercase'}
              onClick={() => onPatch({ textTransform: textTransform === 'lowercase' ? 'none' : 'lowercase' })}
              label={t('Lowercase')}
            >
              <CaseLower className="size-4" />
            </DecorationToggleItem>
          </DecorationSegmented>
        </DecorationRow>

        <DecorationRow label={t('Features')}>
          <DecorationSegmented>
            <DecorationToggleItem
              active={verticalAlign === 'super'}
              onClick={() => onPatch({ verticalAlign: verticalAlign === 'super' ? 'baseline' : 'super' })}
              label={t('Superscript')}
            >
              <Superscript className="size-4" />
            </DecorationToggleItem>
            <DecorationToggleItem
              active={verticalAlign === 'sub'}
              onClick={() => onPatch({ verticalAlign: verticalAlign === 'sub' ? 'baseline' : 'sub' })}
              label={t('Subscript')}
            >
              <Subscript className="size-4" />
            </DecorationToggleItem>
          </DecorationSegmented>
        </DecorationRow>
      </PopoverContent>
    </Popover>
  );
}

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
  const textDecoration = primary.style.textDecoration ?? 'none';
  const fontStyle = primary.style.fontStyle ?? 'normal';
  const textTransform = primary.style.textTransform ?? 'none';
  const verticalAlign = primary.style.verticalAlign ?? 'baseline';
  // Whether *any* decoration toggle is on — the trigger button's own "active" look doesn't try to
  // summarize which ones, just that the panel isn't in its all-off default state.
  const hasDecoration =
    (primary.style.fontWeight ?? 400) >= 700 || fontStyle === 'italic' || textDecoration === 'underline' || textTransform !== 'none' || verticalAlign !== 'baseline';
  const strokeStyle: SolidBorderStyle = primary.style.strokeStyle ?? 'solid';
  const title =
    targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個のテキストレイヤー` : `${targets.length} text layers`;

  const fontWeightOptions = FONT_WEIGHTS.map((w) => ({ ...w, label: t(w.label) }));
  const alignOptions = ALIGN_OPTIONS.map((opt) => ({ ...opt, label: t(opt.label) }));
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
          <NumberField
            scrubbable
            className="w-14 shrink-0"
            value={String(primary.style.fontSize ?? 16)}
            onCommit={(v) => patchStyle({ fontSize: Math.max(1, Number(v) || 16) })}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Spacing')}</span>
            <IconNumberField
              scrubbable
              icon="/icons/letter-spacing.svg"
              value={String(primary.style.letterSpacing ?? 0)}
              onCommit={(v) => patchStyle({ letterSpacing: Number(v) || 0 })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Stretch')}</span>
            <IconNumberField
              scrubbable
              icon="/icons/letter-stretch.svg"
              value={String(primary.style.stretch ?? 0)}
              onCommit={(v) => patchStyle({ stretch: Number(v) || 0 })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Line height')}</span>
            <IconNumberField
              scrubbable
              scrubStep={0.01}
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
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-white/65">{t('Decoration')}</span>
            <DecorationPopover
              fontWeight={primary.style.fontWeight ?? 400}
              fontStyle={fontStyle}
              textDecoration={textDecoration}
              textTransform={textTransform}
              verticalAlign={verticalAlign}
              onPatch={patchStyle}
            >
              {/* No border/background of its own at rest — matching every other row's control
                  here would make this the only one drawing attention when nothing's toggled on
                  (see `hasDecoration`, used only to decide whether this reads as "on" while closed). */}
              <button
                type="button"
                aria-label={t('Decoration')}
                className={cn(
                  'flex h-8 w-full items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white',
                  hasDecoration && 'text-white',
                )}
              >
                <img src="/icons/edit_panel/text_decoration.svg" alt="" className="size-8" />
              </button>
            </DecorationPopover>
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
