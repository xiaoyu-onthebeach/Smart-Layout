import { useAppStore } from '@/store/useAppStore';
import type { LayoutElement } from '@/types';
import { layerName } from '@/lib/layer-name';
import { useT } from '@/lib/i18n';
import {
  BORDER_STYLE_ICONS,
  ColorRow,
  OpacityRow,
  PanelCard,
  PanelDivider,
  PanelHeader,
  PanelHeaderIcon,
  PanelSection,
  MatchSelectButton,
  PositionSection,
  RadiusRow,
  SegmentedControl,
  type EditorTarget,
} from './PanelKit';

type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

const BORDER_STYLE_LABELS: Record<BorderStyle, string> = { none: 'None', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/** Right-corner panel shown while one or more image elements are selected — edits broadcast to every target. */
export function ImageEditorPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const updateElement = useAppStore((s) => s.updateElement);
  const primary = targets[0].element;
  const title =
    targets.length === 1 ? t(layerName(primary)) : language === 'ja' ? `${targets.length} 個の画像レイヤー` : `${targets.length} image layers`;

  function patchStyle(patch: Partial<LayoutElement['style']>) {
    for (const tgt of targets) updateElement(tgt.layoutId, tgt.element.id, { style: { ...tgt.element.style, ...patch } });
  }

  const strokeWidth = primary.style.strokeWidth ?? 0;
  const borderStyle: BorderStyle = strokeWidth === 0 ? 'none' : (primary.style.strokeStyle ?? 'solid');

  const BORDER_OPTIONS: { value: BorderStyle; label: string; icon: React.ReactNode }[] = (['none', 'solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  function setBorderStyle(value: BorderStyle) {
    if (value === 'none') {
      patchStyle({ strokeWidth: 0 });
      return;
    }
    patchStyle({ strokeStyle: value, strokeWidth: strokeWidth || 1 });
  }

  return (
    <PanelCard>
      <PanelHeader icon={<PanelHeaderIcon src="/icons/edit_panel/image%20header.svg" />} title={title} trailing={<MatchSelectButton targets={targets} />} />

      <PositionSection x={primary.frame.x} y={primary.frame.y} />

      <PanelDivider />

      <PanelSection label={t('Styles')}>
        <OpacityRow value={primary.style.opacity ?? 100} onCommit={(opacity) => patchStyle({ opacity })} />
      </PanelSection>

      <PanelSection label={t('Border')}>
        <ColorRow color={primary.style.strokeColor ?? '#000000'} onChange={(strokeColor) => patchStyle({ strokeColor })} />
      </PanelSection>

      <PanelSection label={t('Style')}>
        <SegmentedControl options={BORDER_OPTIONS} value={borderStyle} onChange={setBorderStyle} />
      </PanelSection>

      <PanelSection label={t('Radius')}>
        <RadiusRow value={primary.style.radius ?? 0} onCommit={(radius) => patchStyle({ radius })} />
      </PanelSection>
    </PanelCard>
  );
}
