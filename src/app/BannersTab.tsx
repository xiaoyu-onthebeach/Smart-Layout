import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { RatioIcon } from '@/components/RatioIcon';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

function BannerRow({
  width,
  height,
  name,
  isPrimary,
  indented,
  selected,
  onClick,
}: {
  width: number;
  height: number;
  name: string;
  isPrimary: boolean;
  indented?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 w-full shrink-0 items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-white/5',
        indented && 'pl-7',
        selected && 'bg-white/5',
      )}
    >
      <RatioIcon width={width} height={height} />
      <span className="shrink-0 text-sm text-chrome-fg">
        {width}x{height}
      </span>
      {isPrimary && <span className="flex h-[19px] shrink-0 items-center justify-center rounded-md bg-button-primary px-1.5 text-[10px] text-white">{t('Primary')}</span>}
      <span className="min-w-0 flex-1 truncate text-right text-xs text-white/45">{name}</span>
    </button>
  );
}

/** One top-level row — a real multi-size group, or a single ungrouped banner treated as a
 * one-member "group" for the same collapsible header. */
function CampaignRow({ name, expanded, onToggle, children }: { name: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-1">
      <button type="button" onClick={onToggle} className="flex h-8 w-full shrink-0 items-center gap-1 rounded-lg px-2 text-left transition-colors hover:bg-white/5">
        <ChevronDown className={cn('size-4 shrink-0 text-white transition-transform', !expanded && '-rotate-90')} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[-0.01em] text-white uppercase">{name}</span>
      </button>
      {expanded && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

/** Left panel's default view: every banner, flattened into one list — each entry (grouped or
 * standalone) collapses behind its own chevron, expanding to its size(s). */
export function BannersTab() {
  const t = useT();
  const openSizeSelect = useAppStore((s) => s.openSizeSelect);
  const pageOrder = useAppStore((s) => s.pageOrder);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectPage = useAppStore((s) => s.selectPage);
  const selectScene = useAppStore((s) => s.selectScene);
  const pageGroups = useAppStore((s) => s.pageGroups);
  const pageGroupIdByPage = useAppStore((s) => s.pageGroupIdByPage);
  const selectedGroupId = useAppStore((s) => s.selectedGroupId);
  const selectGroup = useAppStore((s) => s.selectGroup);
  const requestFocusPage = useAppStore((s) => s.requestFocusPage);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);

  // Expand-state for standalone (ungrouped) rows — purely a UI concern, kept local rather than
  // reusing `selectedGroupId` (which tracks a real page-group's identity elsewhere too).
  const [expandedStandaloneId, setExpandedStandaloneId] = useState<string | null>(null);

  function handleRowClick(setId: string) {
    selectPage(setId);
    selectScene(setId);
    setActiveCanvas(pageGroupIdByPage[setId] ?? setId);
  }

  function renderRow(setId: string, isPrimary: boolean, indented?: boolean) {
    const bannerSet = setsById[setId];
    const layout = bannerSet ? layoutsById[bannerSet.sourceLayoutId] : null;
    if (!bannerSet || !layout) return null;
    return (
      <BannerRow
        key={setId}
        width={layout.size.width}
        height={layout.size.height}
        name={bannerSet.name}
        isPrimary={isPrimary}
        indented={indented}
        selected={selectedSceneIds.includes(setId)}
        onClick={() => handleRowClick(setId)}
      />
    );
  }

  function toggleGroup(groupId: string, primarySetId: string) {
    setActiveCanvas(groupId);
    if (selectedGroupId === groupId) {
      selectGroup(null);
      return;
    }
    selectGroup(groupId);
    requestFocusPage(primarySetId);
  }

  function toggleStandalone(setId: string) {
    setActiveCanvas(setId);
    if (expandedStandaloneId === setId) {
      setExpandedStandaloneId(null);
      return;
    }
    setExpandedStandaloneId(setId);
    requestFocusPage(setId);
  }

  const groups = Object.values(pageGroups);
  const groupedIds = new Set(groups.flatMap((g) => g.memberIds));
  const ungroupedIds = pageOrder.filter((id) => !groupedIds.has(id));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <div className="flex h-8 w-full shrink-0 items-center justify-between px-1">
        <span className="truncate text-[11px] font-semibold tracking-[-0.01em] text-white/70 uppercase">{t('All banners')}</span>
        <button
          type="button"
          aria-label={t('Add banner')}
          onClick={openSizeSelect}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-button-primary text-white transition-opacity hover:opacity-80"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-1">
        {groups.map((group) => (
          <CampaignRow key={group.id} name={group.name} expanded={selectedGroupId === group.id} onToggle={() => toggleGroup(group.id, group.memberIds[0])}>
            {group.memberIds.map((id, i) => renderRow(id, i === 0, true))}
          </CampaignRow>
        ))}
        {ungroupedIds.map((setId) => {
          const bannerSet = setsById[setId];
          if (!bannerSet) return null;
          return (
            <CampaignRow key={setId} name={bannerSet.name} expanded={expandedStandaloneId === setId} onToggle={() => toggleStandalone(setId)}>
              {renderRow(setId, false, true)}
            </CampaignRow>
          );
        })}
        {groups.length === 0 && ungroupedIds.length === 0 && <span className="px-1 text-xs text-white/45">{t('No banners yet.')}</span>}
      </div>
    </div>
  );
}
