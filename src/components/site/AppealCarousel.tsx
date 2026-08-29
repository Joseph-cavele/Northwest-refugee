'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, HandHeart, ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLoopingCarousel } from '@/hooks/useLoopingCarousel';
import { formatRandsWhole, percentOf } from '@/lib/money';
import { cn } from '@/lib/utils';

/*
 * The appeals carousel: a looping row of things somebody can give towards, each with its own
 * target and its own progress.
 *
 * BUILT TO A SUPPLIED REFERENCE — picture on top, title, one line of copy, a progress panel,
 * then the action; heading left and the arrows opposite it; dots underneath. Four things in
 * it are deliberately not the reference's.
 *
 * NO PHOTOGRAPHS, AND THE SPACE IS HELD FOR THEM. Every card reserves a 4:3 frame and names
 * what belongs in it, so dropping the pictures in moves nothing — the layout being reviewed
 * now is the layout that ships, and the page scores no cumulative layout shift when they
 * arrive. The empty state is a labelled reservation rather than a blank box, which is the
 * test About.tsx already sets for a placeholder: it has to read as obviously unfinished.
 *
 * NO INVENTED TOTALS. The reference fills its bars with "Raised: 141.03 Million" against a
 * goal of 5,000 — lorem numbers, which on a real charity's page is a claim about money.
 * `raisedCents` is therefore OPTIONAL here, and a card without one renders the panel with an
 * empty track and says the appeal has not opened rather than drawing a bar it cannot support.
 * Supply the figure and the bar lights up; nothing else about the card moves.
 *
 * THE CURRENT CARD IS MARKED BY ITS BUTTON, NOT BY ITS BACKGROUND. Whichever card the track
 * has just brought to the front fills its action black, and grows its progress bar from
 * nothing to its own figure. Inverting the whole card was tried and is worse: five tall cards
 * with one painted black turns the row into a chessboard, and the photograph — the thing each
 * card is actually offering — ends up floating on a slab. The fill replays every time the
 * card comes round; see the `key` on it and `--animate-fill-track` in globals.css for why
 * that needs no state.
 *
 * GOLD IS THE BAR AND THE ARROW, NEVER A WORD. The logo's yellow measures 1.37:1 on white and
 * cannot be type at all — the same constraint SectionHeading is written to. Here it fills the
 * progress track and the next-button, both of which carry ink-950 glyphs.
 *
 * AMOUNTS ARE INTEGER CENTS, shown as whole rands. `formatRandsWhole` — not formatZARCompact,
 * which is the house formatter for a progress bar and is wrong on this one; its header in
 * lib/money.ts sets out why. A card 20vw wide has room for the real number.
 */

export interface Appeal {
  id: string;
  title: string;
  /** One or two lines. The card is not the appeal's page. */
  description: string;
  /** A path under /public/images, or null to render the reserved frame. */
  image: string | null;
  /** What the picture shows. Read aloud, so never "campaign image". */
  imageAlt: string;
  /** What the frame is waiting for, shown while `image` is null: "4:3 — a classroom". */
  imageBrief: string;
  /** The target, in cents. */
  goalCents: number;
  /** Given so far, in cents. Omit until the real figure is known — see the note above. */
  raisedCents?: number;
  /** Where "Donate now" goes. */
  href: string;
}

interface AppealCarouselProps {
  items: Appeal[];
  /** The small line above the heading. */
  eyebrow: string;
  /** The heading itself — a node, so the caller can accent one word. */
  title: ReactNode;
  /** Names the region for assistive tech. Required — an unlabelled carousel is a mystery. */
  label: string;
  /** Milliseconds between automatic steps. */
  interval?: number;
  className?: string;
}

export function AppealCarousel({
  items,
  eyebrow,
  title,
  label,
  interval = 5000,
  className,
}: AppealCarouselProps) {
  const count = items.length;
  const { index, active, animated, next, previous, goTo, handleTransitionEnd, pauseProps } =
    useLoopingCarousel(count, interval);

  /*
   * Three copies. `ghost` decides which one a screen reader and the tab key are allowed in;
   * `at` is the item's own position, which is what decides whether it is the current card.
   * Comparing against `at` rather than against a position in this flattened list is what
   * keeps all three copies of the current card looking identical — the reader is about to
   * be shown one of the other two, and a highlight that only exists on the middle copy
   * would blink off every time the track jumps between them.
   */
  const track = [0, 1, 2].flatMap((copy) =>
    items.map((item, at) => ({ ...item, at, key: `${copy}-${item.id}`, ghost: copy !== 1 }))
  );

  return (
    <div
      className={cn('font-(family-name:--font-ui)', className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      {...pauseProps}
    >
      {/* --- heading, with the arrows opposite it ---------------------------------------- */}
      <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between sm:gap-12">
        <div className="max-w-2xl">
          {/* label-md, in brand blue — the eyebrow treatment SectionHeading already sets. */}
          <p className="flex items-center gap-3 text-sm leading-5 font-semibold tracking-[0.05em] text-brand-500 uppercase">
            <HandHeart className="size-6 shrink-0" aria-hidden="true" />
            {eyebrow}
          </p>

          {/* headline-xl, stepped down on small screens where 48px would wrap to four lines. */}
          <h2 className="mt-5 text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance text-ink-950">
            {title}
          </h2>
        </div>

        {/*
         * The arrows sit with the heading on desktop and drop below it on mobile, where a
         * 52px control in the corner of a 20px margin has nowhere to go. They are not the
         * only way through the row — the dots underneath are targets in their own right.
         */}
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={previous}
            aria-label={'Previous ' + label.toLowerCase()}
            className="grid size-13 place-items-center rounded-full bg-ink-950 text-white transition-colors hover:bg-ink-800"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={'Next ' + label.toLowerCase()}
            className="grid size-13 place-items-center rounded-full bg-gold-400 text-ink-950 transition-colors hover:bg-gold-500"
          >
            <ArrowRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* --- the track ------------------------------------------------------------------- */}
      {/*
       * -mx-3 cancels the padding each card carries for its own gap, so the row lines up with
       * the heading above it rather than sitting 12px inside it.
       */}
      <div className="mt-14 -mx-3 overflow-hidden">
        <div
          onTransitionEnd={handleTransitionEnd}
          /*
           * The responsive card count is pure CSS — no measuring, no ResizeObserver, no
           * layout read. `--cards` is how many are visible; a card is `100% / var(--cards)`
           * wide and one step translates by the same amount. The fractional value at md is
           * what leaves the next card peeking at the edge, as in the reference.
           *
           * FOUR ON DESKTOP, AND FOUR EXACTLY — no peeking fifth. A whole number is the count
           * the reader is being shown; 4.2 would fill the same row with four cards and a
           * sliver, which at this card's width reads as a rendering fault rather than as an
           * invitation. The row is complete, and the dots say how many more there are.
           *
           * ONE WHOLE CARD ON A PHONE — 1, not 1.1. The peek is worth a tenth of a card on a
           * wide row, where it says "there is more" without costing anything; on a 360px
           * screen that tenth comes off the only card the reader has, and the card is tall
           * enough already that squeezing its picture and its progress panel to advertise the
           * next one is a bad trade. The dots underneath say "there is more" instead.
           *
           * The second card waits for md rather than sm: at 640px two of these are 300px
           * each, which is where the title starts wrapping to three lines.
           */
          className={cn(
            'flex [--cards:1] md:[--cards:2.2] lg:[--cards:4]',
            animated ? 'transition-transform duration-700 ease-out' : 'transition-none'
          )}
          style={
            {
              '--i': index,
              transform: 'translateX(calc(var(--i) * -100% / var(--cards)))',
            } as React.CSSProperties
          }
        >
          {track.map((appeal) => (
            <div
              key={appeal.key}
              aria-hidden={appeal.ghost || undefined}
              /*
               * `inert` as well as aria-hidden. Each outer copy holds a real link, and
               * aria-hidden alone leaves it in the tab order — a keyboard user would tab out
               * of the visible row into two invisible duplicates of it.
               */
              inert={appeal.ghost || undefined}
              className="w-[calc(100%/var(--cards))] flex-none px-3"
            >
              <AppealCard appeal={appeal} current={appeal.at === active} />
            </div>
          ))}
        </div>
      </div>

      {/* --- dots ------------------------------------------------------------------------ */}
      {/*
       * Real controls, not indicators. The list is short enough that "the third one" is
       * something a reader can want to get back to, and a dot they can see but not press is
       * the commonest small lie in this pattern.
       */}
      <div className="mt-12 flex items-center justify-center gap-2.5">
        {items.map((appeal, i) => (
          <button
            key={appeal.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={appeal.title}
            aria-current={i === active || undefined}
            className={cn(
              'grid size-6 place-items-center rounded-full transition-colors',
              // The current dot is ringed as well as darker: colour alone is not a signal,
              // and these are 10px marks in a row of identical ones.
              i === active ? 'ring-2 ring-ink-950' : 'hover:bg-ink-100'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'block size-2.5 rounded-full transition-colors',
                i === active ? 'bg-ink-950' : 'bg-ink-300'
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/*
 * `current` is the leftmost of the visible run — the card the track has just brought to the
 * front. It changes exactly two things: the button's fill, and whether the progress bar
 * replays its growth. Everything else about the card looks the same whatever it is doing.
 *
 * Both are slower than the track's own 700ms slide, so a card has finished moving before it
 * has finished changing. Reversing that order makes the row feel like it flashes.
 */
function AppealCard({ appeal, current }: { appeal: Appeal; current: boolean }) {
  const { goalCents, raisedCents } = appeal;

  const open = typeof raisedCents === 'number';
  // percentOf guards the divide (a goal of zero is a data error, and NaN% is how it reaches
  // the page) and clamps to 0–100, so an over-subscribed appeal cannot draw past its track.
  const percent = open ? percentOf(raisedCents, goalCents) : 0;

  return (
    <article className="flex h-full flex-col rounded-3xl border border-line bg-surface p-4 transition-shadow hover:shadow-lg">
      {/* --- the picture, or the space kept for it --------------------------------------- */}
      <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-ink-50">
        {appeal.image ? (
          <Image
            src={appeal.image}
            alt={appeal.imageAlt}
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover object-center"
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
                {appeal.imageBrief}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-2 pt-6 pb-2">
        <h3 className="text-lg leading-6 font-extrabold tracking-[-0.02em] text-balance text-ink-950">
          {appeal.title}
        </h3>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">{appeal.description}</p>

        {/* mt-auto: the panels line up across cards whose copy runs to different lengths. */}
        <div className="mt-auto pt-6">
          <div className="rounded-2xl bg-sunken p-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-muted">Donation</span>
              <span className="font-bold text-ink-950 tabular-nums">
                {open ? percent + '%' : '—'}
              </span>
            </div>

            {/*
             * A native progressbar rather than two nested divs: a screen reader announces the
             * proportion, which is the only thing this bar is for. An unopened appeal carries
             * no value at all — an absent `aria-valuenow` is the standard indeterminate, where
             * 0% would claim nothing has been given rather than that nothing has been counted.
             */}
            <div
              role="progressbar"
              aria-label={appeal.title + ': raised against target'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={open ? percent : undefined}
              className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200"
            >
              {/*
               * THE FILL GROWS WHEN THE CARD ARRIVES, and the replay is the `key`, not a piece
               * of state. Flipping `current` swaps the key, React mounts a fresh span, and a
               * CSS animation on a freshly mounted element runs from the start — so the bar
               * fills again every time this card comes round, with no effect, no timer and
               * nothing to reset when it leaves.
               *
               * `motion-safe:` rather than a matchMedia check: under prefers-reduced-motion
               * the span simply renders at its resting width, which is the finished state.
               * The same trade the rest of this site makes — no JavaScript, no animation,
               * all content.
               */}
              <span
                key={current ? 'current' : 'idle'}
                className="block h-full rounded-full bg-gold-400 motion-safe:animate-fill-track"
                style={{ width: percent + '%' }}
              />
            </div>

            {/*
             * STACKED UNTIL xl, side by side above it. Four cards on a 1024px screen leaves
             * roughly 170px inside this panel, and "Raised: R 120 000" beside "Goal: R 180
             * 000" does not fit in it — the two figures would wrap mid-number, which is the
             * one way a money figure must never break. Two lines always fit.
             */}
            <div className="mt-3 flex flex-col gap-1 text-sm xl:flex-row xl:items-baseline xl:justify-between xl:gap-3">
              <span className="whitespace-nowrap text-muted">
                {open ? 'Raised: ' + formatRandsWhole(raisedCents) : 'Not open yet'}
              </span>
              <span className="whitespace-nowrap text-muted">
                Goal:{' '}
                <span className="font-bold text-ink-950">{formatRandsWhole(goalCents)}</span>
              </span>
            </div>
          </div>

          {/*
           * THE BUTTON IS THE ONLY THING THAT INVERTS. The current card's action fills black
           * — the same state every other card reaches on hover, held rather than waited for —
           * so the row can say which card it means with one 48px element instead of repainting
           * a whole card. White on ink-950 is 21:1.
           */}
          <Link
            href={appeal.href}
            className={cn(
              'mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink-950 px-6 text-xs font-semibold tracking-[0.09em] uppercase transition-colors duration-500',
              current
                ? 'bg-ink-950 text-white hover:bg-ink-800'
                : 'bg-surface text-ink-950 hover:bg-ink-950 hover:text-white'
            )}
          >
            <HandHeart className="size-4 shrink-0" aria-hidden="true" />
            Donate now
            {/* Five identical "Donate now" links in a row is a screen reader's link list with
                nothing to choose between. The appeal's name makes each one distinct. */}
            <span className="sr-only">: {appeal.title}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default AppealCarousel;
