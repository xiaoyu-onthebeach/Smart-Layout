import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import type { Tool } from '@/store/types';
import { useT } from '@/lib/i18n';

const SOFT_SHADOW = 'shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]';

/** A bare 24x24 glyph (cursor/hand) that needs its own wrapper box + shadow. */
function GlyphToolButton({
  tool,
  active,
  onSelect,
  icon,
  label,
}: {
  tool: Tool;
  active: boolean;
  onSelect: (tool: Tool) => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(tool)}
      className={cn('flex size-10 items-center justify-center rounded-full transition-colors', SOFT_SHADOW, active && 'bg-chrome-active')}
    >
      <img src={icon} alt="" className="size-6" />
    </button>
  );
}

/** A pre-rendered 40x40 (or 60x40) icon that already bakes in its own shadow. */
function RenderedToolButton({
  tool,
  active,
  onSelect,
  icon,
  label,
  width = 40,
}: {
  tool: Tool;
  active: boolean;
  onSelect: (tool: Tool) => void;
  icon: string;
  label: string;
  width?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(tool)}
      style={{ width }}
      className={cn('flex h-10 items-center justify-center rounded-full transition-colors', active && 'bg-chrome-active')}
    >
      <img src={icon} alt="" className="h-10" style={{ width }} />
    </button>
  );
}

/**
 * Floating bottom toolbar. Selecting a tool just arms it — Text/Shape don't add
 * anything until the user interacts with the artboard itself.
 */
export function DefaultModeToolbar() {
  const t = useT();
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-chrome-border-subtle bg-chrome-bg p-1">
        <GlyphToolButton tool="select" active={activeTool === 'select'} onSelect={setActiveTool} icon="/icons/cursor-24.svg" label={t('Select')} />
        <GlyphToolButton tool="move" active={activeTool === 'move'} onSelect={setActiveTool} icon="/icons/hand-24.svg" label={t('Move')} />

        <span className="h-full w-px self-stretch bg-chrome-border-soft" />

        <RenderedToolButton tool="brush" active={activeTool === 'brush'} onSelect={setActiveTool} icon="/icons/brush.svg" label={t('Brush')} />
        <RenderedToolButton tool="eraser" active={activeTool === 'eraser'} onSelect={setActiveTool} icon="/icons/eraser.svg" label={t('Eraser')} />
        <RenderedToolButton tool="text" active={activeTool === 'text'} onSelect={setActiveTool} icon="/icons/text.svg" label={t('Text')} />
        <RenderedToolButton
          tool="shape"
          active={activeTool === 'shape'}
          onSelect={setActiveTool}
          icon="/icons/shape.svg"
          label={t('Shape')}
          width={60}
        />
      </div>
    </div>
  );
}
