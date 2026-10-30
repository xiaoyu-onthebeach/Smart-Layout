import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { Layout } from '@/types';
import { PanelCard, PanelExportFooter, PanelHeaderIcon } from '@/features/editor/artboard/PanelKit';

/**
 * The Bulk edit view's only panel on the canvas side — download options for the banners selected in
 * its preview, as soon as one is selected. No editing here (content is edited through the
 * table); same export controls as the Edit view's own multi-banner panel.
 */
export function BulkEditDownloadPanel() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);

  const layouts = selectedSceneIds
    .map((id) => {
      const set = setsById[id];
      return set ? layoutsById[set.sourceLayoutId] : null;
    })
    .filter((l): l is Layout => Boolean(l));
  if (layouts.length === 0) return null;

  return (
    // Inside the canvas window, which already starts below the header.
    <div className="pointer-events-none absolute top-4 right-4 flex">
      <div className="pointer-events-auto flex">
        <PanelCard>
          <div className="flex items-center gap-1.5 px-4 pb-1">
            <PanelHeaderIcon src="/icons/edit_panel/mult-select.svg" />
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Download')}</span>
            <span className="ml-auto shrink-0 text-[11px] text-white/65">
              {language === 'ja' ? `${layouts.length}件のサイズを選択中` : `${layouts.length} size${layouts.length === 1 ? '' : 's'} selected`}
            </span>
          </div>
          <PanelExportFooter layouts={layouts} />
        </PanelCard>
      </div>
    </div>
  );
}
