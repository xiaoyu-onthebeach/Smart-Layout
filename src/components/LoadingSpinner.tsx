import { useEffect, useId, useRef } from 'react';

/** Ease-out sextic: fast start, long decelerating tail each cycle — matches the source animation. */
function easing(t: number) {
  return 1 - Math.pow(1 - t, 6);
}

const CYCLE_DURATION_MS = 2300;

/** Rotating asterisk-mark loader used while a new page/scene is being created. */
export function LoadingSpinner({ size = 64 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId();
  const gradientA = `loader-a-${uid}`;
  const gradientB = `loader-b-${uid}`;

  useEffect(() => {
    let raf = 0;
    let progress = 0;
    let lastTime: number | null = null;

    function animate(timestamp: number) {
      if (lastTime === null) lastTime = timestamp;
      const dt = timestamp - lastTime;
      lastTime = timestamp;
      progress += dt / CYCLE_DURATION_MS;
      if (progress >= 1) progress -= 1;
      if (ref.current) ref.current.style.transform = `rotate(${easing(progress) * 360}deg)`;
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} style={{ width: size, height: size, willChange: 'transform' }}>
      <svg viewBox="0 0 230 230" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%', height: '100%' }}>
        <path
          d="M145.223 62.8019L199.77 31.4009L230 83.6072L175.466 114.999L230 146.393L199.77 198.599L145.223 167.197V230H84.7636V167.214L30.2296 198.607L0 146.401L54.5468 114.999L0 83.5991L30.2296 31.3928L84.7636 62.7856V0H145.223V62.8019Z"
          fill={`url(#${gradientA})`}
        />
        <path
          d="M145.223 62.8019L199.77 31.4009L230 83.6072L175.466 114.999L230 146.393L199.77 198.599L145.223 167.197V230H84.7636V167.214L30.2296 198.607L0 146.401L54.5468 114.999L0 83.5991L30.2296 31.3928L84.7636 62.7856V0H145.223V62.8019Z"
          fill={`url(#${gradientB})`}
        />
        <defs>
          <linearGradient id={gradientA} x1="229.999" y1="115" x2="0" y2="115" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.1" />
            <stop offset="1" stopColor="white" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={gradientB} x1="229.999" y1="115" x2="0" y2="115" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.1" />
            <stop offset="1" stopColor="white" stopOpacity="0.8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
