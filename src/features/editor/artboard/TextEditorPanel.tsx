import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  ALargeSmall,
  AlignCenter,
  AlignJustify,
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
  CornerRadiusRow,
  fieldHighlightStyle,
  IconNumberField,
  IconSlot,
  InlineColorField,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  MatchSelectRow,
  PositionSection,
  SegmentedControl,
  SelectField,
  ShadowSection,
  useFieldHighlight,
  useMatchSelectVisible,
  type EditorTarget,
} from './PanelKit';
import { AutoLayoutSection } from './AutoLayoutSection';

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
  { value: 'justify', label: 'Justify', icon: <AlignJustify className="size-4" /> },
] as const;
/** The box-level counterpart to `ALIGN_OPTIONS` above — where the text sits vertically within its
 * own box, as opposed to left/center/right within a line. A dedicated icon set (`public/icons/
 * Item/text-align-*.svg`), distinct from the Position section's "align to frame" row
 * (`layers-align-top/middle/bottom.svg` in `PanelKit.tsx`), which means something different. */
const VERTICAL_ALIGN_OPTIONS = [
  { value: 'top', label: 'Top', icon: '/icons/Item/text-align-top%2016.svg' },
  { value: 'middle', label: 'Middle', icon: '/icons/Item/text-align-middle%2016.svg' },
  { value: 'bottom', label: 'Bottom', icon: '/icons/Item/text-align-bottom%2016.svg' },
] as const;

/** The Typography section's own pair of alignment rows (horizontal text-align, and the box-level
 * vertical-align stacked beneath it) — a bespoke look distinct from the shared `SegmentedControl`:
 * the active item sits on `#131316` (the same "pressed" dark `CornerRadiusRow`'s mode toggle uses)
 * rather than the shared control's lighter `#41414A`, per this row's own spec. */
function TextAlignSegmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; icon: ReactNode }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: '#26262C' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="flex h-6 flex-1 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          style={
            opt.value === value
              ? { background: '#131316', color: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.02)' }
              : undefined
          }
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

/** The Border section's own row shape — a fixed-width label column (wide enough for "Position",
 * its longest label) followed by the value, as a real 2-column grid rather than the shared
 * `InlineRow`'s label-auto-width + `justify-between` pairing. `InlineRow` sizes itself to its own
 * label+value content with no width of its own, so used standalone its label column's width (and
 * therefore the value column's left edge) drifts per row depending on how long that row's own
 * label happens to be — fine when every row's value has its own independent fixed width, but not
 * when the goal is literally "every row's title column lines up." A plain grid with an explicit
 * pixel column guarantees that across the 4 independent row instances here, which `InlineRow`'s
 * own "auto" sizing can't (each row is its own separate layout, so "auto" would size to that row's
 * own content, not a width shared with the others). `InlineRow` itself stays untouched — it's
 * shared with the Shape/Image panels' own Border section. */
function BorderFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {/* Both columns are a fixed 100.5px each (209px total with the 8px gap, matching the row
          width the original spec measured) rather than the value column stretching to fill the
          rest of the row — any space left over after it (this row's own outer wrapper is still
          `flex-1`) just sits blank before the reserved `IconSlot`. */}
      <div className="grid min-w-0 flex-1 grid-cols-[100.5px_100.5px] items-center gap-2">
        <span className="text-[9px] leading-4 text-white/65">{label}</span>
        {children}
      </div>
      <IconSlot />
    </div>
  );
}

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
      <span className="w-[54px] shrink-0 text-[9px] leading-4 tracking-[-0.01em] text-white/65">{label}</span>
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
  const textRangeSelection = useAppStore((s) => s.textRangeSelection);
  const setTextRangeSelection = useAppStore((s) => s.setTextRangeSelection);
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
  const rotationField = useFieldHighlight();
  const rotationRounded = Math.round(primary.rotation ?? 0);
  // Controlled (not the usual defaultValue+key-remount pattern) so the invisible mirror span below
  // can track every keystroke, not just the value committed on blur — needed for the ° to stay
  // flush against the number while typing, not just once the field is done being edited.
  const [rotationDraft, setRotationDraft] = useState(String(rotationRounded));
  useEffect(() => setRotationDraft(String(rotationRounded)), [rotationRounded]);

  function patchStyle(patch: Partial<LayoutElement['style']>) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, ...patch } });
  }

  // A real (non-collapsed, non-whole-text) highlight left over from typing inside `primary` — only
  // meaningful for a single selected layer, matching how `textRangeSelection` itself only ever
  // tracks one element's own contentEditable at a time.
  const content = primary.content ?? '';
  const partialSelection =
    targets.length === 1 &&
    textRangeSelection &&
    textRangeSelection.layoutId === targets[0].layoutId &&
    textRangeSelection.elementId === primary.id &&
    textRangeSelection.start !== textRangeSelection.end &&
    !(textRangeSelection.start === 0 && textRangeSelection.end === content.length)
      ? textRangeSelection
      : null;

  /** Spacing/Stretch's own commit: applies uniformly (clearing any previous range override) unless
   * a substring is still highlighted from the last time this element was being edited, in which
   * case it becomes that substring's own one-off value instead — see `letterSpacingRange`/
   * `stretchRange`. Consumes (clears) the highlight afterward, so the next change without
   * reselecting falls back to applying uniformly again. */
  function patchRangeableStyle(rangeKey: 'letterSpacingRange' | 'stretchRange', flatKey: 'letterSpacing' | 'stretch', raw: string) {
    // Blurring a "Mixed" field untouched must not silently zero it out — only a real typed number
    // commits; the sentinel string itself is never a legitimate value.
    if (raw === t('Mixed')) return;
    const value = Number(raw) || 0;
    if (partialSelection) {
      patchStyle({ [rangeKey]: { start: partialSelection.start, end: partialSelection.end, value } });
      setTextRangeSelection(null);
    } else {
      patchStyle({ [flatKey]: value, [rangeKey]: undefined });
    }
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

  const align = (primary.style.align as 'left' | 'center' | 'right' | 'justify') ?? 'left';
  const boxVerticalAlign = primary.style.boxVerticalAlign ?? 'top';
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
  const borderStyleOptions: { value: SolidBorderStyle; label: string; icon: React.ReactNode }[] = (['solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));
  const strokePosition = primary.style.strokePosition ?? 'center';
  const borderPositionOptions: { value: 'center' | 'inside' | 'outside'; label: string; icon: React.ReactNode }[] = [
    { value: 'inside', label: t('Inside'), icon: <img src="/icons/inside.svg" alt="" className="size-4" /> },
    { value: 'center', label: t('Center'), icon: <img src="/icons/center.svg" alt="" className="size-4" /> },
    { value: 'outside', label: t('Outside'), icon: <img src="/icons/outside.svg" alt="" className="size-4" /> },
  ];

  const showMatchSelect = useMatchSelectVisible(targets);

  return (
    <PanelCard gap={0}>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/edit_panel/Panel_text.svg" />} title={title} />

      {showMatchSelect && (
        <>
          <PanelDivider />
          <MatchSelectRow targets={targets} />
          <PanelDivider />
        </>
      )}

      <PositionSection
        x={primary.frame.x}
        y={primary.frame.y}
        w={primary.frame.w}
        h={primary.frame.h}
        rotation={primary.rotation ?? 0}
        showPositionMode={false}
        resetKey={primary.id}
        // Rotation is appended inside Position's own padded block (no divider in between) — a
        // real, editable mirror of dragging just outside a selected corner handle. The box's W/H
        // live in the Layout section below instead, alongside Auto Layout.
        extra={
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
                    they were plain siblings of it, which is what the actual gap turned out to be,
                    not the input's own sizing. */}
                <div className="flex shrink-0 items-center">
                  {/* Exact-width auto-sizing via an invisible mirror span that sets the wrapper's
                      own size through normal text flow, with the input absolutely positioned over
                      it so it never contributes its own (much wider) intrinsic size to that
                      calculation — a `size`/`ch`-based width only approximates a proportional
                      font's real glyph widths, which still left a gap of its own before the °. */}
                  <span className="relative inline-block shrink-0">
                    <span className="invisible whitespace-pre">{rotationDraft || '0'}</span>
                    <input
                      type="text"
                      value={rotationDraft}
                      onChange={(e) => setRotationDraft(e.target.value)}
                      onFocus={() => rotationField.setFocused(true)}
                      onBlur={(e) => {
                        rotationField.setFocused(false);
                        patchRotation(Number(e.target.value) || 0);
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
        }
      />

      <PanelDivider />

      <AutoLayoutSection targets={targets} />

      <PanelDivider />

      <PanelSection label={t('Content')}>
        <div className="flex items-start gap-2">
          <textarea
            ref={contentRef}
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            onBlur={() => commitContent(contentDraft)}
            placeholder={t('placeholder text')}
            rows={1}
            className="min-w-0 flex-1 resize-none overflow-hidden rounded-lg bg-[#26262C] p-3 text-sm text-chrome-fg shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)] outline-none placeholder:text-white/45"
          />
          <IconSlot />
        </div>
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Typography')}>
        <div className="flex items-center gap-2">
          <SelectField
            value={primary.style.fontFamily ?? 'Saans'}
            options={FONT_FAMILIES.map((f) => ({ value: f, label: <span style={{ fontFamily: f }}>{f}</span> }))}
            onChange={(fontFamily) => patchStyle({ fontFamily })}
          />
          <IconSlot />
        </div>
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <SelectField
              value={String(primary.style.fontWeight ?? 600)}
              options={fontWeightOptions.map((w) => ({ value: String(w.value), label: w.label }))}
              onChange={(v) => patchStyle({ fontWeight: Number(v) })}
            />
            <NumberField
              scrubbable
              className="min-w-0 text-[11px] font-normal"
              value={String(primary.style.fontSize ?? 16)}
              onCommit={(v) => patchStyle({ fontSize: Math.max(1, Number(v) || 16) })}
            />
          </div>
          <IconSlot />
        </div>

        {/* 2-column grid, not 3-across — Spacing/Stretch share the first row, Line height starts
            the second on its own (left-aligned, not stretched to fill the row). The reserved icon
            column sits once, outside the grid, so it reads as one continuous column alongside the
            whole group rather than only appearing next to Line height's own row. */}
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] leading-4 text-white/65">{t('Spacing')}</span>
              <IconNumberField
                scrubbable={!primary.style.letterSpacingRange}
                icon="/icons/letter-spacing.svg"
                value={primary.style.letterSpacingRange ? t('Mixed') : String(primary.style.letterSpacing ?? 0)}
                unit="px"
                onCommit={(v) => patchRangeableStyle('letterSpacingRange', 'letterSpacing', v)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] leading-4 text-white/65">{t('Stretch')}</span>
              <IconNumberField
                scrubbable={!primary.style.stretchRange}
                icon="/icons/letter-stretch.svg"
                value={primary.style.stretchRange ? t('Mixed') : String(primary.style.stretch ?? 0)}
                unit="px"
                onCommit={(v) => patchRangeableStyle('stretchRange', 'stretch', v)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] leading-4 text-white/65">{t('Line height')}</span>
              <IconNumberField
                scrubbable
                scrubStep={0.01}
                icon="/icons/line-height.svg"
                value={String(primary.style.lineHeight ?? 1.2)}
                unit="px"
                onCommit={(v) => patchStyle({ lineHeight: Number(v) || 1.2 })}
              />
            </div>
          </div>
          <IconSlot />
        </div>

        <div className="flex items-start gap-2">
          <div className="flex flex-1 flex-col gap-1">
            {/* One "Alignment" label governs both rows below it — line-level text-align, then the
                box-level vertical-align beneath it (where the text sits once the box is taller than
                its content) — rather than each getting its own separate caption. */}
            <span className="text-[9px] leading-4 text-white/45">{t('Alignment')}</span>
            <div className="flex flex-col gap-2">
              <TextAlignSegmented options={ALIGN_OPTIONS} value={align} onChange={(v) => patchStyle({ align: v })} />
              <TextAlignSegmented
                options={VERTICAL_ALIGN_OPTIONS.map((opt) => ({ value: opt.value, icon: <img src={opt.icon} alt="" className="size-4" /> }))}
                value={boxVerticalAlign}
                onChange={(v) => patchStyle({ boxVerticalAlign: v })}
              />
            </div>
          </div>
          <DecorationPopover
            fontWeight={primary.style.fontWeight ?? 400}
            fontStyle={fontStyle}
            textDecoration={textDecoration}
            textTransform={textTransform}
            verticalAlign={verticalAlign}
            onPatch={patchStyle}
          >
            {/* Icon only (no label, no border/background of its own at rest) — sits beside the two
                alignment rows rather than taking a paired column the way it used to. The button
                itself matches every other reserved icon slot's own 28px width (`IconSlot`), with a
                24px icon inside it (2px of padding on every side), rather than filling it edge to
                edge. */}
            <button
              type="button"
              aria-label={t('Decoration')}
              className={cn(
                'mt-5 flex size-7 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white',
                hasDecoration && 'text-white',
              )}
            >
              <img src="/icons/edit_panel/text_decoration.svg" alt="" className="size-6" />
            </button>
          </DecorationPopover>
        </div>
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        {/* A true equal 2-column grid, with the same trailing reserved slot every other row in
            this panel gets — not the shared `InlineRow`'s own label-auto-width + fixed-151px pill
            (`InlineRow` stays untouched; it's shared with the Shape/Image/Group panels' own
            Fill/Border rows). `InlineColorField`'s own "compact" padding/gaps are squeezed about
            as tight as they can go and still read clearly, to fit its hex + opacity text in half
            of this row's own ~215px. */}
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2">
            <span className="text-[9px] leading-4 text-white/65">{t('Text fill')}</span>
            <InlineColorField color={primary.style.color ?? '#ffffff'} onChange={(color) => patchStyle({ color })} width="flex-1" />
          </div>
          <IconSlot />
        </div>
        {/* The box's background, behind the glyphs (and inside any Auto Layout padding) — off by
            default; the picker's own "no fill" preset is how it's turned back off. */}
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2">
            <span className="text-[9px] leading-4 text-white/65">{t('Shape fill')}</span>
            <InlineColorField color={primary.style.fill} onChange={(fill) => patchStyle({ fill })} onClear={() => patchStyle({ fill: undefined })} width="flex-1" />
          </div>
          <IconSlot />
        </div>
        {/* Rounds the background's corners — meaningless with no fill to round, so it only
            appears alongside one. Same control and cap (half the shorter side) as the Shape panel. */}
        {primary.style.fill && (
          <CornerRadiusRow
            value={primary.style.radius ?? 0}
            onCommit={(radius) => patchStyle({ radius })}
            max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)}
          />
        )}
      </PanelSection>

      <PanelDivider />

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
          <div className="flex flex-col gap-3">
            <BorderFieldRow label={t('Style')}>
              <SegmentedControl options={borderStyleOptions} value={strokeStyle} onChange={(v) => patchStyle({ strokeStyle: v })} />
            </BorderFieldRow>

            {/* Explicit 100.5px (this row's own grid column width) plus `compact` to squeeze its
                internal padding/gaps enough for the hex + opacity text to still fit at that width —
                same treatment the Text panel's own Text fill/Shape fill rows needed. */}
            <BorderFieldRow label={t('Color')}>
              <InlineColorField color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} width={100.5} compact />
            </BorderFieldRow>

            {/* Visual preview only, like `boxVerticalAlign` elsewhere — a real inside/outside
                stroke position needs its own layout trick (CSS borders only ever draw centered on
                the edge), which is out of scope here; the choice still persists per-element. */}
            <BorderFieldRow label={t('Position')}>
              <SegmentedControl options={borderPositionOptions} value={strokePosition} onChange={(v) => patchStyle({ strokePosition: v })} />
            </BorderFieldRow>

            <BorderFieldRow label={t('Weight')}>
              <NumberField
                scrubbable
                className="w-full text-[11px] font-normal"
                value={String(primary.style.strokeWidth ?? 1)}
                onCommit={(v) => patchStyle({ strokeWidth: Math.max(0, Number(v) || 0) })}
              />
            </BorderFieldRow>
          </div>
        )}
      </div>

      <PanelDivider />

      <ShadowSection dropShadow={primary.style.dropShadow} innerShadow={primary.style.innerShadow} onPatch={patchStyle} />
    </PanelCard>
  );
}
