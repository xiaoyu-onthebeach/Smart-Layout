import { Layers } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { computeGroupAutoLayout, framesBounds } from '@/lib/group-auto-layout';
import { PanelCard, PanelDivider, PanelHeader, PositionSection } from './PanelKit';
import { GroupAutoLayoutSection } from './AutoLayoutSection';

/**
 * Right-corner panel shown while a whole layer group is selected — just where the group sits and
 * how it's laid out. Everything about the individual layers (text, fills, borders, ...) is edited
 * by entering the group and selecting the layer itself.
 */
export function GroupEditorPanel({ layoutId, groupId }: { layoutId: string; groupId: string }) {
  const t = useT();
  const elements = useAppStore((s) => s.layoutsById[layoutId]?.elements);
  const members = (elements ?? []).filter((el) => el.groupId === groupId);
  if (members.length === 0) return null;
  const groupLayout = members[0].groupLayout;
  const box = groupLayout ? computeGroupAutoLayout(members, groupLayout).box : framesBounds(members.map((m) => m.frame));

  return (
    <PanelCard gap={16}>
      <PanelHeader
        icon={
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[4px] border border-chrome-border bg-[#26262C] text-white/70 shadow-[0_1px_8px_1px_rgba(0,0,0,0.24)]">
            <Layers className="size-3.5" />
          </div>
        }
        title={groupLayout && groupLayout.direction !== 'none' ? t('Layout group') : t('Group')}
      />
      <PositionSection x={box.x} y={box.y} showPositionMode={false} resetKey={groupId} />
      <PanelDivider />
      <GroupAutoLayoutSection layoutId={layoutId} groupId={groupId} />
    </PanelCard>
  );
}
