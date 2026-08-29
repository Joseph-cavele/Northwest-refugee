import { HandCoins, HeartHandshake, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { ORG } from '@/lib/site';

/*
 * A gold band carrying the organisation's own line, with three cards straddling its lower
 * edge — the reference's arrangement.
 *
 * THE HEADING IS NWHR'S ACTUAL TAGLINE, read from lib/site.ts, where the rest of the site
 * gets it. The reference fills that slot with "We are non-profit Charity & NGO Oranization",
 * typo and all, which is placeholder copy describing a category rather than an organisation.
 * "Empowering. Integrating. Transforming Lives." is the line NWHR already uses, so this band
 * says something only NWHR could say, and changing it later is one edit in one file.
 *
 * ON THE GOLD BAND, and it is worth being straight about: DESIGN.md reserves the accent
 * "exclusively for calls to action, progress indicators, and critical highlights", and a
 * full-width band is none of those. It is here because it is the defining feature of the
 * reference. Swapping `bg-gold-400` for black below would put the section back inside the
 * letter of that rule and cost nothing structurally — the cards, the overlap and the type
 * would all still work, and the type colours would flip.
 *
 * THE ICONS ARE gold-700, NOT gold-400. The logo's yellow on white measures 1.37:1 — not
 * merely low but effectively invisible, so it is never a mark on a light ground anywhere on
 * this site. gold-700 clears the 3:1 that a meaningful non-text element needs while still
 * reading unmistakably as gold.
 *
 * THE CARDS ARE NOT LINKS. Every destination they would point at currently 404s, and a card
 * that looks clickable and lands on a missing page is worse than one that never offered.
 * Wrap each in a <Link> when the pages exist; the layout does not change.
 */

interface Way {
  title: string;
  lead: string;
  body: string;
  Icon: LucideIcon;
}

const WAYS: Way[] = [
  {
    title: 'Donate',
    lead: 'Fund the work directly',
    body: 'Permit renewals, school placements and food support. Once, or monthly through a pledge.',
    Icon: HeartHandshake,
  },
  {
    title: 'Fundraise',
    lead: 'Raise it with us',
    body: 'Run a collection, a workplace match, or an event for one specific programme.',
    Icon: HandCoins,
  },
  {
    title: 'Volunteer',
    lead: 'Give time in Rustenburg',
    body: 'Intake days, tutoring, and going with people to their Home Affairs appointments.',
    Icon: Users,
  },
];

export function WaysToHelp() {
  return (
    <section aria-labelledby="ways-heading" className="relative bg-white font-(family-name:--font-ui)">
      {/*
       * The band is an absolutely positioned layer rather than a section the cards are pulled
       * out of with negative margins. Same result, and it cannot collapse: a negative margin
       * on a first child drags the parent's background up with it, which is exactly the bug
       * that makes this kind of overlap silently stop working.
       *
       * Its height is what decides how deep the overlap is. It is taller below sm because the
       * heading wraps to two lines there and the cards start further down.
       */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[17rem] bg-gold-400 sm:h-64" />

      <div className="relative mx-auto max-w-[80rem] px-4 pt-14 pb-16 lg:px-8 lg:pt-16 lg:pb-20">
        <h2
          id="ways-heading"
          className="text-center text-[clamp(1.5rem,3.5vw,2.25rem)] leading-[1.2] font-extrabold tracking-[-0.02em] text-balance text-ink-950"
        >
          {ORG.tagline}
        </h2>

        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {WAYS.map((way, index) => (
            <li key={way.title}>
              <Reveal delay={index * 100} className="h-full">
                <div className="flex h-full flex-col items-center rounded-3xl bg-white p-8 text-center shadow-[0_20px_40px_rgba(0,0,0,0.08)] sm:p-10">
                  <way.Icon
                    className="size-10 shrink-0 text-gold-700"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />

                  <h3 className="mt-5 text-lg font-extrabold tracking-[-0.01em] text-body">
                    {way.title}
                  </h3>

                  <p className="mt-1.5 text-sm text-subtle">{way.lead}</p>

                  {/* The short rule the reference sets between the title and the copy. */}
                  <span aria-hidden="true" className="mt-5 h-px w-10 bg-line-strong" />

                  <p className="mt-5 text-sm leading-6 text-muted">{way.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default WaysToHelp;
