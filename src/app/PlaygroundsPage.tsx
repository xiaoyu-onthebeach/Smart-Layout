import { ChevronDown, CircleHelp, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const CREATE_BUTTONS = [
  { label: 'Image', icon: '/icons/image.svg' },
  { label: 'Video', icon: '/icons/video.svg' },
  { label: 'Layout', icon: '/icons/layout.svg' },
];

const FILTERS = ['All types', 'All teams', 'Newest first'];

// A static grid of empty cards — just filling the page the way a populated "Your playgrounds"
// list would, since this prototype has no real playground data behind it.
const PLACEHOLDER_CARDS = Array.from({ length: 15 }, (_, i) => i);

/**
 * The very first screen of the prototype — a stand-in for the wider product's "Playgrounds" home,
 * of which this banner tool is just one entry point ("Layout"). Everything here is static except
 * the three create-new buttons top-right; "Layout" is the only one that goes anywhere, since it's
 * the only surface this prototype actually builds — it drops straight into the existing banner
 * tool's own start screen (CanvasStart).
 */
export function PlaygroundsPage() {
  const goTo = useAppStore((s) => s.goTo);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: '#040406' }}>
      {/* Org bar */}
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-white transition-colors hover:bg-white/5"
        >
          <img src="/icons/logo.svg" alt="" className="size-6" />
          TheSEA Organization
          <ChevronDown className="size-4 opacity-70" />
        </button>

        <div className="flex items-center gap-2">
          <button type="button" className="flex h-8 items-center gap-1 rounded-lg px-3 text-sm text-white transition-colors hover:bg-white/5">
            English
            <ChevronDown className="size-4 opacity-70" />
          </button>
          <button type="button" aria-label="Help" className="flex size-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5">
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
          <h1 className="text-[30px] leading-[38px] font-bold text-white">Playgrounds</h1>
          <div className="flex shrink-0 items-center gap-3">
            {CREATE_BUTTONS.map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.label === 'Layout' ? () => goTo('editor') : undefined}
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-base font-semibold text-white transition-colors hover:bg-white/5"
                style={{ background: '#26262C', borderColor: '#40404A', letterSpacing: '-0.01em' }}
              >
                <img src={btn.icon} alt="" className="size-6" />
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs & filters */}
        <div
          className="z-[1] flex shrink-0 items-center gap-2 pt-8 pb-[18px]"
          style={{ background: 'linear-gradient(180deg, #040406 0%, rgba(4,4,6,0.6) 100%)' }}
        >
          <div className="flex flex-1 items-start gap-4">
            <div className="flex h-[34px] items-center border-b-2 pb-3 text-sm font-bold" style={{ borderColor: '#4570FF', color: '#4570FF' }}>
              Your playgrounds
            </div>
            <div className="flex h-[34px] items-center pb-3 text-sm font-bold text-white/85">Shared playgrounds</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {FILTERS.map((filter) => (
              <div
                key={filter}
                className="flex h-8 shrink-0 items-center gap-1 rounded-full border px-4 text-sm text-white/85"
                style={{ background: 'rgba(38,38,44,0.88)', borderColor: '#2F2F37' }}
              >
                {filter}
                <ChevronDown className="size-3 shrink-0 text-white/85" />
              </div>
            ))}
            <div
              className="flex h-8 w-[260px] shrink-0 items-center gap-1 rounded-full border px-4 text-sm text-white/25"
              style={{ background: 'rgba(38,38,44,0.88)', borderColor: '#2F2F37' }}
            >
              <Search className="size-4 shrink-0 text-white/45" />
              Search playgrounds
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
