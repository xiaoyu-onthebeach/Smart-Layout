import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { ChevronDown, Pipette, RotateCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { clamp, hexToHsv, hsvToHex, isValidHex } from '@/lib/color';
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

function GhostIconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:bg-[#26262C]"
    >
      {children}
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
      {onEyedrop && (
        <GhostIconButton onClick={onEyedrop} label={t('Pick color from screen')}>
          <Pipette className="size-4" />
        </GhostIconButton>
      )}
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

function GradientTab() {
  const t = useT();
  const [stops, setStops] = useState<GradientStop[]>([
    { id: 'start', position: 0, color: '#FFFFFF' },
    { id: 'end', position: 100, color: '#999999' },
  ]);
  const [selectedId, setSelectedId] = useState('start');
  const [angle, setAngle] = useState(90);
  const trackRef = useRef<HTMLDivElement>(null);

  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const selected = stops.find((s) => s.id === selectedId) ?? stops[0];
  const gradientCss = `linear-gradient(${angle}deg, ${sorted.map((s) => `${s.color} ${s.position}%`).join(', ')})`;

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
      setStops((prev) => prev.map((s) => (s.id === id ? { ...s, position: pos } : s)));
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
    setStops((prev) => [...prev, { id, position: pos, color: nearest.color }]);
    setSelectedId(id);
  }

  function applyPreset(colors: string[]) {
    const next = colors.map((color, i) => ({ id: `stop-${stopIdCounter++}`, position: colors.length === 1 ? 0 : (i / (colors.length - 1)) * 100, color }));
    setStops(next);
    setSelectedId(next[0].id);
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
          {stops.map((s) => {
            const isSelected = s.id === selectedId;
            const chip = isSelected ? '#4570FF' : '#131316';
            return (
              <div
                key={s.id}
                onMouseDown={(e) => dragStop(s.id, e)}
                className="absolute top-0 size-6 -translate-x-1/2 cursor-grab rounded-md active:cursor-grabbing"
                style={{ left: `${s.position}%`, background: chip, boxShadow: '0px 1px 2px rgba(0,0,0,0.03),0px 1px 6px -1px rgba(0,0,0,0.02),0px 2px 4px rgba(0,0,0,0.02)' }}
              >
                <div className="absolute inset-1 rounded-sm" style={{ background: s.color }} />
                <div className="absolute left-1/2 top-[18px] size-2 -translate-x-1/2 rotate-45 rounded-[1px]" style={{ background: chip }} />
              </div>
            );
          })}
        </div>
        <GhostIconButton onClick={() => setAngle((a) => (a + 90) % 360)} label={t('Rotate gradient')}>
          <RotateCw className="size-4" />
        </GhostIconButton>
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
                setStops((prev) => prev.map((s) => (s.id === selected.id ? { ...s, color: hsvToHex(h, ns, nv) } : s)));
              }}
            />
            <HueSlider
              hue={hexToHsv(selected.color)[0]}
              onChange={(nh) => {
                const [, s2, v2] = hexToHsv(selected.color);
                setStops((prev) => prev.map((s) => (s.id === selected.id ? { ...s, color: hsvToHex(nh, s2, v2) } : s)));
              }}
            />
          </div>
          <HexRow
            hex={selected.color}
            onCommit={(hex) => setStops((prev) => prev.map((s) => (s.id === selected.id ? { ...s, color: hex } : s)))}
            onEyedrop={() => pickFromScreen((hex) => setStops((prev) => prev.map((s) => (s.id === selected.id ? { ...s, color: hex } : s))))}
          />
        </div>
      )}
    </div>
  );
}

/** Custom color picker popover — replaces the native `<input type="color">` everywhere a Fill/
 * Border swatch is clicked. The Color tab is fully wired to `onChange`; the Gradient tab is a
 * self-contained, purely visual editor (stop add/select/drag, per-stop color, rotate) — there's no
 * gradient-fill field anywhere in the data model yet, so it never calls `onChange` itself, the same
 * "designed ahead of the backing feature" scope PositionSection's anchor picker already has. */
export function ColorPickerPopover({ color, onChange, children }: { color: string; onChange: (hex: string) => void; children: ReactNode }) {
  const t = useT();
  const [tab, setTab] = useState<'color' | 'gradient'>('color');

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[308px] border-[#2F2F37] p-0 text-chrome-fg backdrop-blur-lg"
        style={{ background: 'rgba(38,38,44,0.88)', borderRadius: 16, boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)' }}
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-full items-center rounded-md p-0.5" style={{ background: '#131316' }}>
            {(['color', 'gradient'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center rounded text-sm tracking-[-0.01em] text-white transition-colors',
                  tab === key && 'bg-[#26262C] shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)]',
                )}
              >
                {t(key === 'color' ? 'Color' : 'Gradient')}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto px-4 pb-4">
          {tab === 'color' ? <ColorTab hex={color} onChange={onChange} /> : <GradientTab />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
