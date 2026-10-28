import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import { DEFAULT_POLYGON_SIDES, MIN_POLYGON_SIDES } from '@/lib/vector-path';
import {
  BorderSection,
  CornerRadiusRow,
  GridFieldRow,
  IconNumberField,
  IconSlot,
  InlineColorField,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  PositionSection,
  RotationRow,
  MatchSelectButton,
  ShadowSection,
  VectorShapeIcon,
  type EditorTarget,
} from './PanelKit';
import { EditableDimensionsBlock, LayoutShell } from './AutoLayoutSection';

/** Header glyph reflects the selected shape's own kind rather than one generic "shape" icon. */
const SHAPE_HEADER_ICONS: Record<NonNullable<LayoutElement['shape']>, string> = {
  rect: '/icons/edit_panel/panel%20rectangle.svg',
  ellipse: '/icons/edit_panel/panel_circle.svg',
  line: '/icons/edit_panel/panel_line.svg',
  // No dedicated edit_panel variant exists for these two yet — the same glyph the toolbar itself uses.
  arrow: '/icons/arrow%2024.svg',
  polygon: '/icons/polygon%2024.svg',
};

/**
 * Right-corner panel shown while one or more shape/vector elements are selected but NOT in joint-
 * editing mode — edits broadcast to every target. Once a vector element actually enters joint-editing
 * mode (double-click), `InspectorPanel` swaps this out for `VectorPathPanel` instead, which is where
 * per-joint controls (Curve/mirroring, aligning joints, a joint's own position) live; this panel never
 * shows those, only whole-element properties.
 */
export function ShapeEditorPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const [aspectLocked, setAspectLocked] = useState(false);

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

  // "Count" row — only a true polygon (regular N-gon) has a meaningful corner count to show/edit.
  // A vector's own joints are arbitrary from the moment it exists (even one converted from a
  // polygon, or a rectangle with an extra point added on one of its segments — still `kind:
  // 'vector'`, never `'polygon'`), so this field would have nothing sensible left to mean for it:
  // editing it could only discard whatever the joints actually say and regenerate a brand-new
  // regular N-gon inscribed in the frame instead.
  const showsCornerCount = primary.shape === 'polygon';
  const cornerCount = primary.style.polygonSides ?? DEFAULT_POLYGON_SIDES;
  function commitCornerCount(raw: string) {
    const next = Math.max(MIN_POLYGON_SIDES, Math.round(Number(raw) || DEFAULT_POLYGON_SIDES));
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, polygonSides: next } });
  }

  // This panel is shared with `kind: 'vector'` layers (converted shapes, SVG imports) — the
  // multi-select title says which one a mixed-count-but-same-kind selection actually is. Every
  // kind shows the radius row: a vector's own sharp corners (handle-less joints between two plain
  // straight edges) round the same way a shape's corners do, via `jointsToRoundedPathD` — a curved
  // joint just has nothing eligible to round, same as `ellipse` already has nothing meaningful to.
  const kindLabel = primary.kind === 'vector' ? (language === 'ja' ? 'ベクターレイヤー' : 'vector layers') : language === 'ja' ? 'シェイプレイヤー' : 'shape layers';
  const title = targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個の${kindLabel}` : `${targets.length} ${kindLabel}`;

  return (
    <PanelCard gap={0}>
      <PanelHeader
        icon={primary.kind === 'vector' ? <VectorShapeIcon path={primary.path} radius={primary.style.radius ?? 0} /> : <PanelHeaderIcon src={SHAPE_HEADER_ICONS[primary.shape ?? 'rect']} />}
        title={title}
        trailing={<MatchSelectButton targets={targets} />}
      />

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
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] leading-4 text-white/65">{t('Fill')}</span>
          <div className="flex items-center gap-2">
            {/* No `?? '#d9d9d9'` fallback — every plain shape kind always has a real fill from
                `defaultShapeStyle` at creation and never offers a way to clear it, so this never
                actually mattered for them; a vector (a pen-drawn stroke-only path, say) can
                genuinely have no fill at all, and showing a fake default color there would lie
                about what's actually rendered (plain `fill="none"`). `onClear` lets it go back to
                that real no-fill state after picking a color, same as `PenDrawingPanel`'s own
                Fill field already does for the exact same shape before it's even committed. */}
            <InlineColorField color={primary.style.fill} onChange={(fill) => patchStyle({ fill })} onClear={() => patchStyle({ fill: undefined })} width="flex-1" compact={false} />
            <IconSlot />
          </div>
        </div>

        <CornerRadiusRow
          value={primary.style.radius ?? 0}
          onCommit={(radius) => patchStyle({ radius })}
          max={Math.floor(Math.min(primary.frame.w, primary.frame.h) / 2)}
          allowIndividual={primary.kind !== 'vector'}
          layout="stacked"
        />

        {showsCornerCount && (
          <GridFieldRow label={t('Count')}>
            <IconNumberField scrubbable icon="/icons/polygon-count%2016.svg" className="w-full" value={String(cornerCount)} onCommit={commitCornerCount} />
          </GridFieldRow>
        )}
      </PanelSection>

      <PanelDivider />

      <BorderSection style={primary.style} onPatch={patchStyle} />

      <PanelDivider />

      <ShadowSection dropShadow={primary.style.dropShadow} innerShadow={primary.style.innerShadow} onPatch={patchStyle} />
    </PanelCard>
  );
}
