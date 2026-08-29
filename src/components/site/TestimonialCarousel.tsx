'use client';

import Image from 'next/image';
import { ArrowLeft, ArrowRight, ImageIcon, Star } from 'lucide-react';
import { useLoopingCarousel } from '@/hooks/useLoopingCarousel';
import { cn } from '@/lib/utils';

/*
 * What people say, as a looping carousel. Built to a supplied reference: stars, a quote over a
 * large faded quotation mark, then a portrait, a name and where the person is from — three
 * across on a desktop, one on a phone, arrows underneath.
 *
 * THE HARDEST PART OF THIS SECTION IS NOT THE LAYOUT. A testimonial is speech attributed to a
 * named person, which makes it the one thing on this site that cannot be approximated: an
 * invented quote is words put in somebody's mouth, and the reference supplies four of them
 * ("Charity Is The Voluntary Act Of Giving Help…", Michel Smith, Cloth Store Inc.). So this
 * component is built to render a quote that has not been collected yet WITHOUT pretending:
 *
 *   quote  — the words, or null for a labelled reservation the size of a real quote.
 *   name   — the speaker, or null while consent is outstanding, exactly as the volunteer
 *            cards handle it.
 *   rating — OPTIONAL, and absent means no stars are drawn. Five gold stars on a card whose
 *            quote does not exist yet is a score nobody gave, and it is the single easiest
 *            thing on this page to leave in by accident.
 *
 * AND FOR BENEFICIARIES IT IS NOT ONLY CONSENT. A named person thanking a refugee organisation
 * has published the fact that they are a refugee or an asylum seeker, to anybody who reads it.
 * `attribution` exists so a real quote can run under "Beneficiary, Rustenburg" with no name at
 * all — which is the form most of these should take, not a fallback.
 *
 * THE LOOP IS useLoopingCarousel, shared with the appeals and pillar carousels. Its header
 * explains the tripled track and the silent jump between copies.
 */

export interface Testimonial {
  id: string;
  /** The words, verbatim. Null renders a reservation — see the note above. */
  quote: string | null;
  /** How long the collected quote should run, shown in place of it. */
  quoteBrief: string;
  /** The speaker, once they have agreed to be named. */
  name: string | null;
  /** Who they are: "Volunteer", "Beneficiary, Rustenburg", "Partner organisation". */
  attribution: string;
  /** A path under /public, or null to render the reserved frame. */
  image: string | null;
  /** What the picture shows. Read aloud, so never "avatar". */
  imageAlt: string;
  /** Stars out of five. Omit unless somebody actually gave a score. */
  rating?: number;
}

interface TestimonialCarouselProps {
  items: Testimonial[];
  /** Names the region for assistive tech. Required — an unlabelled carousel is a mystery. */
  label: string;
  /** Milliseconds between automatic steps. */
  interval?: number;
  className?: string;
}

export function TestimonialCarousel({
  items,
  label,
  interval = 6000,
  className,
}: TestimonialCarouselProps) {
  const { index, active, animated, next, previous, handleTransitionEnd, pauseProps } =
    useLoopingCarousel(items.length, interval);

  /*
   * Three copies. `ghost` keeps a screen reader out of the outer two — otherwise every quote
   * is read three times — and `at` is the item's own position, which is what decides which
   * card is current. Comparing against `at` keeps all three copies of the current card
   * identical, so the highlight does not blink when the track jumps between them.
   */
  const track = [0, 1, 2].flatMap((copy) =>
    items.map((item, at) => ({ ...item, at, key: `${copy}-${item.id}`, ghost: copy !== 1 }))
  );

  return (
    <div
      className={cn('relative', className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      {...pauseProps}
    >
      {/* -mx-3 cancels the padding each card carries for its own gap, so the row lines up with
          the heading above it rather than sitting 12px inside it. */}
      <div className="-mx-3 overflow-hidden pt-2 pb-4">
        <div
          onTransitionEnd={handleTransitionEnd}
          /*
           * ONE ON A PHONE, THREE ON A DESKTOP, both exact. No fractional peek at either end:
           * a quote is read rather than scanned, and half a paragraph hanging off the edge
           * invites somebody to start reading a sentence that is not there. Two at md is the
           * only in-between width where a 40-word quote does not turn into a column of eight
           * lines.
           */
          className={cn(
            'flex [--cards:1] md:[--cards:2] lg:[--cards:3]',
            animated ? 'transition-transform duration-700 ease-out' : 'transition-none'
          )}
          style={
            {
              '--i': index,
              transform: 'translateX(calc(var(--i) * -100% / var(--cards)))',
            } as React.CSSProperties
          }
        >
          {track.map((item) => (
            <div
              key={item.key}
              aria-hidden={item.ghost || undefined}
              className="w-[calc(100%/var(--cards))] flex-none px-3"
            >
              <TestimonialCard item={item} current={item.at === active} />
            </div>
          ))}
        </div>
      </div>

      {/* Centred under the track, as in the reference — they steer a centred row. */}
      <div className="mt-10 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={previous}
          aria-label={`Previous ${label.toLowerCase()}`}
          className="grid size-13 place-items-center rounded-full bg-ink-950 text-white transition-colors hover:bg-ink-800"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label={`Next ${label.toLowerCase()}`}
          className="grid size-13 place-items-center rounded-full bg-gold-400 text-ink-950 transition-colors hover:bg-gold-500"
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function TestimonialCard({ item, current }: { item: Testimonial; current: boolean }) {
  return (
    <figure
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-3xl border bg-surface p-7 transition-colors duration-500 ease-reveal',
        // The current card is ringed in gold, as the reference has it. A border rather than a
        // fill: the card is mostly text, and tinting the ground under a paragraph is how a
        // quote ends up less readable than the three beside it.
        current ? 'border-gold-400' : 'border-line'
      )}
    >
      {/*
       * The oversized quotation mark the reference sits behind each quote. It is a glyph, not
       * an image, so it scales with the card and costs nothing — and it is aria-hidden, since
       * the <blockquote> underneath already tells a screen reader this is a quotation.
       *
       * ink-100 on white: visible as a texture, invisible as a word, and nowhere near the
       * contrast of the text crossing it.
       */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-6 right-4 font-serif text-[7rem] leading-none text-ink-100 select-none"
      >
        &rdquo;
      </span>

      {typeof item.rating === 'number' && (
        <div className="relative flex items-center gap-1" aria-label={`${item.rating} out of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              aria-hidden="true"
              className={cn(
                'size-4',
                i < item.rating! ? 'fill-gold-400 text-gold-400' : 'fill-ink-200 text-ink-200'
              )}
            />
          ))}
        </div>
      )}

      <blockquote className="relative mt-5 flex-1">
        {item.quote ? (
          <p className="text-sm leading-7 text-muted">&ldquo;{item.quote}&rdquo;</p>
        ) : (
          /*
           * The reservation, sized like the thing it is holding space for. It states what is
           * missing rather than filling the gap with plausible words — a lorem quote in this
           * slot is indistinguishable from a real one at a glance, which is exactly why it
           * cannot be here.
           */
          <p className="rounded-xl border-2 border-dashed border-line-strong p-4 text-sm leading-7 text-subtle italic">
            {item.quoteBrief}
          </p>
        )}
      </blockquote>

      <figcaption className="relative mt-7 flex items-center gap-4">
        {/* The portrait, or the space kept for it. 56px, and the frame holds either way. */}
        <span className="relative size-14 shrink-0 overflow-hidden rounded-full bg-ink-100">
          {item.image ? (
            <Image
              src={item.image}
              alt={item.imageAlt}
              fill
              sizes="56px"
              className="object-cover object-center"
            />
          ) : (
            <span className="grid h-full place-items-center border-2 border-dashed border-line-strong">
              <ImageIcon className="size-5 text-line-strong" strokeWidth={1.5} aria-hidden="true" />
            </span>
          )}
        </span>

        <span>
          {item.name ? (
            <span className="block text-sm font-extrabold tracking-[-0.01em] text-ink-950">
              {item.name}
            </span>
          ) : (
            <span className="block text-sm font-semibold text-subtle italic">
              Name once consent is recorded
            </span>
          )}
          <span className="mt-0.5 block text-sm text-muted">{item.attribution}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export default TestimonialCarousel;
