import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n';

/** Bottom-right view-all / editing toggle. */
export function ModeSwitcher() {
  const t = useT();
  const canvasMode = useAppStore((s) => s.canvasMode);
  const setCanvasMode = useAppStore((s) => s.setCanvasMode);
  const viewAllActivePageId = useAppStore((s) => s.viewAllActivePageId);
  const selectPage = useAppStore((s) => s.selectPage);

  function switchToEditing() {
    if (viewAllActivePageId) {
      selectPage(viewAllActivePageId);
    }
    setCanvasMode('editing');
  }

  return (
    <div className="pointer-events-none absolute right-[203px] bottom-6 z-10">
      <div
        className="pointer-events-auto flex items-center gap-[3px] rounded-full border p-[7px]"
        style={{ background: '#131316', borderColor: '#2F2F37', boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)', backdropFilter: 'blur(16px)' }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('View all')}
              aria-pressed={canvasMode === 'viewAll'}
              onClick={() => setCanvasMode('viewAll')}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
                canvasMode === 'viewAll' ? 'bg-button-primary' : 'hover:bg-white/5',
              )}
            >
              <img src="/icons/viewAll.svg" alt="" className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('All sizes')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t('Editing')}
              aria-pressed={canvasMode === 'editing'}
              onClick={switchToEditing}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
                canvasMode === 'editing' ? 'bg-button-primary' : 'hover:bg-white/5',
              )}
            >
              <img src="/icons/editing.svg" alt="" className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('Single banner')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
