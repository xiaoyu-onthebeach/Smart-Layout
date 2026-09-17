import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PopoverMenuItem } from './PanelKit';
import { useT } from '@/lib/i18n';

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];

/** Bottom-right, sits just left of the view-all/editing switcher: zoom level, fit-to-screen, ruler toggle. */
export function CanvasZoomBar({
  zoomPct,
  onSetZoom,
  onFitToScreen,
  showRulers,
  onToggleRulers,
}: {
  zoomPct: number;
  onSetZoom: (pct: number) => void;
  onFitToScreen: () => void;
  showRulers: boolean;
  onToggleRulers: () => void;
}) {
  const t = useT();
  return (
    <div
      className="pointer-events-auto flex h-12 shrink-0 items-center gap-2 rounded-full border py-2 pr-2 pl-4"
      style={{ background: '#131316', borderColor: '#26262C', boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)', backdropFilter: 'blur(16px)' }}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-1 text-sm text-white">
            <span className="w-[38px] text-center">{Math.round(zoomPct)}%</span>
            <ChevronDown className="size-3.5 shrink-0 text-white" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" sideOffset={8} className="w-[140px] border-chrome-border bg-[#26262C]/95 p-1 text-chrome-fg backdrop-blur-lg">
          <div className="flex flex-col gap-0.5">
            {ZOOM_PRESETS.map((preset) => (
              <PopoverMenuItem key={preset} active={Math.round(zoomPct) === preset} onClick={() => onSetZoom(preset)}>
                {preset}%
              </PopoverMenuItem>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={t('Fit to screen')}
        onClick={onFitToScreen}
        className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/5"
      >
        <img src="/icons/Expand.svg" alt="" className="size-4" />
      </button>
      <div className="h-8 w-px shrink-0" style={{ background: '#2F2F37' }} />
      <button
        type="button"
        aria-label={showRulers ? t('Hide rulers') : t('Show rulers')}
        aria-pressed={showRulers}
        onClick={onToggleRulers}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
          showRulers ? 'bg-white/10' : 'hover:bg-white/5',
        )}
      >
        <img src={showRulers ? '/icons/ruler-on.svg' : '/icons/ruler-off.svg'} alt="" className="size-4" />
      </button>
    </div>
  );
}
