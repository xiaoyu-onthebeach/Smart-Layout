import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { clamp, hexToHsv, hsvToHex, isValidHex } from '@/lib/color';
import { isGradient, parseGradient, serializeGradient, type GradientStop as SerializedStop } from '@/lib/gradient';
import { useT } from '@/lib/i18n';

const PRESET_COLORS = ['#FFFFFF', '#B0B0B0', '#ECE8D9', '#000000'];
const PRESET_GRADIENTS = [
  ['#FFFFFF', '#999999'],
  ['#EEF21B', '#FFC412'],
  ['#FFFBD5', '#B20A2C'],
  ['#FFF1B0', '#FFC994'],
  ['#EE9CA7', '#FFDDE1'],
  ['#93FCE1', '#15CBFB'],
];

/** Global `EyeDropper` (Chromium-only, no TS lib types yet) — undefined everywhere else. */
type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };

function pickHueColor(hue: number): string {
  return hsvToHex(hue, 1, 1);
}

/** Saturation (x) / Value (y, inverted) square — drag anywhere inside to set both at once. */
function SaturationValueField({ hue, s, v, onChange }: { hue: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function update(clientX: number, clientY: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onChange(clamp((clientX - rect.left) / rect.width, 0, 1), 1 - clamp((clientY - rect.top) / rect.height, 0, 1));
  }

  function onMouseDown(e: ReactMouseEvent) {
    update(e.clientX, e.clientY);
    function onMove(ev: MouseEvent) {
      update(ev.clientX, ev.clientY);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      className="relative h-[166px] flex-1 shrink-0 cursor-crosshair rounded-md"
      style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pickHueColor(hue)})` }}
    >
      <div
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hsvToHex(hue, s, v), boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }}
      />
    </div>
  );
}

/** Vertical hue track running the same height as the saturation/value square beside it. */
function HueSlider({ hue, onChange }: { hue: number; onChange: (hue: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function update(clientY: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onChange(clamp((clientY - rect.top) / rect.height, 0, 1) * 360);
  }

  function onMouseDown(e: ReactMouseEvent) {
    update(e.clientY);
    function onMove(ev: MouseEvent) {
      update(ev.clientY);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      className="relative h-[166px] w-4 shrink-0 cursor-pointer rounded-md"
      style={{ background: 'linear-gradient(to bottom, #F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0.5 h-1.5 -translate-y-1/2 rounded-sm border-2 border-white"
        style={{ top: `${(hue / 360) * 100}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }}
      />
    </div>
  );
}

function GhostIconButton({ onClick, label, icon }: { onClick: () => void; label: string; icon: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:bg-[#26262C]"
    >
      {/* The asset's own viewBox reserves margin around the glyph for its baked-in drop shadow, so
          the glyph itself only fills about half the native canvas — rendering the img at the full
          32px (matching the button) is what makes it actually read as a 16px icon, not size-4. */}
      <img src={icon} alt="" className="size-8" />
    </button>
  );
}

/** Editable hex field + a decorative "HEX" unit selector (only hex is supported) — shared shape
 * between the Color tab and each gradient stop's own color editor. */
function HexRow({ hex, onCommit, onEyedrop }: { hex: string; onCommit: (hex: string) => void; onEyedrop?: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);

  function commit() {
    if (isValidHex(draft)) onCommit(draft.startsWith('#') ? draft.toUpperCase() : `#${draft.toUpperCase()}`);
    else setDraft(hex);
  }

  return (
    <div className="flex w-full items-start gap-1">
      <button
        type="button"
        className="flex h-8 w-[78px] shrink-0 items-center gap-2 rounded-lg border px-3 text-sm text-white"
        style={{ background: '#26262C', borderColor: '#40404A' }}
      >
        <span className="min-w-0 flex-1 truncate">{t('HEX')}</span>
        <ChevronDown className="size-3.5 shrink-0 text-white/65" />
      </button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-8 min-w-0 flex-1 rounded-lg border px-3 text-sm text-white uppercase outline-none"
        style={{ background: '#26262C', borderColor: '#40404A' }}
      />
      {onEyedrop && <GhostIconButton onClick={onEyedrop} label={t('Pick color from screen')} icon="/icons/color picker.svg" />}
    </div>
  );
}

function PresetSwatch({ style, onClick, label }: { style: React.CSSProperties; onClick: () => void; label: string }) {
  return <button type="button" aria-label={label} onClick={onClick} className="size-8 shrink-0 rounded" style={style} />;
}

async function pickFromScreen(onPicked: (hex: string) => void) {
  const EyeDropperCtor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  if (!EyeDropperCtor) return;
  try {
    const result = await new EyeDropperCtor().open();
    onPicked(result.sRGBHex.toUpperCase());
  } catch {
    // User cancelled the pick (Esc / click-away) — nothing to do.
  }
}

function ColorTab({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  const [h, s, v] = hexToHsv(hex);

  function setHsv(nh: number, ns: number, nv: number) {
    onChange(hsvToHex(nh, ns, nv));
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full flex-wrap items-center gap-2">
        {PRESET_COLORS.map((c) => (
          <PresetSwatch key={c} style={{ background: c }} onClick={() => onChange(c)} label={c} />
        ))}
      </div>
      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full items-stretch gap-2">
          <SaturationValueField hue={h} s={s} v={v} onChange={(ns, nv) => setHsv(h, ns, nv)} />
          <HueSlider hue={h} onChange={(nh) => setHsv(nh, s, v)} />
        </div>
        <HexRow hex={hex} onCommit={onChange} onEyedrop={() => pickFromScreen(onChange)} />
      </div>
    </div>
  );
}

type GradientStop = { id: string; position: number; color: string };
let stopIdCounter = 0;

/** The stop marker sitting on the gradient track — the currently-selected stop gets the "pin"
 * treatment (`Color for gradient.svg`, composited with this stop's own color inside the pin's
 * white window, since the asset itself is a fixed blue+white bitmap-ish shape); every other stop
 * stays a plain flat square so only one pointer ever reads as "the one you're editing". */
function StopMarker({ stop, selected, onMouseDown }: { stop: GradientStop; selected: boolean; onMouseDown: (e: ReactMouseEvent) => void }) {
  if (!selected) {
    return (
      <div onMouseDown={onMouseDown} className="absolute top-0 size-6 -translate-x-1/2 cursor-grab rounded-md active:cursor-grabbing" style={{ left: `${stop.position}%`, background: '#131316' }}>
        <div className="absolute inset-1 rounded-sm" style={{ background: stop.color }} />
      </div>
    );
  }
  // Native asset is a 33x40 pin (rounded square + pointer tail) with a 16x16 white window sitting
  // at (8,8) inside it — the percentages below place this stop's own color inside that window,
  // whatever size the icon itself is actually rendered at.
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute top-0 -translate-x-1/2 cursor-grab active:cursor-grabbing"
      style={{ left: `${stop.position}%`, width: 24, height: (24 * 40) / 33 }}
    >
      <img src="/icons/Color for gradient.svg" alt="" className="absolute inset-0 size-full" draggable={false} />
      <div className="absolute rounded-[2px]" style={{ left: '24.24%', top: '20%', width: '48.48%', height: '40%', background: stop.color }} />
    </div>
  );
}

function GradientTab({ value, onChange }: { value: string; onChange: (css: string) => void }) {
  const t = useT();
  const parsed = isGradient(value) ? parseGradient(value) : null;
  const [stops, setStops] = useState<GradientStop[]>(() =>
    parsed
      ? parsed.stops.map((s: SerializedStop) => ({ id: `stop-${stopIdCounter++}`, ...s }))
      : [
          { id: 'start', position: 0, color: '#FFFFFF' },
          { id: 'end', position: 100, color: '#999999' },
        ],
  );
  const [angle, setAngle] = useState(parsed?.angle ?? 90);
  const [selectedId, setSelectedId] = useState(stops[0].id);
  const trackRef = useRef<HTMLDivElement>(null);

  // Switching into this tab commits its (parsed-existing, or default) gradient right away, so the
  // Fill/Border field actually turns into a gradient the moment the tab is opened, not only once
  // the user first drags something — a solid color never silently stays applied underneath.
  useEffect(() => {
    if (!parsed) onChange(serializeGradient(stops, angle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const selected = stops.find((s) => s.id === selectedId) ?? stops[0];
  const gradientCss = serializeGradient(stops, angle);

  function commit(nextStops: GradientStop[], nextAngle: number) {
    onChange(serializeGradient(nextStops, nextAngle));
  }

  function positionFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.round(clamp((clientX - rect.left) / rect.width, 0, 1) * 100);
  }

  function dragStop(id: string, e: ReactMouseEvent) {
    e.stopPropagation();
    setSelectedId(id);
    function onMove(ev: MouseEvent) {
      const pos = positionFromClientX(ev.clientX);
      setStops((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, position: pos } : s));
        commit(next, angle);
        return next;
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function addStopAt(e: ReactMouseEvent) {
    const pos = positionFromClientX(e.clientX);
    // New stops start as whatever color the gradient already shows at that point — nearest
    // existing stop, rather than always white — so inserting one reads as a split, not a reset.
    const nearest = sorted.reduce((best, s) => (Math.abs(s.position - pos) < Math.abs(best.position - pos) ? s : best), sorted[0]);
    const id = `stop-${stopIdCounter++}`;
    const next = [...stops, { id, position: pos, color: nearest.color }];
    setStops(next);
    setSelectedId(id);
    commit(next, angle);
  }

  function applyPreset(colors: string[]) {
    const next = colors.map((color, i) => ({ id: `stop-${stopIdCounter++}`, position: colors.length === 1 ? 0 : (i / (colors.length - 1)) * 100, color }));
    setStops(next);
    setSelectedId(next[0].id);
    commit(next, angle);
  }

  function rotate() {
    const next = (angle + 90) % 360;
    setAngle(next);
    commit(stops, next);
  }

  function updateSelectedColor(color: string) {
    const next = stops.map((s) => (s.id === selected.id ? { ...s, color } : s));
    setStops(next);
    commit(next, angle);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full flex-wrap items-center gap-2">
        {PRESET_GRADIENTS.map((colors, i) => (
          <PresetSwatch
            key={i}
            style={{ background: `linear-gradient(90deg, ${colors[0]} 0%, ${colors[1]} 100%)` }}
            onClick={() => applyPreset(colors)}
            label={t('Gradient preset')}
          />
        ))}
      </div>

      <div className="flex w-full items-end gap-4">
        <div className="relative h-[49px] flex-1">
          <div
            ref={trackRef}
            onMouseDown={addStopAt}
            className="absolute inset-x-0 top-[9px] h-10 cursor-pointer rounded-lg"
            style={{ background: gradientCss }}
          />
          {stops.map((s) => (
            <StopMarker key={s.id} stop={s} selected={s.id === selectedId} onMouseDown={(e) => dragStop(s.id, e)} />
          ))}
        </div>
        <GhostIconButton onClick={rotate} label={t('Rotate gradient')} icon="/icons/color rotation.svg" />
      </div>

      {selected && (
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-stretch gap-2">
            <SaturationValueField
              hue={hexToHsv(selected.color)[0]}
              s={hexToHsv(selected.color)[1]}
              v={hexToHsv(selected.color)[2]}
              onChange={(ns, nv) => {
                const h = hexToHsv(selected.color)[0];
                updateSelectedColor(hsvToHex(h, ns, nv));
              }}
            />
            <HueSlider
              hue={hexToHsv(selected.color)[0]}
              onChange={(nh) => {
                const [, s2, v2] = hexToHsv(selected.color);
                updateSelectedColor(hsvToHex(nh, s2, v2));
              }}
            />
          </div>
          <HexRow hex={selected.color} onCommit={updateSelectedColor} onEyedrop={() => pickFromScreen(updateSelectedColor)} />
        </div>
      )}
    </div>
  );
}

const POPOVER_WIDTH = 308;

/** Custom color picker popover — replaces the native `<input type="color">` everywhere a Fill/
 * Border swatch is clicked. Both tabs are fully wired to `onChange`: the Color tab commits a plain
 * hex string, the Gradient tab commits a serialized `linear-gradient(...)` string into the very
 * same field (see `src/lib/gradient.ts` for how callers tell the two apart). */
export function ColorPickerPopover({
  color,
  onChange,
  onOpenChange,
  children,
}: {
  color: string;
  onChange: (value: string) => void;
  /** Lets a caller (e.g. the Fill row) reflect this popover's open state in its own styling —
   * highlighting the row while its own color picker is the thing open. */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<'color' | 'gradient'>(() => (isGradient(color) ? 'gradient' : 'color'));
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  // A Radix "virtual anchor" — floating-ui positions PopoverContent against whatever this ref's
  // `getBoundingClientRect` reports, decoupling the reference point from both the trigger (which
  // sits at varying indents inside different rows) and the DOM (a real anchor element only gets
  // re-measured on resize, not on a plain position change, so a moving one gets stuck at wherever
  // it first mounted). Recomputed as a fresh object every render so Popper's own "did the anchor
  // change" check (a reference-equality diff) notices and re-feeds floating-ui a fresh rect.
  const virtualAnchorRef = useRef({ getBoundingClientRect: () => new DOMRect() });
  if (anchor) {
    const { left, top } = anchor;
    virtualAnchorRef.current = { getBoundingClientRect: () => new DOMRect(left, top, 1, 1) };
  }

  // Floats fully outside the editing panel (to its left, an 8px gap from the panel's own edge) and
  // top-aligned with whichever Fill/Border row triggered it — measured against the panel's own
  // bounding box rather than the trigger's, since the trigger sits at varying indents inside
  // different rows (a plain Fill row vs. a nested shadow row), same technique PositionSection's
  // own anchor-preview flyout already uses for panel-relative positioning.
  function handleOpenChange(next: boolean) {
    if (next) {
      const trigger = triggerRef.current;
      const panel = trigger?.closest('[data-panel-card]');
      const triggerRect = trigger?.getBoundingClientRect();
      const panelRect = (panel ?? trigger)?.getBoundingClientRect();
      if (triggerRect && panelRect) setAnchor({ left: panelRect.left, top: triggerRect.top });
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  const triggerWithRef = isValidElement(children) ? cloneElement(children as ReactElement<{ ref?: Ref<HTMLElement> }>, { ref: triggerRef }) : children;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor virtualRef={virtualAnchorRef} />
      <PopoverTrigger asChild>{triggerWithRef}</PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        className="border-[#26262C] p-0 text-chrome-fg"
        style={{ width: POPOVER_WIDTH, background: '#19191D', borderRadius: 16, boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)' }}
      >
        {/* Same px-4 as the tab content below, so the tabs' own left edge lines up with the color
            option row's left edge instead of sitting 8px further in. */}
        <div className="flex items-center px-4 py-3">
          <div className="flex h-8 items-center gap-1">
            {(['color', 'gradient'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex h-8 shrink-0 items-center justify-center rounded-[4px] px-3 text-sm tracking-[-0.01em] text-white transition-colors',
                  tab === key && 'shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)]',
                )}
                style={{ background: tab === key ? '#131316' : 'transparent' }}
              >
                {t(key === 'color' ? 'Color' : 'Gradient')}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto px-4 pb-4">
          {tab === 'color' ? (
            <ColorTab hex={isGradient(color) ? (parseGradient(color)?.stops[0]?.color ?? '#FFFFFF') : color} onChange={onChange} />
          ) : (
            <GradientTab value={color} onChange={onChange} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
