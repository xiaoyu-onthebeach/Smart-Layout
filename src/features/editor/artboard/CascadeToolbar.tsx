import { ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';

/**
 * Floats centered above the primary scene's frame once it has edits not yet pushed to its group's
 * other sizes. Always cascades in 'full' mode (replays layers/content/style onto every sibling) —
 * see layoutsSlice.ts's applyCascade for what that does; the mode picker this used to also offer
 * ('styleOnly', re-styling each sibling's own existing layers in place) was removed from the UI.
 */
export function CascadeToolbar({ setId }: { setId: string }) {
  const applyCascade = useAppStore((s) => s.applyCascade);
  const t = useT();

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-3"
      style={{
        background: 'rgba(38,38,44,0.88)',
        borderColor: '#2F2F37',
        boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <span className="flex shrink-0 items-center gap-2 py-2 text-sm font-semibold whitespace-nowrap text-white">
        <img src="/icons/apply-change.svg" alt="" className="size-[28px] shrink-0" />
        {t('Apply changes to all sizes')}
      </span>

      <button
        type="button"
        aria-label={t('Push changes to all sizes')}
        onClick={() => applyCascade(setId, 'full')}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-button-primary text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:brightness-110"
      >
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
