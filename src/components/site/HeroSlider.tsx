import { ArrowLeft, ArrowRight } from 'lucide-react';

/*
 * The hero's slide controls: a dark circle with a left arrow, a gold one with a right arrow,
 * stacked at the right edge as in the reference.
 *
 * IT RENDERS NOTHING FOR A SINGLE SLIDE, which is the state the hero is in today. Two
 * buttons that cannot change anything are worse than no buttons: they are a control surface
 * that lies, and on a keyboard they are two extra tab stops that lead nowhere.
 *
 * When Hero's `SLIDES` grows a second entry this becomes a real control and needs the state
 * to go with it — `'use client'`, an index, and the same silent-jump loop CardCarousel
 * already implements. It is left as a presentational shell rather than built speculatively,
 * because the shape of that state depends on what the extra slides turn out to be.
 */

export function HeroSlider({ count }: { count: number }) {
  if (count < 2) return null;

  return (
    <div className="absolute top-1/2 right-6 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
      <button
        type="button"
        aria-label="Previous slide"
        className="grid size-12 place-items-center rounded-full bg-brand-800 text-white transition-colors hover:bg-brand-700"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        className="grid size-12 place-items-center rounded-full bg-gold-400 text-ink-950 transition-colors hover:bg-gold-500"
      >
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default HeroSlider;
