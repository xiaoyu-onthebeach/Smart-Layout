import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import type { WorkspaceView } from '@/store/types';
import { useT } from '@/lib/i18n';
import { PRESENCE_USERS } from '@/lib/presence';

/** The Create mode's icon (shapes) — inline, in `currentColor`, so it follows the button's own
 * active/inactive color. */
export function CreateModeIcon({ className }: { className?: string }) {
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

/** Trying the switch with icons only: the names move to a tooltip below each button. Back to
 * `true` to show them next to the icons again. */
const SHOW_MODE_LABELS = false;

/** The tab's corners' radius (top-tab-corner.svg), and its own bottom corners' (rounded-b-2xl). */
const CORNER = 20;
const BOTTOM_RADIUS = 16;

/**
 * While following someone in Create, the canvas's border in their color runs along the top of
 * the screen — where this tab hangs over it. This carries it around the tab instead: down its
 * curved corners, its sides and along its bottom, 2px wide on the canvas side of its outline (the
 * path runs 1px outside it), meeting the border's top edge at either end.
 */
function TabOutline({ width, height, color }: { width: number; height: number; color: string }) {
  const r = CORNER - 1;
  const b = BOTTOM_RADIUS + 1;
  const d = [
    `M 0 1`,
    `A ${r} ${r} 0 0 1 ${r} ${CORNER}`,
    `L ${r} ${height - BOTTOM_RADIUS}`,
    `A ${b} ${b} 0 0 0 ${CORNER + BOTTOM_RADIUS} ${height + 1}`,
    `L ${width - CORNER - BOTTOM_RADIUS} ${height + 1}`,
    `A ${b} ${b} 0 0 0 ${width - r} ${height - BOTTOM_RADIUS}`,
    `L ${width - r} ${CORNER}`,
    `A ${r} ${r} 0 0 1 ${width} 1`,
  ].join(' ');
  return (
    <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

/** Which mode the playground is in (Create / Replace) — a tab hanging from the top of the screen,
 * its top corners curving out into the edge (Figma "top menu"): two buttons, each with its icon and
 * name, the current one sunk into the page's own dark with its icon and name in the primary blue. */
export function ModeSwitch() {
  const t = useT();
  const view = useAppStore((s) => s.workspaceView);
  const setView = useAppStore((s) => s.setWorkspaceView);
  const followingUserName = useAppStore((s) => s.followingUserName);
  // Only in Create does the canvas (and so its follow border) reach up behind the tab.
  const followColor = view === 'edit' ? PRESENCE_USERS.find((user) => user.name === followingUserName)?.color : undefined;
  const tabRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = tabRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={tabRef} className="relative flex items-start">
      {followColor && size.width > 0 && <TabOutline width={size.width} height={size.height} color={followColor} />}
      <img src="/icons/top-tab-corner.svg" alt="" className="size-5 shrink-0" />
      <div className="flex items-center gap-1 rounded-b-2xl bg-chrome-border-soft px-2 pt-3 pb-2">
        {MODES.map(({ value, label, icon: Icon }) => {
          const button = (
            <button
              key={value}
              type="button"
              aria-label={SHOW_MODE_LABELS ? undefined : t(label)}
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium transition-colors',
                view === value
                  ? 'bg-chrome-bg text-chrome-active shadow-[0px_1px_1px_rgba(0,0,0,0.03),0px_1px_3px_rgba(0,0,0,0.02),0px_2px_2px_rgba(0,0,0,0.02)]'
                  : 'text-chrome-fg hover:bg-white/5',
              )}
            >
              <Icon className="size-6 shrink-0" />
              {SHOW_MODE_LABELS && t(label)}
            </button>
          );
          if (SHOW_MODE_LABELS) return button;
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="text-[14px]">
                {t(`${label} mode`)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <img src="/icons/top-tab-corner.svg" alt="" className="size-5 shrink-0 -scale-x-100" />
    </div>
  );
}
