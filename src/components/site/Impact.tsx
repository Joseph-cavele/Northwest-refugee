import { Reveal } from '@/components/ui/reveal';

/*
 * The counter band — section 5 of the reference.
 *
 * WHY THESE THREE NUMBERS AND NOT THE REFERENCE'S FOUR. It counts campaigns, funds raised,
 * happy volunteers and years of fundraising, and ships every one of them as a literal zero,
 * because they are slots for data the template cannot know. NWHR's are equally unknown here,
 * and they are the numbers a funder checks hardest — inventing "12 000 people helped" is the
 * single most damaging sentence this page could carry.
 *
 * So the band counts things that are TRUE AND CHECKABLE from this repository:
 *
 *   5   the programme pillars, enumerated in types/enums.ts and validated by the server
 *   4   the languages the guide answers in, in guide.content.js
 *   0   records kept without consent — enforced before any personal detail is written
 *
 * The last one is the point of the section. Every charity site claims impact; almost none can
 * put a zero on the page and have it mean something a system actually guarantees. It says
 * more about how this organisation works than a headcount would, and unlike a headcount it
 * cannot quietly go stale.
 *
 * WHEN REAL FIGURES EXIST — beneficiaries assisted, permits renewed, funds raised — they
 * belong here beside these, sourced from the reports module rather than typed in. The shape
 * below takes them without changing.
 *
 * DESIGN.md CARRIES THE HIERARCHY WITH SCALE, not colour: "extreme scale and weight contrast
 * rather than font variety". So the numbers are Inter 800 at display size in near-black, the
 * labels are its label-md, and the only accent is the hairline under each figure.
 */

interface Stat {
  value: string;
  label: string;
  /** The one line that stops a bare number being a boast. */
  note: string;
}

const STATS: Stat[] = [
  {
    value: '5',
    label: 'Programme pillars',
    note: 'Documentation, education, skills, social cohesion, women and youth.',
  },
  {
    value: '4',
    label: 'Languages',
    note: 'The help guide answers in English, French, Kiswahili and Português.',
  },
  {
    value: '0',
    label: 'Records without consent',
    note: 'Nothing about a person is stored until they have agreed to it.',
  },
];

export function Impact() {
  return (
    <section aria-labelledby="impact-heading" className="bg-canvas font-(family-name:--font-ui)">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-20">
        <h2 id="impact-heading" className="sr-only">
          NWHR in numbers
        </h2>

        <ul className="grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STATS.map((stat, index) => (
            <li key={stat.label}>
              <Reveal delay={index * 100}>
                <div className="flex flex-col">
                  <span className="text-[clamp(3rem,7vw,4.5rem)] leading-none font-extrabold tracking-[-0.04em] text-body tabular-nums">
                    {stat.value}
                  </span>

                  {/* The only accent in the section, and a rule rather than a glyph — gold
                      on this near-white ground measures 1.37:1 and is never type here. */}
                  <span aria-hidden="true" className="mt-5 h-0.5 w-10 rounded-full bg-gold-400" />

                  <p className="mt-5 text-sm font-semibold tracking-[0.16em] text-body uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-muted">{stat.note}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default Impact;
