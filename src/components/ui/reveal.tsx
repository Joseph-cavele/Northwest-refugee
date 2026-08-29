'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/*
 * Reveal on scroll: fade up when the element first enters the viewport.
 *
 * WHY THIS IS NOT AOS, WHICH IS THE OBVIOUS LIBRARY FOR IT. AOS ships a stylesheet whose
 * first rule is `[data-aos] { opacity: 0 }`, and its JavaScript is what adds the class that
 * puts the opacity back. That is a reasonable trade on a marketing site and the wrong one
 * here: if the script does not arrive — a dropped connection, a blocked CDN, a phone that
 * gave up — every element carrying the attribute stays invisible. The page renders blank.
 *
 * This site's audience reads it on cheap phones over patchy data, and the rest of the
 * codebase already refuses that trade: the navigation menu is a <details> so it opens before
 * any bundle lands, and the help guide fetches its tree once so it keeps working after the
 * connection drops. A scroll animation is decoration, and decoration must never be what
 * stands between somebody and the address of an office.
 *
 * SO THE DEFAULT STATE IS VISIBLE. Nothing is hidden by CSS. This component hides an element
 * only after JavaScript has run, confirmed it is below the fold, and taken responsibility for
 * showing it again. No JavaScript, no animation, all content — which is the same outcome AOS
 * intends and the opposite of what it does when it fails.
 *
 * THREE BEHAVIOURS, ALL FROM THE AOS PLAYBOOK:
 *
 *   once     an element animates the first time it is seen and never again. Re-animating on
 *            every scroll past is what makes a long page feel restless.
 *   offset   the reveal fires slightly before the element is fully on screen, so it is
 *            finishing as the reader arrives at it rather than starting.
 *   reduced  under prefers-reduced-motion nothing is ever hidden and nothing animates.
 */

interface RevealProps {
  children: React.ReactNode;
  /** Milliseconds after the element is seen. Use to stagger a row — 0, 100, 200. */
  delay?: number;
  className?: string;
}

/** How far into the viewport the element must come before it counts as seen. */
const OFFSET_PX = 80;

export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  /*
   * 'open' is the only state that renders anything unusual, and it is never the first one.
   * Starting at 'ready' — the finished appearance — is what makes a no-JavaScript render
   * correct rather than blank.
   */
  const [state, setState] = useState<'ready' | 'armed' | 'open'>('ready');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /*
     * Anything already on screen when the page loads is left alone. Arming it would hide
     * something the reader can see and then fade it back in — a flash, not a reveal — and an
     * element above the fold has no scroll to be triggered by anyway.
     */
    if (element.getBoundingClientRect().top < window.innerHeight - OFFSET_PX) return;

    setState('armed');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState('open');
        // `once`: stop watching the moment it has been seen.
        observer.disconnect();
      },
      { rootMargin: `0px 0px -${OFFSET_PX}px 0px` }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        state === 'armed' && 'opacity-0',
        state === 'open' && 'animate-fade-up',
        className
      )}
      style={state === 'open' && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export default Reveal;
