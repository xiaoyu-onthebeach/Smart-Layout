import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import { DEFAULT_POLYGON_SIDES, MIN_POLYGON_SIDES, regularPolygonPoints } from '@/lib/vector-path';
import {
  BORDER_STYLE_ICONS,
  CornerRadiusRow,
  GridFieldRow,
  IconNumberField,
  IconSlot,
  InlineColorField,
  NumberField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  PositionSection,
  RotationRow,
  SegmentedControl,
  MatchSelectButton,
  ShadowSection,
  type EditorTarget,
} from './PanelKit';
import { EditableDimensionsBlock, LayoutShell } from './AutoLayoutSection';

type SolidBorderStyle = 'solid' | 'dashed' | 'dotted';
const BORDER_STYLE_LABELS: Record<SolidBorderStyle, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/** Header glyph reflects the selected shape's own kind rather than one generic "shape" icon. */
const SHAPE_HEADER_ICONS: Record<NonNullable<LayoutElement['shape']>, string> = {
  rect: '/icons/edit_panel/panel%20rectangle.svg',
  ellipse: '/icons/edit_panel/panel_circle.svg',
  line: '/icons/edit_panel/panel_line.svg',
  // No dedicated edit_panel variant exists for these two yet — the same glyph the toolbar itself uses.
  arrow: '/icons/arrow%2024.svg',
  polygon: '/icons/polygon%2024.svg',
};

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

  // "Count" row — only a polygon (regular N-gon) or any vector has a meaningful corner count to
  // show/edit; other shape kinds (rect/ellipse/line/arrow) have a fixed point count that isn't a
  // user-facing concept. Changing it regenerates a fresh regular N-gon inscribed in the current
  // frame either way — for a vector this replaces whatever arbitrary points it had (an imported
  // logo's actual path included), which is the only generic thing "corner count" can mean for an
  // arbitrary path; there's no way to add/remove a joint from one specific spot via this field.
  const showsCornerCount = primary.kind === 'vector' || primary.shape === 'polygon';
  const cornerCount = primary.kind === 'vector' ? (primary.path?.points.length ?? DEFAULT_POLYGON_SIDES) : (primary.style.polygonSides ?? DEFAULT_POLYGON_SIDES);
  function commitCornerCount(raw: string) {
    const next = Math.max(MIN_POLYGON_SIDES, Math.round(Number(raw) || DEFAULT_POLYGON_SIDES));
    for (const tgt of targets) {
      const el = tgt.element;
      if (el.kind === 'vector') {
        updateElement(tgt.layoutId, el.id, { path: { points: regularPolygonPoints(next, el.frame.w, el.frame.h), closed: true } });
      } else {
        updateElement(tgt.layoutId, el.id, { style: { ...el.style, polygonSides: next } });
      }
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
    <PanelCard gap={0}>
      <PanelHeader icon={<PanelHeaderIcon src={SHAPE_HEADER_ICONS[primary.shape ?? 'rect']} />} title={title} trailing={<MatchSelectButton targets={targets} />} />

      <PositionSection
        x={primary.frame.x}
        y={primary.frame.y}
        w={primary.frame.w}
        h={primary.frame.h}
        rotation={primary.rotation ?? 0}
        showPositionMode={false}
        resetKey={primary.id}
        extra={<RotationRow rotation={primary.rotation ?? 0} onCommit={patchRotation} />}
      />

      <PanelDivider />

      {/* Unlike text (which fits its content), this box is the thing being sized directly, so W/H
          stay real and editable here, with a lock toggle to scale them together. */}
      <LayoutShell>
        <EditableDimensionsBlock
          w={primary.frame.w}
          h={primary.frame.h}
          locked={aspectLocked}
          onToggleLock={() => setAspectLocked((v) => !v)}
          onCommitW={commitWidth}
          onCommitH={commitHeight}
          resetKey={primary.id}
        />
      </LayoutShell>

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2">
            <span className="text-[9px] leading-4 text-white/65">{t('Fill')}</span>
            <InlineColorField color={primary.style.fill ?? '#d9d9d9'} onChange={(fill) => patchStyle({ fill })} width="flex-1" />
          </div>
          <IconSlot />
        </div>

        <CornerRadiusRow value={primary.style.radius ?? 0} onCommit={(radius) => patchStyle({ radius })} max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)} />

        {showsCornerCount && (
          <GridFieldRow label={t('Count')}>
            <IconNumberField scrubbable icon="/icons/polygon-count%2016.svg" className="w-full" value={String(cornerCount)} onCommit={commitCornerCount} />
          </GridFieldRow>
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
          <div className="flex flex-col gap-2">
            <GridFieldRow label={t('Style')}>
              <SegmentedControl options={borderStyleOptions} value={strokeStyle} onChange={(v) => patchStyle({ strokeStyle: v })} />
            </GridFieldRow>

            <GridFieldRow label={t('Color')}>
              <InlineColorField color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} width={101.5} compact />
            </GridFieldRow>

            <GridFieldRow label={t('Weight')}>
              <NumberField
                scrubbable
                className="w-full bg-[#26262C] text-[11px] font-normal"
                value={String(primary.style.strokeWidth ?? 1)}
                onCommit={(v) => patchStyle({ strokeWidth: Math.max(0, Number(v) || 0) })}
              />
            </GridFieldRow>
          </div>
        )}
      </div>

      <PanelDivider />

      <ShadowSection dropShadow={primary.style.dropShadow} innerShadow={primary.style.innerShadow} onPatch={patchStyle} />
    </PanelCard>
  );
}
