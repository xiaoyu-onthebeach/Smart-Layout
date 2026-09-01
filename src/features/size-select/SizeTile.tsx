import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRuleSet } from '@/lib/mock/rulesets';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { SizePreset } from '@/types';
import { PlatformCardIllustration } from './PlatformCardIllustration';

/** One selectable "primary banner size" card — the illustration mirrors the platform's real
 * banner mockup style (icon + accent color), the row below carries the size/label/rule count. */
export function PlatformSizeCard({
  preset,
  platformName,
  recommended,
  selected,
  onSelect,
}: {
  preset: SizePreset;
  platformName: string;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const ruleCount = getRuleSet(preset.ruleSetId)?.rules.length ?? 0;
  const language = useAppStore((s) => s.language);
  const t = useT();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-[340px] shrink-0 flex-col items-stretch overflow-hidden rounded-[19px] border text-left transition-colors',
        selected ? 'border-white/80' : 'border-[#40404A]/80 hover:border-white/40',
      )}
      style={{ background: '#26262C', boxShadow: '0px 1px 2px rgba(0,0,0,0.03), 0px 1px 5px -1px rgba(0,0,0,0.02), 0px 2px 3px rgba(0,0,0,0.02)' }}
    >
      <div className="relative">
        <PlatformCardIllustration platformId={preset.platformId} width={preset.width} height={preset.height} />
        {recommended && (
          <span
            className="absolute top-3 right-3 flex h-8 items-center justify-center rounded-full border border-white px-3 text-sm text-white"
            style={{ background: '#121214' }}
          >
            {t('Recommended Size')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold text-white">
            {preset.width} x {preset.height} px
          </span>
          <span className="truncate text-[13px] text-white">{preset.label}</span>
        </div>

        <div className="h-px w-full" style={{ background: '#2F2F37' }} />

        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-white/70">
            {language === 'ja' ? `${platformName}のショップルールを${ruleCount}件搭載` : `${ruleCount} ${platformName} shop rules built in`}
          </span>
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-white"
            style={{ background: '#26262C', borderColor: '#40404A' }}
          >
            <MoreHorizontal className="size-4" />
          </span>
        </div>
      </div>
    </button>
  );
}
