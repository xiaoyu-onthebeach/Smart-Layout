import { useEffect, useRef, useState } from 'react';
import { PRESENCE_USERS } from '@/lib/presence';

/** The arrow's path (Figma "cursor 24") — the same shape as the app's own cursor. */
const ARROW_PATH =
  'M3.12541 5.59857C2.5398 3.93841 4.13842 2.33981 5.7986 2.9254L14.9369 6.14903C16.8001 6.80624 16.8019 9.44007 14.9396 10.0998L12.4553 10.9797C11.8596 11.1907 11.3908 11.6596 11.1798 12.2552L10.2999 14.7395C9.66072 16.5437 7.1684 16.5985 6.41591 14.9059L6.34907 14.7367L3.12541 5.59857Z';
/** Where the arrow's tip sits in its box — what the position points at. */
const TIP = { x: 3, y: 3 };

const OTHERS = PRESENCE_USERS.filter((user) => !user.you && user.color);

type Pose = { x: number; y: number; duration: number };

/** A point somewhere over the canvas, as a fraction of its size — clear of its edges, where the
 * panels and toolbars float (the floating sidebar takes up the left of it). */
function randomPoint() {
  return { x: 0.3 + Math.random() * 0.55, y: 0.12 + Math.random() * 0.7 };
}

/** One person's cursor (Figma "Cursor"): the same dark arrow as everyone's (the app's own cursor),
 * and their name in a pill of their color just below and right of it. */
function RemoteCursor({ name, color, pose, width, height }: { name: string; color: string; pose: Pose; width: number; height: number }) {
  return (
    <div
      className="absolute top-0 left-0 flex flex-col items-start ease-[cubic-bezier(0.45,0,0.25,1)] will-change-transform motion-safe:transition-transform"
      style={{ transform: `translate(${pose.x * width - TIP.x}px, ${pose.y * height - TIP.y}px)`, transitionDuration: `${pose.duration}ms` }}
    >
      <svg width="21.3353" height="21.3351" viewBox="0 0 21.3353 21.3351" className="-mb-[5.3px] drop-shadow-[1px_1.2px_1.5px_rgba(0,0,0,0.25)]" aria-hidden>
        {/* The white outline drawn under the fill — so, like the app's own cursor's, only its outer
            1px shows. */}
        <path d={ARROW_PATH} fill="var(--chrome-bg)" stroke="white" strokeWidth={2} strokeLinejoin="round" paintOrder="stroke" />
      </svg>
      <div className="pl-4">
        <span
          className="block rounded-[18px] px-2 py-0.5 text-[11px] leading-[17px] font-bold tracking-[0.01em] whitespace-nowrap text-white shadow-[0px_1px_2px_rgba(0,0,0,0.16)]"
          style={{ background: color }}
        >
          {name}
        </span>
      </div>
    </div>
  );
}

/**
 * Mocked presence: the other people on the playground (see lib/presence.ts), their cursors drifting
 * around the canvas — each glides to a new spot, rests a moment, and moves on. Above the banners,
 * below the panels and toolbars, and never in the way of the pointer.
 */
export function RemoteCursors() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [poses, setPoses] = useState<Pose[]>(() => OTHERS.map(() => ({ ...randomPoint(), duration: 0 })));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The latest poses, for working out each next move outside of a render.
  const posesRef = useRef(poses);
  useEffect(() => {
    const timers: number[] = [];
    OTHERS.forEach((_, i) => {
      const move = () => {
        const from = posesRef.current[i];
        const target = randomPoint();
        // Unhurried, and slower over longer distances, like a hand would.
        const duration = 2000 + Math.hypot(target.x - from.x, target.y - from.y) * 6000;
        posesRef.current = posesRef.current.map((pose, j) => (j === i ? { ...target, duration } : pose));
        setPoses(posesRef.current);
        // The move, then a rest of 1.5 to 5s before the next one.
        timers[i] = window.setTimeout(move, duration + 1500 + Math.random() * 3500);
      };
      // Staggered, so they don't all start together.
      timers[i] = window.setTimeout(move, 500 + i * 1500);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {size.width > 0 &&
        OTHERS.map((user, i) => <RemoteCursor key={user.name} name={user.name} color={user.color!} pose={poses[i]} width={size.width} height={size.height} />)}
    </div>
  );
}
