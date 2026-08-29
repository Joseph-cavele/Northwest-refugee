'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/*
 * The programme strip: a row of pictures laid on a shallow arc, all but one drained of colour,
 * with the one being looked at square-on, lit, and captioned underneath.
 *
 * WHAT THE ARC IS. Each panel is rotated a couple of degrees and dropped a few pixels by how
 * far it sits from the middle, which bends a straight row into a curve without a single
 * container query or a line of measurement. The two numbers are custom properties set here,
 * where the index is known; the transform that consumes them is `.arc-panel` in globals.css,
 * inside a media query, so below lg the whole effect switches off and the row becomes a plain
 * horizontal scroller. See the note there.
 *
 * WHY GREYSCALE UNTIL LOOKED AT, WHICH IS THE REFERENCE'S OWN DEVICE. Five photographs of
 * people at full strength, side by side, is five things competing and nothing to look at.
 * Draining four of them makes the fifth the subject — and it means the strip has somewhere to
 * go when a reader points at it, which is what an arc of static pictures otherwise lacks.
 *
 * HOVER IS NOT THE ONLY WAY IN, AND ON A PHONE IT IS NOT A WAY IN AT ALL. Three things set the
 * current panel, because three different people arrive at this strip differently:
 *
 *   pointer   `onMouseEnter` — the desktop reader, pointing at one.
 *   keyboard  `onFocus` — tabbing across moves the colour and the caption exactly as a cursor
 *             does.
 *   swipe     an IntersectionObserver on the scroller, below lg only.
 *
 * THE THIRD ONE IS NOT OPTIONAL, and its absence was a real bug rather than a missing polish:
 * a phone has no hover, so swiping to the fourth panel used to leave the caption naming the
 * second. The picture and the words under it disagreed, on the one layout where the caption is
 * the only thing telling the reader what they are looking at.
 *
 * NO AUTOPLAY, DELIBERATELY. Every other carousel on this page advances on a timer because it
 * holds more than fits. This holds everything it has, all at once — there is nothing hidden to
 * rotate to, and a strip that changed colour under a reader who was not touching it would be
 * movement with nothing to say.
 */

export interface Programme {
  id: string;
  /** The programme, named as somebody would ask for it. */
  title: string;
  /** The pillar it belongs to. */
  category: string;
  href: string;
  /** A path under /public, or null to render the reserved frame. */
  image: string | null;
  /** What the picture shows. Read aloud, so never "programme image". */
  imageAlt: string;
  /** What the frame is waiting for, shown while `image` is null. */
  imageBrief: string;
}

interface ProgrammeStripProps {
  items: Programme[];
  /** Names the strip for assistive tech. */
  label: string;
  className?: string;
}

export function ProgrammeStrip({ items, label, className }: ProgrammeStripProps) {
  // The middle panel is the one in colour before anybody touches the strip, which is where
  // the reference puts it and where the eye lands anyway.
  const middle = Math.floor(items.length / 2);
  const [current, setCurrent] = useState(middle);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = items[current] ?? items[middle];

  /*
   * Below lg the strip is a snap scroller, and the panel filling the viewport is the one the
   * caption has to name. The observer watches the panels against the SCROLLER as its root, so
   * it reports how much of each is inside the strip rather than inside the window.
   *
   * IT IS TORN DOWN AT lg. There the row is `overflow-visible` and every panel is fully in
   * view at once, so an observer would fire for all five and fight the pointer for control of
   * the same state. `matchMedia` decides which regime is running, and re-decides on resize.
   *
   * The 0.6 floor is what stops a mid-swipe from flickering the caption between two panels:
   * with one panel to a screen, only the one that has substantially arrived can claim it.
   */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const query = window.matchMedia('(width < 64rem)');
    let observer: IntersectionObserver | null = null;

    function start() {
      if (!list) return;
      observer = new IntersectionObserver(
        (entries) => {
          const winner = entries
            .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

          if (!winner) return;
          const index = Number((winner.target as HTMLElement).dataset.index);
          if (!Number.isNaN(index)) setCurrent(index);
        },
        { root: list, threshold: [0.6, 0.9, 1] }
      );

      for (const child of Array.from(list.children)) observer.observe(child);
    }

    function apply() {
      observer?.disconnect();
      observer = null;
      if (query.matches) start();
    }

    apply();
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
      observer?.disconnect();
    };
  }, [items.length]);

  return (
    <div className={cn('font-(family-name:--font-ui)', className)}>
      {/*
       * Full bleed and scrollable below lg, centred and arced from lg. `-mx-4` cancels the
       * page container's own gutter so the strip runs to the window edge on a phone, where a
       * horizontal scroller that starts 20px in looks like it has been cropped by mistake.
       */}
      <ul
        ref={listRef}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-6 pb-10 lg:mx-0 lg:justify-center lg:overflow-visible lg:px-0"
      >
        {items.map((item, index) => {
          const offset = index - (items.length - 1) / 2;
          const isCurrent = index === current;

          return (
            <li
              key={item.id}
              data-index={index}
              data-current={isCurrent}
              /*
               * ONE PANEL AT A TIME ON A PHONE. `100vw - 2rem` is the viewport less the two
               * 16px gutters the list carries, so a panel fills the screen exactly between
               * them and its neighbours sit entirely off it — with snap-mandatory, a swipe
               * lands on one programme rather than between two.
               *
               * It was 78vw, which left a fifth of the next panel showing. That peek is right
               * on the appeals row, where the cards are a set to be scanned; here each panel
               * is a photograph with a caption of its own, and half of the next one visible
               * makes the reader wonder which of the two the caption belongs to.
               */
              className="arc-panel w-[calc(100vw-2rem)] shrink-0 snap-center transition-transform duration-500 ease-reveal sm:w-[22rem] lg:w-[19vw] lg:origin-bottom"
              style={
                {
                  // ~2° per step from the middle, and a drop that grows with distance: the two
                  // together are what read as a curve rather than as a fan.
                  '--arc-rotate': `${offset * 2.2}deg`,
                  '--arc-lift': `${Math.abs(offset) * 14}px`,
                  // Behind its neighbours unless it is the one in colour, so the lifted panel
                  // is never clipped by the card next to it.
                  zIndex: isCurrent ? 10 : 1,
                } as React.CSSProperties
              }
            >
              <Link
                href={item.href}
                onMouseEnter={() => setCurrent(index)}
                onFocus={() => setCurrent(index)}
                className="group relative block aspect-4/3 overflow-hidden rounded-2xl bg-ink-100"
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.imageAlt}
                    fill
                    sizes="(min-width: 1024px) 19vw, (min-width: 640px) 22rem, 78vw"
                    className={cn(
                      'object-cover object-center transition-[filter] duration-500 ease-reveal',
                      isCurrent ? 'grayscale-0' : 'grayscale'
                    )}
                  />
                ) : (
                  <div className="grid h-full place-items-center border-2 border-dashed border-line-strong p-4 text-center">
                    <span>
                      <ImageIcon
                        className="mx-auto size-7 text-line-strong"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <span className="mt-2 block text-xs font-semibold text-subtle">
                        {item.imageBrief}
                      </span>
                    </span>
                  </div>
                )}

                {/*
                 * The badge the reference puts over the picture being looked at. It is drawn
                 * inside the link rather than beside it — one target, so there is no second
                 * thing to hit and no second stop in the tab order.
                 */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-0 grid place-items-center transition-opacity duration-500 ease-reveal',
                    isCurrent ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  <span className="grid size-16 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-ink-950/30 transition-colors group-hover:bg-brand-700">
                    <ArrowUpRight className="size-7" />
                  </span>
                </span>

                {/* The caption below is decorative repetition, so the name the link is
                    announced by has to live here. */}
                <span className="sr-only">
                  {item.title} — {item.category}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/*
       * One caption under the strip rather than one per panel, as in the reference. It is
       * aria-hidden: every panel already carries its own name, and a live region that changed
       * on every hover would narrate the strip to somebody who is merely passing over it.
       *
       * The height is fixed so a two-word title and a four-word one do not move the section
       * underneath as the reader crosses the row.
       */}
      <div aria-hidden="true" className="min-h-16 text-center">
        <p className="text-[clamp(1.25rem,2.5vw,1.75rem)] leading-tight font-extrabold tracking-[-0.02em] text-balance text-ink-950">
          {shown?.title}
        </p>
        <p className="mt-1.5 text-sm text-muted">{shown?.category}</p>
      </div>
    </div>
  );
}

export default ProgrammeStrip;
