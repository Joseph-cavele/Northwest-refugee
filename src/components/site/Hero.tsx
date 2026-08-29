import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Bot, HandHeart, Heart, HeartHandshake } from 'lucide-react';
import { CountUp } from '@/components/ui/count-up';
import { PATHS } from '@/lib/paths';

/*
 * The homepage hero.
 *
 * TWO DIVERGENCES FROM src/Design/Design.md §15, both from an explicit later brief:
 *
 *   Headline    §15 sets "Helping Refugees Build Safer, Stronger Futures". The brief sets
 *               "Help. Hope. A New Beginning." Three sentence fragments read faster and
 *               warmer, which is the register asked for; the document's version is more
 *               descriptive. Restoring §15's is one string.
 *   Second CTA  §15 pairs Get Help with Explore Services; the brief pairs it with Donate.
 *               §14's rule survives either way — Get Help stays primary — but note that
 *               Donate points the second-most prominent control on the page at the donor
 *               audience rather than the beneficiary one.
 *
 * Everything else follows the document: §5's type scale, §6's 1280px measure with 1rem and
 * 2rem margins, §45's touch targets, and §3's "no glassmorphism, no excessive animation" —
 * nothing on this band moves and it ships no client JavaScript.
 *
 * THE PICTURE IS SHOT ON PURE WHITE, which is why it has no panel and no rounded frame.
 * Sampled, its surround is #FFFFFF to the corners, so the figures are effectively a cut-out;
 * boxing that inside a grey rounded card would render a white rectangle inside a grey one.
 * The gradient behind the band is sized to fade out before it reaches the picture for the
 * same reason — colour under a white-backed photograph frames it in a visible box.
 */

const HERO_IMAGE: string | null = '/images/hero-refugee.jpg';

/** What the picture shows. Read aloud, so never "hero image". */
const HERO_ALT =
  'A caseworker and a woman seated across a desk, looking at an open folder of documents together.';

/*
 * The floating cards. Rounded, softly shadowed, and deliberately few — §3 lists "Huge
 * numbers of cards" under Avoid, so each carries one line and nothing else.
 *
 * All three destinations 404 today, like every other marketing route.
 */
const CARDS = [
  {
    Icon: HandHeart,
    title: 'Need help?',
    note: 'Start with your papers',
    href: PATHS.getHelp,
    tint: 'bg-brand-500 text-white',
    place: 'lg:absolute lg:top-[8%] lg:-left-6 xl:-left-10',
  },
  {
    /*
     * The assistant is real and running: the widget in the corner of every page is wired to
     * /api/v1/guide, which routes free text through Gemini onto NWHR's own written answers.
     * "Ask in four languages" is checkable in guide.content.js rather than a claim.
     *
     * It links to /get-help rather than opening the widget. The widget owns its own state and
     * this band is a server component with none — reaching across would turn the whole hero
     * into client-rendered markup to save one click, and the widget is already on screen.
     */
    Icon: Bot,
    title: 'AI assistant',
    note: 'Ask in four languages',
    href: PATHS.getHelp,
    tint: 'bg-ink-950 text-gold-400',
    place: 'lg:absolute lg:top-[2%] lg:right-0 xl:-right-4',
  },
  {
    Icon: HeartHandshake,
    title: 'Donate & support',
    note: 'Fund permits and school places',
    href: PATHS.donate,
    tint: 'bg-gold-400 text-ink-950',
    place: 'lg:absolute lg:right-0 lg:bottom-[22%] xl:-right-4',
  },
];

/*
 * "Our volunteers" was the fourth card and came off. Four cards around one photograph is what
 * §3 means by "Huge numbers of cards", and volunteering is a donor-side action that already
 * has a home further down the page — whereas the three that remain are all first-contact
 * routes for somebody who arrived needing something. It is the one to restore if a fourth is
 * ever wanted: Users icon, /contact, "Intake days and tutoring".
 */

/*
 * THESE FIGURES ARE UNVERIFIED AND ONE OF THEM IS ALMOST CERTAINLY WRONG.
 *
 * They were supplied as copy and are rendered as supplied. Before this goes anywhere near a
 * real visitor, note that South Africa hosts roughly 250 000 refugees and asylum seekers in
 * total — so "500K+ refugees helped" by one Rustenburg organisation is not a large number,
 * it is a number larger than the national population it draws from. A funder or a journalist
 * checks that line first, and it is the sort of error that makes every other figure on the
 * page look invented too.
 *
 * The reports module already computes real totals. Wiring this to it, or cutting the row to
 * the figures that can be evidenced, are both better than publishing these.
 */
const STATS = [
  { value: '500K+', label: 'Refugees helped' },
  { value: '100K+', label: 'Counselling sessions' },
  { value: '850K+', label: 'Food parcels shared' },
  { value: '35+', label: 'Professional team' },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-white font-(family-name:--font-ui)">
      {/*
       * A warm neutral wash behind the type, anchored top-left and gone by 70%. It has to
       * fade out before the photograph: that picture is on pure white with no alpha, so it
       * only merges with the band while the band underneath it is white too.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(42rem_30rem_at_0%_0%,var(--color-brand-50),transparent_70%)]"
      />

      <div className="mx-auto max-w-[80rem] px-4 py-14 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
          {/* --- the words ------------------------------------------------------------ */}
          <div>
            <h1 className="text-[clamp(2.25rem,5vw,4rem)] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance text-body">
              Help. Hope. A New Beginning.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
              Supporting refugees and vulnerable communities with essential services,
              professional assistance and a pathway toward a more secure future.
            </p>

            {/*
             * §14 keeps Get Help primary — it takes the gold fill at 14.9:1 against
             * near-black, and Donate takes the outline. Both clear §45's 44px touch minimum
             * at 52px.
             */}
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href={PATHS.getHelp}
                className="group inline-flex min-h-13 items-center gap-2 rounded-full bg-gold-400 px-8 text-sm font-semibold tracking-wider text-ink-950 uppercase transition-colors hover:bg-gold-500"
              >
                Get Help
                <ArrowRight
                  className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>

              <Link
                href={PATHS.donate}
                className="group inline-flex min-h-13 items-center gap-2 rounded-full border border-line-strong px-8 text-sm font-semibold tracking-wider text-body uppercase transition-colors hover:border-ink-900"
              >
                Donate Now
                {/*
                 * A filled heart instead of Get Help's arrow. The arrow means "onward" and
                 * says nothing about which of the two buttons you want; the heart names the
                 * act, and breaking the symmetry is the point — two identical buttons with
                 * two identical arrows make the reader parse the words to tell them apart.
                 *
                 * `fill-current` matters: an outline heart at 16px reads as a smudge on a
                 * phone, and this is the icon carrying the button's meaning.
                 */}
                <Heart
                  className="size-4 shrink-0 fill-current transition-transform group-hover:scale-110"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>

          {/* --- the picture and its cards --------------------------------------------- */}
          <div className="relative">
            {HERO_IMAGE && (
              <Image
                src={HERO_IMAGE}
                alt={HERO_ALT}
                width={1024}
                height={572}
                sizes="(min-width: 1024px) 55vw, 100vw"
                priority
                className="h-auto w-full brightness-110"
              />
            )}

            {/*
             * STACKED BELOW ON A PHONE, FLOATING FROM lg. Absolute positioning starts at the
             * same breakpoint as the two-column grid, so the cards only leave the flow once
             * there is a picture beside them to float over rather than on top of.
             */}
            <ul className="mt-6 flex flex-col gap-3 lg:mt-0 lg:block">
              {CARDS.map((card) => (
                <li key={card.title} className={card.place}>
                  <Link
                    href={card.href}
                    className="group flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_24px_50px_rgba(0,0,0,0.12)] lg:min-h-0 lg:w-56 lg:gap-2.5 lg:p-2.5"
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl lg:size-8 lg:rounded-lg ${card.tint}`}
                    >
                      <card.Icon className="size-5 lg:size-4" aria-hidden="true" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-body">{card.title}</span>
                      <span className="block truncate text-xs text-subtle">{card.note}</span>
                    </span>

                    <ArrowRight
                      className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 lg:size-3.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/*
         * --- the figures ---------------------------------------------------------
         *
         * `tabular-nums` so the four line up on their digits rather than drifting, and the
         * dividers are borders rather than characters so they disappear cleanly when the row
         * wraps to two columns on a phone.
         *
         * See the note on STATS: one of these numbers is larger than South Africa's entire
         * refugee population and should not ship as written.
         */}
        <ul className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-line pt-10 sm:gap-x-10 lg:mt-20 lg:grid-cols-4">
          {STATS.map((stat, index) => (
            <li
              key={stat.label}
              className={
                index > 0
                  ? 'sm:border-l sm:border-line sm:ps-6 lg:ps-10 odd:border-l-0 odd:ps-0 lg:odd:border-l lg:odd:ps-10'
                  : ''
              }
            >
              {/*
               * `tabular-nums` matters more here than usual: without it the digits change
               * width as the count runs and the label underneath jitters left and right for
               * the whole animation.
               */}
              <p className="text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-extrabold tracking-[-0.02em] text-brand-500 tabular-nums">
                <CountUp value={stat.value} />
              </p>
              <p className="mt-2 text-sm text-muted">{stat.label}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default Hero;
