import { ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';

/**
 * Floats centered above the primary scene's frame once it has edits not yet pushed to its
 * group's other sizes. A single click pushes the primary's current layers, content, and style to
 * every sibling size — no mode choice, just the one thing this prototype's cascade ever needed.
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
        <img src="/icons/match_select.svg" alt="" className="size-[22px] shrink-0" />
        {t('Apply changes to all sizes')}
      </span>

      <div className="h-full w-px shrink-0" style={{ background: '#2F2F37' }} />

      <button
        type="button"
        aria-label={t('Push changes to all sizes')}
        onClick={() => applyCascade(setId, 'full')}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-button-primary active:bg-button-primary"
      >
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
