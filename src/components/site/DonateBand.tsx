import Link from 'next/link';
import { HandHeart } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { PATHS } from '@/lib/paths';

/*
 * The donation band — section 11 of the reference, and the one full-width interruption on
 * the page.
 *
 * BLACK, NOT THE REFERENCE'S DARK GREEN. DESIGN.md gives Black to "structural elements and
 * high-impact backgrounds", which is exactly this, and green is not in the palette. The gold
 * button is the accent doing the job it is actually reserved for: a call to action.
 *
 * THE COPY NAMES THREE REAL THINGS. "Permits, school placements and food support" are the
 * services in guide.content.js, not a general appeal to generosity — a band that says
 * "donate what you can" tells a donor nothing about what their money becomes, and this
 * organisation can be specific because the work is specific.
 */

export function DonateBand() {
  return (
    <section aria-labelledby="donate-heading" className="bg-ink-950 font-(family-name:--font-ui)">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-20">
        <Reveal>
          <div className="flex flex-col items-center gap-8 text-center lg:flex-row lg:justify-between lg:gap-12 lg:text-left">
            <div className="max-w-2xl">
              <p className="flex items-center justify-center gap-3 text-sm font-semibold tracking-[0.16em] text-white/70 uppercase lg:justify-start">
                <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                Support the work
              </p>

              <h2
                id="donate-heading"
                className="mt-5 text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance text-white"
              >
                Every rand goes to permits, school placements and food support.
              </h2>
            </div>

            <Link
              href={PATHS.donate}
              className="inline-flex min-h-13 shrink-0 items-center gap-2 rounded-lg bg-gold-400 px-8 text-sm font-semibold tracking-wider text-ink-950 uppercase transition-colors hover:bg-gold-500"
            >
              <HandHeart className="size-5 shrink-0" aria-hidden="true" />
              Donate now
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default DonateBand;
