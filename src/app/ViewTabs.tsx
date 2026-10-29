import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/store/useAppStore';
import type { WorkspaceView } from '@/store/types';
import { useT } from '@/lib/i18n';

const VIEWS: { value: WorkspaceView; label: string }[] = [
  { value: 'edit', label: 'Create' },
  { value: 'bulkEdit', label: 'Replace' },
];

/** The top bar's Create / Replace switch (`edit` / `bulkEdit` in code) — a compact task bar (blurred popover track, text-only
 * tabs, the active one on the base background in the brand blue), not shadcn's default theme. */
export function ViewTabs() {
  const t = useT();
  const view = useAppStore((s) => s.workspaceView);
  const setView = useAppStore((s) => s.setWorkspaceView);
  return (
    <Tabs value={view} onValueChange={(v) => setView(v as WorkspaceView)}>
      <TabsList className="h-8 gap-1 rounded-lg border-0 bg-[rgba(38,38,44,0.88)] p-1 shadow-[inset_0_0_0_1px_#2F2F37,0px_4px_32px_4px_rgba(0,0,0,0.24)] backdrop-blur-[16px] group-data-[orientation=horizontal]/tabs:h-8">
        {VIEWS.map(({ value, label }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-6 min-w-[76px] flex-none rounded-lg border-0 px-3 py-2 text-[14px] leading-[1.4] font-normal tracking-[-0.01em] text-white shadow-none hover:bg-white/5 hover:text-white dark:text-white dark:hover:text-white data-[state=active]:rounded-[4px] data-[state=active]:bg-chrome-bg data-[state=active]:text-chrome-active data-[state=active]:shadow-none data-[state=active]:hover:bg-chrome-bg dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-chrome-bg dark:data-[state=active]:text-chrome-active"
          >
            {t(label)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
