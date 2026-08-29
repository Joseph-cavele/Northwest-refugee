'use client';

import { useCallback, useEffect, useState } from 'react';

/*
 * The mechanics behind an endlessly looping card track: which slide is current, when the
 * transition is allowed to run, and when autoplay is permitted to move it.
 *
 * EXTRACTED AT THE SECOND USE, not the third. CardCarousel had all of this inline and the
 * appeals carousel needs the identical behaviour with a completely different card — and two
 * copies of a loop this fiddly is how one of them quietly loses the silent jump and starts
 * rewinding through five slides in front of the reader.
 *
 * HOW THE LOOP WORKS, since it is the part that is easy to get subtly wrong. The caller
 * renders the list THREE times and starts at `index === count`, the first card of the middle
 * copy. Moving in either direction therefore always has a real card to move onto, and when
 * the index wanders into the outer copies `handleTransitionEnd` jumps it back by one list
 * length WITH THE TRANSITION SWITCHED OFF. The copies are identical, so the jump is
 * invisible. Two copies would be enough going forwards and would stutter going backwards
 * from the first card — exactly the case a two-copy implementation forgets.
 *
 * AUTOPLAY IS OPT-IN ON THE READER'S BEHALF. It stays off until we have confirmed they have
 * not asked for reduced motion; defaulting to on and switching off after the first effect
 * would still have moved the cards once. It also stops on hover AND on focus-within, so
 * tabbing through the cards does not move them out from under the keyboard.
 */

export interface LoopingCarousel {
  /** Position in the tripled track. Feed it to the transform. */
  index: number;
  /** Which of the caller's own items is current, 0-based. For dots and aria-current. */
  active: number;
  /** False for exactly one frame, while the silent jump between copies paints. */
  animated: boolean;
  next: () => void;
  previous: () => void;
  /** Move to one of the caller's items by index, the short way round the ring. */
  goTo: (target: number) => void;
  /** Wire to the track's onTransitionEnd. This is what keeps the loop endless. */
  handleTransitionEnd: () => void;
  /** Spread onto the outermost element: hover and focus both hold the cards still. */
  pauseProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocusCapture: () => void;
    onBlurCapture: () => void;
  };
}

export function useLoopingCarousel(count: number, interval = 3500): LoopingCarousel {
  // Start in the middle copy, so the first move in either direction has somewhere to go.
  const [index, setIndex] = useState(count);
  const [animated, setAnimated] = useState(true);
  const [paused, setPaused] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);

  const next = useCallback(() => setIndex((i) => i + 1), []);
  const previous = useCallback(() => setIndex((i) => i - 1), []);

  /*
   * The short way round. A seven-card ring going from the last card to the first should
   * step forwards once, not scroll backwards through the other six — and the tripled track
   * means both are available, so the choice has to be made rather than fallen into.
   */
  const goTo = useCallback(
    (target: number) => {
      setIndex((i) => {
        const current = ((i % count) + count) % count;
        let delta = (((target - current) % count) + count) % count;
        if (delta > count / 2) delta -= count;
        return i + delta;
      });
    },
    [count]
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMotionAllowed(!query.matches);

    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (paused || !motionAllowed) return;

    const timer = window.setInterval(next, interval);
    return () => window.clearInterval(timer);
  }, [paused, motionAllowed, interval, next]);

  /*
   * Re-arm the transition on the frame AFTER a silent jump has painted. Doing it in the same
   * frame would let the browser coalesce the two style changes and animate the jump — which
   * is the whole thing we are avoiding.
   */
  useEffect(() => {
    if (animated) return;

    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, [animated]);

  /*
   * Deliberately reads `index` from the closure rather than using a setIndex updater: the
   * jump has to switch the transition off as well, and a setState call inside an updater
   * runs during the render phase, where React is free to invoke it twice.
   */
  const handleTransitionEnd = useCallback(() => {
    if (index >= count * 2) {
      setAnimated(false);
      setIndex(index - count);
    } else if (index < count) {
      setAnimated(false);
      setIndex(index + count);
    }
  }, [index, count]);

  return {
    index,
    active: ((index % count) + count) % count,
    animated,
    next,
    previous,
    goTo,
    handleTransitionEnd,
    pauseProps: {
      onMouseEnter: () => setPaused(true),
      onMouseLeave: () => setPaused(false),
      onFocusCapture: () => setPaused(true),
      onBlurCapture: () => setPaused(false),
    },
  };
}

export default useLoopingCarousel;
