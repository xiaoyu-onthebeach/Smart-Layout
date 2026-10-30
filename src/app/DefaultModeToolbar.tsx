import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import type { Tool, WorkspaceView } from '@/store/types';
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

/** The active tool's fill: the brand blue in Create, Popsicle in Replace (the color Replace marks
 * things with — see the table's primary rows). */
function useActiveToolBg() {
  return useAppStore((s) => (s.workspaceView === 'bulkEdit' ? 'bg-popsicle' : 'bg-chrome-active'));
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
  const activeBg = useActiveToolBg();
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(tool)}
      className={cn('flex size-10 items-center justify-center rounded-full transition-colors', SOFT_SHADOW, active ? activeBg : HOVER_BG)}
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
  const activeBg = useActiveToolBg();
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(tool)}
      className={cn('flex size-10 items-center justify-center rounded-full transition-colors', active ? activeBg : HOVER_BG)}
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

/** The toolbar's first section: which mode the playground is in (Create / Replace), Figma
 * dev-mode style — two small square buttons on their own darker strip, the current one raised. */
/** The Create mode's icon (shapes) — inline, in `currentColor`, so it follows the button's own
 * active/inactive color. */
function CreateModeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M9 13.25C9.9665 13.25 10.75 14.0335 10.75 15V20C10.75 20.9665 9.9665 21.75 9 21.75H4C3.0335 21.75 2.25 20.9665 2.25 20V15C2.25 14.0335 3.0335 13.25 4 13.25H9ZM17.5 13.25C19.8472 13.25 21.75 15.1528 21.75 17.5C21.75 19.8472 19.8472 21.75 17.5 21.75C15.1528 21.75 13.25 19.8472 13.25 17.5C13.25 15.1528 15.1528 13.25 17.5 13.25ZM4 14.75C3.86193 14.75 3.75 14.8619 3.75 15V20C3.75 20.1381 3.86193 20.25 4 20.25H9C9.13807 20.25 9.25 20.1381 9.25 20V15C9.25 14.8619 9.13807 14.75 9 14.75H4ZM17.5 14.75C15.9812 14.75 14.75 15.9812 14.75 17.5C14.75 19.0188 15.9812 20.25 17.5 20.25C19.0188 20.25 20.25 19.0188 20.25 17.5C20.25 15.9812 19.0188 14.75 17.5 14.75ZM12.1465 1.89551C12.3316 1.9128 12.5126 1.96668 12.6787 2.05273C12.8449 2.13886 12.9924 2.25616 13.1133 2.39746L13.2256 2.54688L13.2344 2.56055L16.9365 8.50293L16.9336 8.50391C17.0719 8.71381 17.1556 8.95481 17.1719 9.20605C17.1889 9.47 17.1337 9.73409 17.0117 9.96875C16.8897 10.2034 16.7054 10.4004 16.4795 10.5381C16.2538 10.6755 15.9947 10.749 15.7305 10.75H8.2998V10.748C8.04663 10.7547 7.79551 10.6968 7.57227 10.5762C7.33724 10.4491 7.14092 10.2594 7.00684 10.0283C6.87288 9.79715 6.80509 9.53273 6.81152 9.26562L6.83008 9.06738C6.8617 8.87363 6.93373 8.6881 7.04004 8.52148H7.03906L10.7646 2.60059L10.7656 2.60156C10.8858 2.39864 11.0525 2.22701 11.2539 2.10352L11.4189 2.0166C11.5888 1.94051 11.7728 1.89738 11.96 1.89062L12.1465 1.89551ZM8.35254 9.25H15.6348L12.0117 3.43457L8.35254 9.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The Replace mode's icon (a table) — inline, in `currentColor`, so it follows the button's own
 * active/inactive color like the Create one. */
function ReplaceModeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M19.2061 2.00488C21.3194 2.11211 23 3.85996 23 6V18C23 20.14 21.3194 21.8879 19.2061 21.9951L19 22H5C2.85996 22 1.11211 20.3194 1.00488 18.2061L1 18V6C1 3.79086 2.79086 2 5 2H19L19.2061 2.00488ZM2.5 15.75V18C2.5 19.3807 3.61929 20.5 5 20.5H7.75V15.75H2.5ZM9.25 15.75V20.5H19C20.3807 20.5 21.5 19.3807 21.5 18V15.75H9.25ZM2.5 14.25H7.75V9.75H2.5V14.25ZM9.25 14.25H21.5V9.75H9.25V14.25ZM5 3.5C3.61929 3.5 2.5 4.61929 2.5 6V8.25H7.75V3.5H5ZM9.25 8.25H21.5V6C21.5 4.61929 20.3807 3.5 19 3.5H9.25V8.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

const MODES: { value: WorkspaceView; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'edit', label: 'Create', icon: CreateModeIcon },
  { value: 'bulkEdit', label: 'Replace', icon: ReplaceModeIcon },
];

function ModeSwitch() {
  const t = useT();
  const view = useAppStore((s) => s.workspaceView);
  const setView = useAppStore((s) => s.setWorkspaceView);
  return (
    <div className="flex h-full items-center gap-1 bg-[#26262C] px-3 py-1">
      {MODES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={t(label)}
          title={t(label)}
          aria-pressed={view === value}
          onClick={() => setView(value)}
          className={cn('flex size-8 items-center justify-center rounded-lg transition-colors', view === value ? 'bg-[#131316] text-white' : 'text-white/45 hover:text-white')}
        >
          <Icon className="size-5" />
        </button>
      ))}
    </div>
  );
}

/**
 * Floating bottom toolbar: the mode switch (Create / Replace), then that mode's tools. Selecting a tool just arms it — Text/Shape don't add
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
        <ModeSwitch />
        <div className="flex h-full items-center gap-1 px-3 py-1">
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
