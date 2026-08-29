'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLoopingCarousel } from '@/hooks/useLoopingCarousel';
import { cn } from '@/lib/utils';

/*
 * A looping card carousel.
 *
 * REUSABLE — it renders whatever `items` it is handed and knows nothing about pillars,
 * programmes or anything else on this site.
 *
 * THE LOOP ITSELF LIVES IN useLoopingCarousel, which this and AppealCarousel share: the list
 * is rendered three times, the index starts in the middle copy, and the jump between copies
 * happens with the transition switched off. The hook's header explains why. What stays here
 * is the part that is actually about these cards.
 *
 * THE MATH IS PURE CSS, so the responsive card count needs no measuring, no ResizeObserver
 * and no layout read. `--cards` is how many cards are visible, set per breakpoint by
 * Tailwind; a card is `100% / var(--cards)` wide; one step is a translate of the same
 * amount. Fractional values (4.2 rather than 4) are what leave the neighbours peeking at
 * the edges, as in the reference.
 *
 * ACCESSIBILITY. Only the middle copy is exposed — the outer two are `aria-hidden`, or a
 * screen reader would read every card three times. There is nothing focusable inside a card
 * here, so unlike AppealCarousel the ghosts need no `inert`.
 */

export interface CarouselCard {
  id: string;
  title: string;
  description: string;
  /**
   * The already-rendered icon, NOT the component that draws it.
   *
   * This file is `'use client'`, and a component is a function — functions cannot be passed
   * across the server/client boundary, so `Icon: LucideIcon` fails the build with
   * "Functions cannot be passed directly to Client Components". A rendered element is
   * serialisable and crosses fine, which also keeps the icon set out of this bundle: the
   * server draws it, this component only positions it.
   */
  icon: ReactNode;
  /** Utility classes for the icon circle — its fill and text colour. */
  tint: string;
  /** Utility class for the card's thin decorative border. */
  ring: string;
}

interface CardCarouselProps {
  items: CarouselCard[];
  /** Names the region for assistive tech. Required — an unlabelled carousel is a mystery. */
  label: string;
  /** Milliseconds between automatic steps. */
  interval?: number;
  className?: string;
}

export function CardCarousel({
  items,
  label,
  interval = 3500,
  className,
}: CardCarouselProps) {
  const { index, animated, next, previous, handleTransitionEnd, pauseProps } =
    useLoopingCarousel(items.length, interval);

  // Three copies. `copy` decides which one a screen reader is allowed to see.
  const track = [0, 1, 2].flatMap((copy) =>
    items.map((item) => ({ ...item, key: `${copy}-${item.id}`, ghost: copy !== 1 }))
  );

  return (
    <div
      className={cn('relative', className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      {...pauseProps}
    >
      <div className="overflow-hidden">
        <div
          onTransitionEnd={handleTransitionEnd}
          className={cn(
            'flex [--cards:1.15] sm:[--cards:2.2] lg:[--cards:4.2]',
            animated ? 'transition-transform duration-700 ease-out' : 'transition-none'
          )}
          style={
            {
              '--i': index,
              transform: 'translateX(calc(var(--i) * -100% / var(--cards)))',
            } as React.CSSProperties
          }
        >
          {track.map((card) => (
            <div
              key={card.key}
              aria-hidden={card.ghost || undefined}
              className="w-[calc(100%/var(--cards))] flex-none px-2.5"
            >
              <article
                className={cn(
                  'flex h-full flex-col rounded-2xl border bg-surface p-6 transition-shadow hover:shadow-lg',
                  card.ring
                )}
              >
                <span
                  className={cn(
                    'grid size-14 shrink-0 place-items-center rounded-full',
                    card.tint
                  )}
                >
                  {card.icon}
                </span>

                {/* `--font-heading` was Nunito, removed with the Charifund direction. Inter
                    carries every heading on the site now — see SectionHeading. */}
                <h3 className="mt-5 font-(family-name:--font-ui) text-lg font-extrabold tracking-[-0.02em] text-ink-950">
                  {card.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{card.description}</p>
              </article>
            </div>
          ))}
        </div>
      </div>

      {/* Below the cards, as specified — and centred, because they steer a centred track. */}
      <div className="mt-10 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={previous}
          aria-label={`Previous ${label.toLowerCase()}`}
          className="grid size-12 place-items-center rounded-full border border-line bg-surface text-ink-950 transition-colors hover:border-ink-950 hover:bg-ink-950 hover:text-white"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label={`Next ${label.toLowerCase()}`}
          className="grid size-12 place-items-center rounded-full bg-gold-400 text-ink-950 transition-colors hover:bg-gold-500"
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default CardCarousel;
