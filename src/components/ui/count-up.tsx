'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/*
 * A figure that counts up the first time it is seen.
 *
 * THE FINAL VALUE IS THE DEFAULT, AND THAT IS THE WHOLE DESIGN. It is what the server
 * renders, what a crawler reads, and what somebody with JavaScript blocked or still loading
 * sees. The animation only ever takes a number that is already correct and replays it. The
 * opposite arrangement — render 0, count up once the script arrives — puts "0+ Refugees
 * helped" on a charity's homepage for anyone whose bundle is slow or blocked, which on this
 * audience's connections is not a rare case.
 *
 * `useLayoutEffect`, NOT `useEffect`, and this is the one subtle part. The effect sets the
 * display back to 0 before animating; in a passive effect that lands AFTER paint, so the
 * final number flashes for a frame and then snaps to zero. A layout effect runs before the
 * browser paints, so the first thing drawn is already the start of the count. It falls back
 * to useEffect on the server, where layout effects do not run and React warns about them.
 *
 * REDUCED MOTION IS A FULL STOP. Under the preference nothing is armed at all — the figure
 * simply is its value. That is also the correct fallback if IntersectionObserver is missing.
 */

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** How far into the viewport the figure must come before it counts as seen. */
const OFFSET_PX = 80;
const DURATION_MS = 1400;

/** Fast at first and settling slowly — a counter that eases out reads as landing on a total. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface CountUpProps {
  /**
   * The figure as written, suffix included — "500K+", "35+", "100K+".
   *
   * Parsed rather than passed as a number plus a suffix so the call site keeps one readable
   * string and the display never has to be reassembled from parts.
   */
  value: string;
  className?: string;
}

export function CountUp({ value, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  // "500K+" → 500 and "K+". A value with no leading digits animates nothing and renders as-is.
  const match = /^(\d[\d,.]*)(.*)$/.exec(value.trim());
  const target = match ? Number(match[1]!.replace(/,/g, '')) : null;
  const suffix = match?.[2] ?? '';

  const [display, setDisplay] = useState<number | null>(target);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element || target === null) return;

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      return;
    }

    setDisplay(0);

    let frame = 0;
    let started = false;

    const run = () => {
      if (started) return;
      started = true;

      const begin = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - begin) / DURATION_MS);
        setDisplay(Math.round(easeOutCubic(progress) * target));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        run();
        // Once only. A total that re-counts every time it scrolls past reads as a gauge
        // rather than a figure.
        observer.disconnect();
      },
      { rootMargin: `0px 0px -${OFFSET_PX}px 0px` }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <span ref={ref} className={className}>
      {display === null ? value : `${display.toLocaleString('en-ZA')}${suffix}`}
    </span>
  );
}

export default CountUp;
