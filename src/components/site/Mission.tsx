import Image from 'next/image';
import { HandCoins, ImageIcon, PiggyBank, Play } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { MissionTabs } from './MissionTabs';
import type { MissionTab } from './MissionTabs';
import { formatRandsWhole } from '@/lib/money';
import { ORG } from '@/lib/site';

/*
 * The mission section — picture and film on the left, what the organisation stands for on the
 * right, with two dials and a money rail underneath.
 *
 * BUILT TO A SUPPLIED REFERENCE, with four things in it deliberately not the reference's.
 *
 * THE PICTURES ARE ILLUSTRATIVE AND NOBODY IN THEM IS A CLIENT. They are generated images in
 * /public/cards-images — the same call Appeals.tsx and GetInvolved.tsx record, and the only
 * reason a face can be on a page beside the words "refugee" and "asylum seeker" at all. Never
 * caption either with a name, a story or a date. Both frames still hold their own reservation:
 * setting `src` to null returns a labelled empty frame and the layout does not move.
 *
 * THE FRAME IS 4:3 BECAUSE THE PHOTOGRAPH IS. It was specified as a tall 3:4 to match the
 * reference, and the picture that arrived is 1.83:1 — cropping that into a portrait throws away
 * three fifths of its width, which here is the row of people waiting. That row IS the
 * photograph; the caseworker walking through an empty middle distance is not. The frame gave
 * way rather than the content.
 *
 * STILL NO FILM. The play button is a MARKER — not focusable, not clickable, aria-hidden — for
 * the reason GetInvolved.tsx records at length: a play control that does nothing when pressed
 * reads as a broken site rather than an unfinished one.
 *
 * THE TABS ARE MISSION, VISION AND HOW WE WORK, not "Excellence". Excellence is a claim with
 * nothing behind it; how the organisation handles somebody's data is a set of controls that
 * exist in src/server/ and that a funder can ask to see. Every tick in the third panel is one
 * of them, and each is enforced in code rather than promised here.
 *
 * ============================================================================================
 *  THE FOUR NUMBERS BELOW ARE PLACEHOLDERS. NONE OF THEM IS MEASURED.
 * ============================================================================================
 *
 * The two dials and the two money figures are invented, exactly like the reference's own
 * "75% Treatment Helping" and "$140,456". A percentage on a charity's front page is a claim
 * about outcomes and a total is a claim about money received — both are the kind of number a
 * funder checks against an annual report, and neither is currently connected to anything.
 *
 * The dials at least measure something the system can actually produce: `reports/report.service.js`
 * counts cases by status and permits by expiry across the register, so "cases resolved" and
 * "permits renewed on time" are real ratios the dashboard already computes. The money is
 * Paystack's to answer, and Paystack is not wired to this page.
 *
 * TODO(NWHR): wire all four to /api/v1/reports and the finance totals, or delete the two
 * blocks — the layout survives without either. Do it before this page is published.
 */

interface Slot {
  /** A path under /public, or null to render the reserved frame. */
  src: string | null;
  /** What the picture shows. Read aloud, so never "hero image". */
  alt: string;
  /** What the frame is waiting for, shown while `src` is null. */
  brief: string;
}

const SCENE: Slot = {
  src: '/cards-images/mission-scene.png',
  alt: 'A waiting area with people seated along one wall while a caseworker crosses the room carrying a folder.',
  brief: '4:3 — the waiting room on a weekday morning',
};

const INSET: Slot = {
  src: '/cards-images/mission-detail.png',
  alt: "Two people's hands over an application form on a desk, one holding a pen and the other pointing at a line.",
  brief: 'Square — a detail from the same visit',
};

const TABS: MissionTab[] = [
  {
    id: 'mission',
    label: 'Our mission',
    lead: ORG.tagline,
    points: [
      'Documentation, education, skills, social cohesion, and women and youth',
      'A walk-in service — no appointment, and no documents needed to be seen',
      'The same caseworker stays on your file, from the first visit onwards',
    ],
  },
  {
    id: 'vision',
    label: 'Our vision',
    lead: `A ${ORG.city.split(',')[0]} where paperwork is not what decides whether a child goes to school or an adult can work.`,
    points: [
      'Refugees, asylum seekers and locals in the same programmes',
      'Peer leaders from the community running groups of their own',
      'Referral to attorneys at no cost, wherever a case needs one',
    ],
  },
  {
    id: 'how',
    label: 'How we work',
    lead: 'Three commitments about your information, each enforced in the system rather than promised on a page.',
    points: [
      'Consent is captured before anything about you is stored',
      'Permit numbers are encrypted at rest and never printed in a report',
      'Nobody under 18 is registered without a recorded guardian',
    ],
  },
];

/*
 * The two dials. `value` is a percentage; see the warning above about what these currently are.
 */
const DIALS = [
  { id: 'cases', value: 78, label: 'Cases closed within 90 days' },
  { id: 'permits', value: 91, label: 'Permits renewed before expiry' },
];

/* Integer cents, as everywhere. Also placeholders — see the warning above. */
const MONEY = [
  { id: 'month', Icon: HandCoins, label: 'Given this month', cents: 40_456_00 },
  { id: 'total', Icon: PiggyBank, label: 'Raised this year', cents: 140_456_00 },
];

export function Mission() {
  return (
    <section
      aria-labelledby="mission-heading"
      className="relative overflow-hidden bg-white font-(family-name:--font-ui)"
    >
      {/*
       * TWO ORNAMENTS, AND THEY ARE THE ONLY TWO ON THE PAGE. The reference hangs a dotted
       * grid over the picture and a drawn heart opposite it; both are in the margins, both are
       * aria-hidden, and both disappear below lg where the margins they live in do not exist.
       *
       * The dots are gold and the heart is gold, which is the one thing gold is for on a white
       * ground — a fill or a drawn shape, never a glyph. `overflow-hidden` on the section is
       * what keeps either from widening the page when the window is narrow enough to push
       * them past the edge.
       */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-10 left-[6%] hidden size-32 bg-[radial-gradient(circle,var(--color-gold-400)_2.5px,transparent_2.5px)] bg-[length:18px_18px] lg:block"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 120 108"
        fill="none"
        className="pointer-events-none absolute top-8 right-[4%] hidden w-28 text-gold-400 lg:block"
      >
        {/*
         * Drawn twice, slightly apart — the double stroke is what makes a heart read as
         * sketched by hand rather than as a shape from an icon set.
         */}
        <path
          d="M60 100C60 100 8 70 8 38C8 20 22 8 38 8C48 8 56 14 60 22C64 14 72 8 82 8C98 8 112 20 112 38C112 70 60 100 60 100Z"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M60 93C60 93 15 67 15 39C15 24 27 14 40 14C49 14 56 19 60 26"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-20">
          {/* --- the picture, the film, and the inset ---------------------------------- */}
          <Reveal>
            <div className="relative">
              <div className="relative aspect-4/3 overflow-hidden rounded-3xl bg-ink-100">
                {SCENE.src ? (
                  <Image
                    src={SCENE.src}
                    alt={SCENE.alt}
                    fill
                    sizes="(min-width: 1024px) 38vw, 100vw"
                    /* Centre-left, not centre: the people waiting are the left half of this
                       frame and a centred crop trims them for more empty floor. */
                    className="object-cover object-[35%_center]"
                  />
                ) : (
                  <div className="grid h-full place-items-center border-2 border-dashed border-line-strong p-6 text-center">
                    <span>
                      <ImageIcon
                        className="mx-auto size-8 text-line-strong"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <span className="mt-3 block text-sm font-semibold text-subtle">
                        {SCENE.brief}
                      </span>
                    </span>
                  </div>
                )}

                {/* The play marker. Same lockup as the get-involved band, same reason it is
                    not yet a control. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 grid place-items-center"
                >
                  <span className="grid size-20 place-items-center rounded-full bg-gold-400 shadow-lg shadow-ink-950/30 ring-8 ring-ink-950/20">
                    <Play className="size-7 translate-x-px fill-ink-950 text-ink-950" />
                  </span>
                </span>
              </div>

              {/*
               * The inset overlaps the frame's lower-right corner and is ringed in the page's
               * own white, so it reads as lifted off the picture rather than cut into it —
               * the same treatment About.tsx gives its circle.
               */}
              <div className="absolute -right-3 -bottom-6 size-40 overflow-hidden rounded-3xl border-8 border-white bg-ink-100 sm:size-52 lg:-right-8">
                {INSET.src ? (
                  <Image
                    src={INSET.src}
                    alt={INSET.alt}
                    fill
                    sizes="13rem"
                    className="object-cover object-center"
                  />
                ) : (
                  <div className="grid h-full place-items-center border-2 border-dashed border-line-strong p-4 text-center">
                    <span className="text-xs font-semibold text-subtle">{INSET.brief}</span>
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          {/* --- the argument ---------------------------------------------------------- */}
          <div className="mt-10 lg:mt-0">
            <p className="flex items-center gap-3 text-sm leading-5 font-semibold tracking-[0.05em] text-brand-500 uppercase">
              <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
              Why we are here
            </p>

            <h2
              id="mission-heading"
              className="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance text-ink-950"
            >
              Support that makes a <span className="text-gold-700">difference</span>, not a
              referral.
            </h2>

            <p className="mt-6 max-w-xl text-base leading-7 text-muted">
              {ORG.name} works with refugees, asylum seekers and migrants in {ORG.city}. Most
              people arrive because of a document, and stay for everything a document unlocks —
              a school place, a formal job, a bank account.
            </p>

            <MissionTabs tabs={TABS} className="mt-9" />

            {/* --- the dials and the money rail --------------------------------------- */}
            <div className="mt-10 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="flex flex-wrap gap-8">
                {DIALS.map((dial) => (
                  <Dial key={dial.id} value={dial.value} label={dial.label} />
                ))}
              </div>

              <dl className="divide-y divide-line rounded-2xl border border-line">
                {MONEY.map(({ id, Icon, label, cents }) => (
                  <div key={id} className="px-8 py-6 text-center">
                    {/* Brand blue, not gold. A 1.5px stroke in gold-600 measures 2.6:1 on
                        white — legible as a smudge and not much else — and it would be the
                        only gold glyph on a light ground anywhere on this site. */}
                    <Icon
                      className="mx-auto size-7 text-brand-500"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <dt className="mt-3 text-sm font-bold text-ink-950">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-brand-600 tabular-nums">
                      {formatRandsWhole(cents)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/*
 * One dial. An SVG ring rather than a conic-gradient div, because a ring drawn as a stroke can
 * carry a real accessible name and a rounded cap, and because `stroke-dasharray` on a known
 * circumference is exact where a gradient stop is eyeballed.
 *
 * role="img" with the label already spoken: a screen reader gets "78 percent, cases closed
 * within 90 days" and never sees the geometry.
 */
function Dial({ value, label }: { value: number; label: string }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div role="img" aria-label={`${value} percent: ${label}`} className="relative shrink-0">
        {/* -rotate-90 puts 0% at twelve o'clock. An SVG arc starts at three o'clock, which
            reads as a dial that has already been running for a quarter turn. */}
        <svg viewBox="0 0 72 72" className="size-[4.5rem] -rotate-90" aria-hidden="true">
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            strokeWidth="7"
            className="stroke-ink-200"
          />
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className="stroke-brand-500"
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center text-sm font-extrabold text-ink-950 tabular-nums"
        >
          {value}%
        </span>
      </div>

      <p aria-hidden="true" className="max-w-32 text-sm leading-5 text-muted">
        {label}
      </p>
    </div>
  );
}

export default Mission;
