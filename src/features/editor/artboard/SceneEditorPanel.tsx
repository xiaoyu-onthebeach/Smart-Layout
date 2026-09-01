import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { Layout } from '@/types';
import {
  BORDER_STYLE_ICONS,
  ColorRow,
  PanelCard,
  PanelDivider,
  PanelFooter,
  PanelHeaderIcon,
  PanelSection,
  PositionSection,
  RadiusRow,
  SegmentedControl,
} from './PanelKit';

type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

const BORDER_STYLE_LABELS: Record<BorderStyle, string> = { none: 'None', solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };

/** Right-corner panel shown while the scene/frame itself (not a child element) is selected. */
export function SceneEditorPanel({ layout, setId }: { layout: Layout; setId: string | undefined }) {
  const t = useT();
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const setGroupPrimary = useAppStore((s) => s.setGroupPrimary);
  const openExport = useAppStore((s) => s.openExport);

  const groupId = setId ? pageGroupIdByPage[setId] : undefined;
  const group = groupId ? pageGroups[groupId] : undefined;
  const isGrouped = Boolean(group);
  const isPrimary = Boolean(group && setId && group.memberIds[0] === setId);

  const strokeStyle: BorderStyle = layout.borderStyle ?? 'solid';

  const BORDER_OPTIONS: { value: BorderStyle; label: string; icon: React.ReactNode }[] = (['none', 'solid', 'dashed', 'dotted'] as const).map((value) => ({
    value,
    label: t(BORDER_STYLE_LABELS[value]),
    icon: <img src={BORDER_STYLE_ICONS[value]} alt="" className="size-4" />,
  }));

  return (
    <PanelCard>
      <div className="flex items-center gap-1.5 px-4 pb-1">
        <PanelHeaderIcon src="/icons/edit_panel/banner%20header.svg" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[-0.01em] text-white uppercase">{t('Banner')}</span>
        {isGrouped &&
          (isPrimary ? (
            <span className="flex h-[19px] shrink-0 items-center justify-center rounded-md bg-button-primary px-1.5 text-[10px] text-white">{t('Primary')}</span>
          ) : (
            <button
              type="button"
              onClick={() => setId && setGroupPrimary(setId)}
              className="flex h-[19px] shrink-0 items-center justify-center rounded-md border border-chrome-border px-1.5 text-[10px] text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              {t('Set as Primary')}
            </button>
          ))}
      </div>

      <PositionSection x={0} y={0} />

      <PanelDivider />

      <PanelSection label={t('Fill')}>
        <ColorRow color={layout.backgroundColor ?? '#131316'} onChange={(backgroundColor) => updateLayoutStyle(layout.id, { backgroundColor })} />
      </PanelSection>

      <PanelSection label={t('Border')}>
        <ColorRow color={layout.borderColor ?? '#2f2f37'} onChange={(borderColor) => updateLayoutStyle(layout.id, { borderColor })} />
      </PanelSection>

      <PanelSection label={t('Style')}>
        <SegmentedControl options={BORDER_OPTIONS} value={strokeStyle} onChange={(borderStyle) => updateLayoutStyle(layout.id, { borderStyle })} />
      </PanelSection>

      <PanelSection label={t('Radius')}>
        <RadiusRow value={layout.radius ?? 0} onCommit={(radius) => updateLayoutStyle(layout.id, { radius })} />
      </PanelSection>

      <PanelFooter visible={!layout.hidden} onToggleVisible={() => updateLayoutStyle(layout.id, { hidden: !layout.hidden })} showDownload onDownload={openExport} />
    </PanelCard>
  );
}
