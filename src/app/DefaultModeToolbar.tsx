import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import type { Tool } from '@/store/types';
import type { ShapeKind } from '@/types';
import { useT } from '@/lib/i18n';

const SOFT_SHADOW = 'shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]';
const HOVER_BG = 'hover:bg-[#26262C]';
/** The toolbar's distance from the bottom of the screen, and the least it keeps from its area's sides. */
const TOOLBAR_SCREEN_BOTTOM = 24;
const TOOLBAR_EDGE_MARGIN = 16;

const SHAPE_KIND_OPTIONS: { kind: ShapeKind; label: string; shortcut: string; shiftShortcut?: boolean }[] = [
  { kind: 'rect', label: 'Rectangle', shortcut: 'R' },
  { kind: 'ellipse', label: 'Oval', shortcut: 'O' },
  { kind: 'line', label: 'Line', shortcut: 'L' },
  { kind: 'arrow', label: 'Arrow', shortcut: 'L', shiftShortcut: true },
  { kind: 'polygon', label: 'Polygon', shortcut: '' },
];

const SHAPE_KIND_ICON: Record<ShapeKind, string> = {
  rect: '/icons/rectangle.svg',
  ellipse: '/icons/oval.svg',
  line: '/icons/line.svg',
  arrow: '/icons/arrow%2024.svg',
  polygon: '/icons/polygon%2024.svg',
};

/** The glyph for a given shape kind, at whatever size the caller's className sets. */
function ShapeKindGlyph({ kind, className }: { kind: ShapeKind; className?: string }) {
  return <img src={SHAPE_KIND_ICON[kind]} alt="" className={className} />;
}

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
      className={cn('flex size-10 items-center justify-center rounded-full transition-colors', SOFT_SHADOW, active ? 'bg-chrome-active' : HOVER_BG)}
    >
      <img src={icon} alt="" className="size-6" />
    </button>
  );
}

/** A pre-rendered 40x40 icon that already bakes in its own shadow. */
function RenderedToolButton({
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
      className={cn('flex size-10 items-center justify-center rounded-full transition-colors', active ? 'bg-chrome-active' : HOVER_BG)}
    >
      <img src={icon} alt="" className="size-10" />
    </button>
  );
}

/** The Shape tool's own button — a pill (wider than the other glyph buttons to fit its chevron)
 * that both arms the 'shape' tool and opens a picker for which kind it draws. Selecting a kind
 * updates the pill's own icon so it always reflects what a click-drag on the canvas will add next. */
function ShapeToolButton() {
  const t = useT();
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const shapeToolKind = useAppStore((s) => s.shapeToolKind);
  const setShapeToolKind = useAppStore((s) => s.setShapeToolKind);
  const active = activeTool === 'shape';

  function choose(kind: ShapeKind) {
    setShapeToolKind(kind);
    setActiveTool('shape');
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('Shape')}
          aria-pressed={active}
          className={cn('flex h-10 w-[60px] items-center justify-center gap-1 rounded-full transition-colors', active ? 'bg-chrome-active' : HOVER_BG)}
        >
          <ShapeKindGlyph kind={shapeToolKind} className="size-6 shrink-0" />
          <ChevronDown className="size-3.5 shrink-0 text-white" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={12}
        className="w-[188px] border-[#2F2F37] p-1 text-chrome-fg backdrop-blur-lg"
        style={{ background: 'rgba(38,38,44,0.88)', borderRadius: 8, boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)' }}
      >
        <div className="flex flex-col items-start gap-0">
          {SHAPE_KIND_OPTIONS.map((opt) => (
            <PopoverClose asChild key={opt.kind}>
              <button
                type="button"
                onClick={() => choose(opt.kind)}
                className="flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-3 text-left text-white transition-colors hover:bg-[#26262C]"
              >
                <ShapeKindGlyph kind={opt.kind} className="size-6 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm tracking-[-0.01em]">{t(opt.label)}</span>
                <span className="shrink-0 text-sm text-white/45">{opt.shortcut && (opt.shiftShortcut ? `⇧${opt.shortcut}` : opt.shortcut)}</span>
              </button>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Floating bottom toolbar: the current mode's tools (the Create / Replace switch lives in the top
 * bar — see ModeSwitch). Selecting a tool just arms it — Text/Shape don't add
 * anything until the user interacts with the artboard itself.
 */
export function DefaultModeToolbar() {
  const t = useT();
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const setShapeToolKind = useAppStore((s) => s.setShapeToolKind);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  // The Bulk edit view's preview canvas only ever gets the cursor and hand — no creation tools or
  // their shortcuts, even if a scene somehow ended up selected.
  const workspaceView = useAppStore((s) => s.workspaceView);
  const hasSceneSelected = selectedSceneIds.length > 0 && workspaceView === 'edit';

  // R/O/L arm the shape tool with that kind directly — the same shortcuts the picker itself
  // advertises next to each option. P arms the pen tool (svg import & edit spec, Part 3). Both only
  // live once a scene is selected, matching when the Shape/Pen buttons themselves are even shown.
  useEffect(() => {
    if (!hasSceneSelected) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setActiveTool('pen');
        return;
      }
      // Arrow shares the 'L' key with Line, distinguished only by Shift (⇧L vs L) — matched here too.
      const opt = SHAPE_KIND_OPTIONS.find((o) => o.shortcut !== '' && o.shortcut.toLowerCase() === e.key.toLowerCase() && Boolean(o.shiftShortcut) === e.shiftKey);
      if (!opt) return;
      e.preventDefault();
      setShapeToolKind(opt.kind);
      setActiveTool('shape');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSceneSelected, setShapeToolKind, setActiveTool]);

  // Always centred on the screen, in both modes — not on the canvas area this sits in, which in
  // Replace is the preview window on the right. So the mode switch stays put when it's used, and in
  // Replace it lands near the table instead of deep in the preview. Only when the screen's centre
  // is too close to the area's edge, or to the zoom bar in its corner, does it shift, just enough
  // to stay clear.
  const anchorRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, bottom: TOOLBAR_SCREEN_BOTTOM, ready: false });
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const bar = barRef.current;
    if (!anchor || !bar) return;
    // In screen coordinates (the bar is `fixed`), so it doesn't depend on where the canvas area is
    // mid-switch — only on where that area ends up, for the clamping below.
    function update() {
      const area = anchor!.getBoundingClientRect();
      const half = bar!.offsetWidth / 2;
      // The canvas's zoom bar sits in the area's bottom-right corner — stop short of it too.
      const zoomBar = anchor!.parentElement?.querySelector('[data-canvas-zoom-bar] > *');
      const rightLimit = zoomBar ? zoomBar.getBoundingClientRect().left - TOOLBAR_EDGE_MARGIN : area.right - TOOLBAR_EDGE_MARGIN;
      const left = Math.max(Math.min(window.innerWidth / 2, rightLimit - half), area.left + half + TOOLBAR_EDGE_MARGIN);
      setPosition((prev) => (prev.left === left && prev.ready ? prev : { ...prev, left, ready: true }));
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    ro.observe(bar);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div ref={anchorRef} className="pointer-events-none absolute inset-0">
      <div
        ref={barRef}
        className="pointer-events-auto fixed flex h-12 items-center overflow-hidden rounded-full border border-[#26262C] bg-[#131316]"
        style={{ left: position.left, bottom: position.bottom, transform: 'translateX(-50%)', visibility: position.ready ? undefined : 'hidden' }}
      >
        <div className="flex h-full items-center gap-1 px-[3px]">
          <GlyphToolButton tool="select" active={activeTool === 'select'} onSelect={setActiveTool} icon="/icons/cursor-24.svg" label={t('Select')} />
          <GlyphToolButton tool="move" active={activeTool === 'move'} onSelect={setActiveTool} icon="/icons/hand-24.svg" label={t('Move')} />

          {hasSceneSelected && (
            <>
              <span className="h-full w-px self-stretch bg-chrome-border-soft" />

              <RenderedToolButton tool="text" active={activeTool === 'text'} onSelect={setActiveTool} icon="/icons/text.svg" label={t('Text')} />
              {/* Pen tool entry point (svg import & edit spec, Part 3) — arms click-by-click vector
                  drawing on the canvas; see ArtboardFrame's PenToolCursor for the custom cursor this
                  shows while hovering it. The actual joint-by-joint drawing interaction is later work. */}
              <GlyphToolButton tool="pen" active={activeTool === 'pen'} onSelect={setActiveTool} icon="/icons/SVGs/pen%2024.svg" label={t('Pen')} />
              <ShapeToolButton />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
