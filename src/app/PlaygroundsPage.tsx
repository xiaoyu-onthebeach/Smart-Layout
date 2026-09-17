import { useState } from 'react';
import { ChevronDown, CircleHelp, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/store/useAppStore';
import { createEmptyLayout, nextId } from '@/lib/create-layout';
import { nearestPreset } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import type { BannerSet } from '@/types';
import { useT } from '@/lib/i18n';

// The default first banner — a plain square, no platform/preset attached, so there are no
// platform-specific safe zones or rules to satisfy while getting started.
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 500;

const CREATE_BUTTONS = [
  { label: 'Image', icon: '/icons/image.svg' },
  { label: 'Video', icon: '/icons/video.svg' },
];

// No real team backend behind this — every team drops into the exact same new layout, same as
// "Layout" itself used to before it grew this menu; the choice is here purely for the prototype's
// own sake, not because it changes what gets created.
const TEAMS = ['Demo team', 'Dev team', 'Team 3'];

const FILTERS = ['All types', 'All teams', 'Newest first'];

/** The "Layout" create-button — the only one of the three that actually goes anywhere. Hovering
 * swaps its icon from the plain "T" mark to the "+" version (`layout-hover.svg`); clicking opens a
 * "choose a team" menu instead of creating immediately, since picking a team is where the real
 * product would branch. Every team leads to the same place here (see `TEAMS`'s own comment). */
function LayoutCreateButton({ onSelectTeam }: { onSelectTeam: () => void }) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative flex h-10 w-[129px] shrink-0 items-center justify-center gap-2 rounded-xl border text-base font-semibold text-white transition-colors"
          style={{
            background: hovered ? '#131316' : '#26262C',
            borderColor: hovered ? 'transparent' : '#40404A',
            letterSpacing: '-0.01em',
          }}
        >
          {/* Hover-only border: a plain gray ring with a soft amber glow bleeding in from the
              icon/chevron corner — matches layout-button-hover.svg's own two-layer stroke (a flat
              #40404A ring plus a radial gradient one laid on top). Built as a separate ring
              (mask-composite "punches out" the fill, leaving only a 1px band) rather than a real
              `border`, since a plain border can't take a gradient without this same trick anyway. */}
          {hovered && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{
                padding: 1,
                background: 'radial-gradient(60px 60px at 88% 0%, #EAB22E 0%, #40404A 75%)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
              }}
            />
          )}
          <img src={hovered ? '/icons/layout-hover.svg' : '/icons/Layout_24.svg'} alt="" className="size-6" />
          {t('Layout')}
          <ChevronDown className="size-4 text-white/45" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[166px] gap-0 rounded-lg border p-1"
        style={{
          background: 'rgba(38,38,44,0.88)',
          borderColor: '#40404A',
          boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <DropdownMenuLabel className="flex h-6 items-center px-3 py-0 text-[11px] font-normal tracking-[-0.01em] text-white/45">
          {t('CHOOSE A TEAM')}
        </DropdownMenuLabel>
        {TEAMS.map((team) => (
          <DropdownMenuItem
            key={team}
            onClick={onSelectTeam}
            className="h-8 rounded-lg px-3 py-0 text-[13px] leading-[140%] tracking-[-0.01em] text-white focus:bg-white/10"
          >
            {t(team)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A static grid of empty cards — just filling the page the way a populated "Your playgrounds"
// list would, since this prototype has no real playground data behind it.
const PLACEHOLDER_CARDS = Array.from({ length: 15 }, (_, i) => i);

/**
 * The very first screen of the prototype — a stand-in for the wider product's "Playgrounds" home,
 * of which this banner tool is just one entry point ("Layout"). Everything here is static except
 * the three create-new buttons top-right; "Layout" is the only one that goes anywhere, since it's
 * the only surface this prototype actually builds — it drops straight into the banner editor with
 * one blank scene already created.
 */
export function PlaygroundsPage() {
  const goTo = useAppStore((s) => s.goTo);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const upsertLayout = useAppStore((s) => s.upsertLayout);
  const loadSet = useAppStore((s) => s.loadSet);
  const setActiveLayout = useAppStore((s) => s.setActiveLayout);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);
  const t = useT();

  // "Layout" drops straight into the editor with one blank custom-size scene already in place —
  // no separate "empty canvas" start screen in between (that screen used to live here; removed so
  // the very first thing after clicking Layout is the real canvas, matching every visit after it).
  function handleCreateLayout() {
    const setId = nextId('set');
    const productId = nextId('product');
    const label = t('Main Square');
    const layout = createEmptyLayout({
      setId,
      productId,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      label,
      presetId: undefined,
      ruleSetId: nearestPreset(DEFAULT_WIDTH, DEFAULT_HEIGHT)?.preset.ruleSetId ?? NO_RULES_ID,
      language,
    });
    const bannerSet: BannerSet = { id: setId, name: label, sourceLayoutId: layout.id, layoutIds: [layout.id], productIds: [] };
    upsertLayout(layout);
    loadSet(bannerSet);
    setActiveCanvas(setId);
    setActiveLayout(layout.id);
    goTo('editor');
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: '#040406' }}>
      {/* Org bar */}
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-white transition-colors hover:bg-white/5"
        >
          <img src="/icons/logo.svg" alt="" className="size-6" />
          {t('TheSEA Organization')}
          <ChevronDown className="size-4 opacity-70" />
        </button>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex h-8 items-center gap-1 rounded-lg px-3 text-sm text-white transition-colors hover:bg-white/5">
                {language === 'ja' ? '日本語' : 'English'}
                <ChevronDown className="size-4 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLanguage('en')}>English</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage('ja')}>日本語</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" aria-label={t('Help')} className="flex size-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5">
            <CircleHelp className="size-4" />
          </button>
          <button type="button" className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-white/5">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/25 text-xs font-medium text-white">B</span>
            <ChevronDown className="size-4 opacity-70" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-16">
        {/* Playgrounds section header */}
        <div className="z-[2] flex h-10 shrink-0 items-center justify-between">
          <h1 className="text-[30px] leading-[38px] font-bold text-white">{t('Playgrounds')}</h1>
          <div className="flex shrink-0 items-center gap-3">
            {CREATE_BUTTONS.map((btn) => (
              <button
                key={btn.label}
                type="button"
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-base font-semibold text-white transition-colors hover:bg-white/5"
                style={{ background: '#26262C', borderColor: '#40404A', letterSpacing: '-0.01em' }}
              >
                <img src={btn.icon} alt="" className="size-6" />
                {t(btn.label)}
                <ChevronDown className="size-4 text-white/45" />
              </button>
            ))}
            <LayoutCreateButton onSelectTeam={handleCreateLayout} />
          </div>
        </div>

        {/* Tabs & filters */}
        <div
          className="z-[1] flex shrink-0 items-center gap-2 pt-8 pb-[18px]"
          style={{ background: 'linear-gradient(180deg, #040406 0%, rgba(4,4,6,0.6) 100%)' }}
        >
          <div className="flex flex-1 items-start gap-4">
            <div className="flex h-[34px] items-center border-b-2 pb-3 text-sm font-bold" style={{ borderColor: '#4570FF', color: '#4570FF' }}>
              {t('Your playgrounds')}
            </div>
            <div className="flex h-[34px] items-center pb-3 text-sm font-bold text-white/85">{t('Shared playgrounds')}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {FILTERS.map((filter) => (
              <div
                key={filter}
                className="flex h-8 shrink-0 items-center gap-1 rounded-full border px-4 text-sm text-white/85"
                style={{ background: 'rgba(38,38,44,0.88)', borderColor: '#2F2F37' }}
              >
                {t(filter)}
                <ChevronDown className="size-3 shrink-0 text-white/85" />
              </div>
            ))}
            <div
              className="flex h-8 w-[260px] shrink-0 items-center gap-1 rounded-full border px-4 text-sm text-white/25"
              style={{ background: 'rgba(38,38,44,0.88)', borderColor: '#2F2F37' }}
            >
              <Search className="size-4 shrink-0 text-white/45" />
              {t('Search playgrounds')}
            </div>
          </div>
        </div>

        {/* Placeholder grid */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="grid grid-cols-5 gap-8">
            {PLACEHOLDER_CARDS.map((i) => (
              <div key={i} className="aspect-square rounded-2xl" style={{ background: '#18181B' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
