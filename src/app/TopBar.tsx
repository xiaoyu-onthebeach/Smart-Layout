import { ChevronDown, CircleHelp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { ModeSwitch } from './ModeSwitch';
import { RULER_SIZE } from '@/features/editor/artboard/RulerOverlay';

// Document-level title — not tied to any single page, so it's a fixed label for now.
const DOCUMENT_TITLE = 'La Plage - Winter 2027 Amazon+Q10 Campaign';

export function TopBar() {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const downloading = useAppStore((s) => s.downloading);
  const showRulers = useAppStore((s) => s.showRulers);
  const step = useAppStore((s) => s.step);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const t = useT();
  // Rulers are only ever toggled on while editing (see CanvasZoomBar) — this guard just keeps a
  // stale `showRulers` from a previous editor session pushing the header around on another step.
  // Rulers belong to the canvas, so the Bulk edit view (which hides it) never shifts the header either.
  const rulersActive = showRulers && step === 'editor' && workspaceView === 'edit';

  return (
    <header
      className="absolute right-0 z-10 flex h-14 shrink-0 items-center justify-between px-3 text-chrome-fg transition-[top,left] duration-150"
      style={{ top: rulersActive ? RULER_SIZE : 0, left: rulersActive ? RULER_SIZE : 0 }}
    >
      <div className="flex items-center gap-4 py-3 pr-6 pl-3">
        <img src="/icons/logo.svg" alt="Beachside" className="size-8" />
        <span className="text-sm font-medium text-chrome-fg">{DOCUMENT_TITLE}</span>
        {step === 'editor' && <ModeSwitch />}
      </div>


      <div className="flex items-center gap-2 p-3">
        {downloading && <img src="/icons/dropdown/Downloading.svg" alt="" className="size-6 animate-spin" />}

        {/* Figma "Button 32 / Primary text". Not wired to anything yet. */}
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-[#4570FF] px-3 text-[14px] leading-[1.4] tracking-[-0.01em] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.03),0px_1px_3px_rgba(0,0,0,0.02),0px_2px_2px_rgba(0,0,0,0.02)] transition-colors hover:bg-[#2C52DA]"
        >
          <img src="/icons/share.svg" alt="" className="size-6 shrink-0" />
          {t('Share playground')}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 items-center gap-1 rounded-lg px-3 text-sm text-chrome-fg transition-colors hover:bg-white/5"
            >
              {language === 'ja' ? '日本語' : 'English'}
              <ChevronDown className="size-4 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setLanguage('en')}>English</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage('ja')}>日本語</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          aria-label={t('Help')}
          className="flex size-8 items-center justify-center rounded-lg text-chrome-fg transition-colors hover:bg-white/5"
        >
          <CircleHelp className="size-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-white/5">
              <img src="/samples/Baptiste.jpg" alt="" className="size-8 shrink-0 rounded-full object-cover" />
              <ChevronDown className="size-4 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>{t('Account')}</DropdownMenuItem>
            <DropdownMenuItem disabled>{t('Sign out')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
