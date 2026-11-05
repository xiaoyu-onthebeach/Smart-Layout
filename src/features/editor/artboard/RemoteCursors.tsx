import { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { PRESENCE_USERS } from '@/lib/presence';

/** The arrow's path (Figma "cursor 24") — the same shape as the app's own cursor. */
const ARROW_PATH =
  'M3.12541 5.59857C2.5398 3.93841 4.13842 2.33981 5.7986 2.9254L14.9369 6.14903C16.8001 6.80624 16.8019 9.44007 14.9396 10.0998L12.4553 10.9797C11.8596 11.1907 11.3908 11.6596 11.1798 12.2552L10.2999 14.7395C9.66072 16.5437 7.1684 16.5985 6.41591 14.9059L6.34907 14.7367L3.12541 5.59857Z';
/** Where the arrow's tip sits in its box — what the position points at. */
const TIP = { x: 3, y: 3 };
/** How often a move takes someone to another banner rather than elsewhere on the same one. */
const SWITCH_BANNER_CHANCE = 0.25;

const OTHERS = PRESENCE_USERS.filter((user) => !user.you && user.color);

/** A banner on the canvas, in canvas (world) coordinates. */
export type CursorBanner = { id: string; x: number; y: number; w: number; h: number };
type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
/** One person's mocked activity: the banner they're on, and their cursor gliding from `from` to `to`. */
type Activity = { pageId: string; from: Point; to: Point; start: number; duration: number };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Somewhere on the banner, away from its very edges. */
const pointOn = (banner: CursorBanner): Point => ({ x: banner.x + banner.w * (0.15 + Math.random() * 0.7), y: banner.y + banner.h * (0.15 + Math.random() * 0.7) });
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * Mocked presence on the canvas: the other people on the playground (see lib/presence.ts), each
 * on a banner — their cursor glides around it, rests, and now and then moves to another banner.
 * The cursors live in canvas coordinates, so they stay on their banners as you pan and zoom; they
 * are drawn straight to the DOM each frame (no re-render) and never take the pointer.
 *
 * Following someone (their avatar in the top bar): the canvas frames the banner they're on, and
 * again whenever they move to another — with a border in their color and a "Following" label,
 * which stops it (as does Escape, or any pan or zoom of your own — see MultiPageCanvas).
 */
export function RemoteCursors({ banners, camera, labelTop }: { banners: CursorBanner[]; camera: Camera; /** Where the "Following" label sits, clear of what's along the top. */ labelTop: number }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const followingUserName = useAppStore((s) => s.followingUserName);
  const following = OTHERS.find((user) => user.name === followingUserName);
  const setFollowingUser = useAppStore((s) => s.setFollowingUser);
  const requestFocusPages = useAppStore((s) => s.requestFocusPages);

  const bannersRef = useRef(banners);
  const cameraRef = useRef(camera);
  useLayoutEffect(() => {
    bannersRef.current = banners;
    cameraRef.current = camera;
  });
  const followingRef = useRef<string | null>(null);
  followingRef.current = following?.name ?? null;
  const activities = useRef<(Activity | null)[]>(OTHERS.map(() => null));
  const cursorEls = useRef<(HTMLDivElement | null)[]>([]);

  // The mocked moves: each person, in turn, glides somewhere else on their banner or onto another.
  useEffect(() => {
    const timers: number[] = [];
    OTHERS.forEach((user, i) => {
      const move = () => {
        const list = bannersRef.current;
        if (list.length === 0) {
          timers[i] = window.setTimeout(move, 1000);
          return;
        }
        const now = performance.now();
        const current = activities.current[i];
        const currentBanner = current && list.find((b) => b.id === current.pageId);
        const banner = !currentBanner || (list.length > 1 && Math.random() < SWITCH_BANNER_CHANCE) ? pick(list.filter((b) => b !== currentBanner)) : currentBanner;
        const to = pointOn(banner);
        const from = current ? positionAt(current, now) : to;
        // Unhurried, and slower over longer distances on screen, like a hand would.
        const zoom = cameraRef.current.zoom;
        const duration = current ? 1500 + Math.min(4500, Math.hypot(to.x - from.x, to.y - from.y) * zoom * 6) : 0;
        activities.current[i] = { pageId: banner.id, from, to, start: now, duration };
        // Onto another banner while being followed: the canvas goes there with them.
        if (followingRef.current === user.name && banner.id !== current?.pageId) useAppStore.getState().requestFocusPages([banner.id]);
        // The move, then a rest of 1.5 to 5s before the next one.
        timers[i] = window.setTimeout(move, duration + 1500 + Math.random() * 3500);
      };
      // Staggered, so they don't all start together.
      timers[i] = window.setTimeout(move, i * 1500);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Each frame, every cursor where its glide has got to, on screen.
  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      const cam = cameraRef.current;
      OTHERS.forEach((_, i) => {
        const el = cursorEls.current[i];
        const activity = activities.current[i];
        if (!el) return;
        if (!activity || !bannersRef.current.some((b) => b.id === activity.pageId)) {
          el.style.visibility = 'hidden';
          return;
        }
        const p = positionAt(activity, now);
        el.style.visibility = '';
        el.style.transform = `translate(${p.x * cam.zoom + cam.x - TIP.x}px, ${p.y * cam.zoom + cam.y - TIP.y}px)`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Starting to follow someone: straight to the banner they're on.
  useEffect(() => {
    if (!following) return;
    const activity = activities.current[OTHERS.indexOf(following)];
    if (activity) requestFocusPages([activity.pageId]);
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setFollowingUser(null);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [following, requestFocusPages, setFollowingUser]);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {OTHERS.map((user, i) => (
          <div
            key={user.name}
            ref={(el) => {
              cursorEls.current[i] = el;
            }}
            className="absolute top-0 left-0 flex flex-col items-start will-change-transform"
            style={{ visibility: 'hidden' }}
          >
            <svg width="21.3353" height="21.3351" viewBox="0 0 21.3353 21.3351" className="-mb-[5.3px] drop-shadow-[1px_1.2px_1.5px_rgba(0,0,0,0.25)]">
              {/* The same dark arrow as everyone's, its white outline drawn under the fill — so, like
                  the app's own cursor's, only its outer 1px shows. */}
              <path d={ARROW_PATH} fill="var(--chrome-bg)" stroke="white" strokeWidth={2} strokeLinejoin="round" paintOrder="stroke" />
            </svg>
            <div className="pl-4">
              <span
                className="block rounded-[18px] px-2 py-0.5 text-[11px] leading-[17px] font-bold tracking-[0.01em] whitespace-nowrap text-white shadow-[0px_1px_2px_rgba(0,0,0,0.16)]"
                style={{ background: user.color }}
              >
                {user.name}
              </span>
            </div>
          </div>
        ))}
      </div>
      {following && (
        <>
          {/* Under the top bar (z-10), so in Create the mode tab hanging over it hides its top edge
              there — the tab carries it around its own outline instead (see ModeSwitch). */}
          <div className="pointer-events-none absolute inset-0 z-[9] rounded-[inherit] border-2" style={{ borderColor: following.color }} />
          <button
            type="button"
            onClick={() => setFollowingUser(null)}
            className="absolute left-1/2 z-20 flex h-6 -translate-x-1/2 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[12px] font-semibold whitespace-nowrap text-white shadow-[0px_1px_2px_rgba(0,0,0,0.16)]"
            style={{ top: labelTop, background: following.color }}
            aria-label={t('Stop following')}
          >
            {language === 'ja' ? `${following.name}をフォロー中` : `Following ${following.name}`}
            <X className="size-3.5" />
          </button>
        </>
      )}
    </>
  );
}

/** Where a glide has got to at `now`. */
function positionAt(activity: Activity, now: number): Point {
  const t = activity.duration > 0 ? easeInOut(Math.min(1, (now - activity.start) / activity.duration)) : 1;
  return { x: activity.from.x + (activity.to.x - activity.from.x) * t, y: activity.from.y + (activity.to.y - activity.from.y) * t };
}
