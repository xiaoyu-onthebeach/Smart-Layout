import { useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { CascadeMode } from '@/store/types';

// Shared by the trigger and its dropdown so the popover lines up exactly with the field that opened it.
const SELECT_WIDTH = 160;

const MODE_OPTIONS: { value: CascadeMode; label: string; icon: string }[] = [
  { value: 'full', label: 'All properties', icon: '/icons/group-layers.svg' },
  { value: 'styleOnly', label: 'Style only', icon: '/icons/style.svg' },
];

/**
 * Floats centered above the primary scene's frame once it has edits not yet pushed to its
 * group's other sizes. The mode dropdown picks which `applyCascade` mode the arrow button fires —
 * 'full' replays layers/content/style onto every sibling, 'styleOnly' re-styles each sibling's own
 * existing layers in place — see layoutsSlice.ts's applyCascade for what each actually does.
 */
export function CascadeToolbar({ setId }: { setId: string }) {
  const applyCascade = useAppStore((s) => s.applyCascade);
  const t = useT();
  const [mode, setMode] = useState<CascadeMode>('full');
  const activeOption = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];

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

      <div className="h-full w-px shrink-0" style={{ background: '#2F2F37' }} />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm text-white"
            style={{ width: SELECT_WIDTH, borderColor: '#40404A' }}
          >
            <img src={activeOption.icon} alt="" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left tracking-[-0.01em]">{t(activeOption.label)}</span>
            <ChevronDown className="size-3.5 shrink-0 text-white" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="border-[#40404A] p-1 text-chrome-fg backdrop-blur-lg"
          style={{ width: SELECT_WIDTH, background: 'rgba(38,38,44,0.88)', borderRadius: 12 }}
        >
          <div className="flex flex-col gap-0.5">
            {MODE_OPTIONS.map((opt) => (
              <PopoverClose asChild key={opt.value}>
                <button
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm text-white tracking-[-0.01em] transition-colors hover:bg-white/10"
                >
                  <img src={opt.icon} alt="" className="size-4 shrink-0" />
                  {t(opt.label)}
                </button>
              </PopoverClose>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        aria-label={t('Push changes to all sizes')}
        onClick={() => applyCascade(setId, mode)}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-button-primary text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:brightness-110"
      >
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
