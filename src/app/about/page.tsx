import type { Metadata } from 'next';
import Link from 'next/link';
import { DoorOpen, ImageIcon, Languages, MapPin, Phone, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { Impact } from '@/components/site/Impact';
import { Partners } from '@/components/site/Partners';
import { Reveal } from '@/components/ui/reveal';
import { PILLAR_LABELS, PROGRAMME_PILLARS } from '@/types/enums';
import { PROGRAMMES } from '@/lib/programmes';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  /*
   * "About us", not "About us — NWHR". The root layout's template is `%s · NWHR`, so the
   * organisation's name is appended already and spelling it out here renders "About us —
   * NWHR · NWHR" in the tab and in every search result. The other marketing pages do carry
   * the doubled form; they are wrong in the same way and worth a separate pass.
   */
  title: 'About us',
  description: `Who ${ORG.name} is: an office in ${ORG.city} serving refugees, asylum seekers and migrants. Walk in without an appointment, in four languages, and nothing is recorded without your permission.`,
};

/*
 * `/about` — the sixth marketing route to resolve.
 *
 * SiteNav has carried "About us" since the header was built and it has been pointing at a 404
 * the whole time, exactly as `/get-help` and `/services` were before them.
 *
 * WHAT THIS PAGE MAY AND MAY NOT SAY. An about page is where a charity site invents things:
 * a founding year, a headcount, a founder's quotation, "over 12 000 lives changed". Not one
 * of those is knowable from this repository, and a funder checks them harder than anything
 * else on the site. So every factual claim below traces to something already asserted and
 * enforced elsewhere in the system:
 *
 *   the mission and the city          lib/site.ts
 *   the five pillars                  types/enums.ts, validated by the server on every record
 *   walk in, no appointment           the same four assurances /get-help opens with
 *   no documents needed to be seen    the register accepts a person with no permit number
 *   four languages                    guide.content.js, which the assistant answers from
 *   nothing stored without consent    enforced before any personal detail is written
 *   the address and the phone number  lib/site.ts, confirmed
 *
 * There is no history section, no leadership section and no impact headcount, because there
 * is nothing true to put in them yet. An empty band is recoverable; a fabricated one is not.
 *
 * THREE OF THE SIX BANDS WERE ALREADY BUILT AND PARKED. Impact and Partners have been sitting
 * unimported since the home page was trimmed — src/app/page.tsx says as much and invites
 * exactly this. Both were written with their own arguments about what may be claimed, and
 * reusing them is how the About page inherits those arguments rather than restating them.
 *
 * EVERY PHOTOGRAPH IS A RESERVED FRAME. `src: null` on the banner and the dashed frames below
 * hold the exact space a picture will occupy, labelled with what belongs there, so dropping
 * files in later moves nothing on the page. Faces on a page carrying the words "refugee" and
 * "asylum seeker" are a consent question before they are a layout one — see the note in
 * Mission.tsx about why the only images on this site are illustrative.
 */

/* --- the office's four standing promises ------------------------------------------------
 *
 * The same four /get-help opens with, in the same order and the same words. They are the
 * things a person frightened of officialdom needs to hear before anything else, and repeating
 * them here is not duplication: this is the page somebody reads BEFORE deciding to come in.
 */
const PROMISES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: DoorOpen,
    title: 'Walk in — no appointment',
    body: 'The office is open to anyone who arrives. You do not need to be referred, and you do not need to have phoned first.',
  },
  {
    icon: ShieldCheck,
    title: 'No documents needed to be seen',
    body: 'An expired permit, a lost file or no papers at all does not stop you being helped. Bringing what you have makes some things faster; bringing nothing is not a reason to stay away.',
  },
  {
    icon: Languages,
    title: 'Four languages',
    body: 'You can be helped in English, French, Swahili or Portuguese, and asked which one you prefer before anything else is asked.',
  },
  {
    icon: ShieldCheck,
    title: 'Nothing recorded without your permission',
    body: 'You are asked before any detail about you is written down, and told what it is for. Saying no does not stop you being helped today.',
  },
];

export default function AboutPage() {
  return (
    <>
      <SiteNav />

      <main id="main">
        <PageBanner
          eyebrow="About us"
          title={
            <>
              A door in Rustenburg that opens{' '}
              <span className="text-gold-400">without papers</span>
            </>
          }
          lead={ORG.tagline}
          image={{
            src: null,
            alt: `The ${ORG.shortName} office in ${ORG.city}`,
            brief: 'Wide photograph — the office frontage or the reception area',
          }}
          breadcrumb={[{ label: 'Home', href: PATHS.home }]}
        />

        {/* --- who we are ---------------------------------------------------------------- */}
        <section aria-labelledby="who-heading" className="bg-white font-(family-name:--font-ui)">
          <div className="mx-auto grid max-w-[80rem] items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-32">
            {/*
              * The picture composition, reserved. Two frames rather than one, overlapping, as
              * on the reference — a wide establishing shot with a closer one set into its
              * lower corner. Both are labelled with what belongs in them, and both keep their
              * space, so the section does not reflow when the photographs arrive.
              */}
            <Reveal>
              <div className="relative">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
                  <ReservedFrame brief="Wide photograph — the reception desk on an ordinary morning" />
                </div>

                <div className="relative -mt-16 ml-auto hidden aspect-square w-2/5 overflow-hidden rounded-2xl border-4 border-white sm:block">
                  <ReservedFrame brief="Closer photograph — a caseworker and a client at the desk" />
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div>
                <p className="flex items-center gap-4 text-sm leading-5 font-semibold tracking-[0.05em] text-muted uppercase">
                  <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                  Who we are
                </p>

                <h2
                  id="who-heading"
                  className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-[1.17] font-bold tracking-[-0.02em] text-balance text-body"
                >
                  {ORG.name}, in {ORG.city}.
                </h2>

                <p className="mt-6 text-base leading-7 text-muted">
                  We work with refugees, asylum seekers and migrants living in and around
                  Rustenburg. Some people come to us about a permit that is about to run out.
                  Some come because a child has nowhere to go to school, or because there is no
                  food this week, or because they have been turned away somewhere they had every
                  right to be.
                </p>

                <p className="mt-4 text-base leading-7 text-muted">
                  {/* The tagline is the organisation's own, from lib/site.ts. Quoting it is
                      the one place on this page a phrase is allowed to be a slogan. */}
                  Our mission is three words long — <strong className="font-semibold text-body">
                    {ORG.tagline}
                  </strong>{' '}
                  — and the work behind them is ordinary and specific: sitting with somebody
                  while they fill in a form, going with them to Home Affairs, finding the school
                  place, making the referral, and keeping a record so the next person they speak
                  to does not start from nothing.
                </p>

                {/* Address and phone, because an about page for a walk-in service that does not
                    say where the door is has missed its own point. */}
                <dl className="mt-8 flex flex-col gap-4">
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                    <div>
                      <dt className="text-sm font-semibold text-body">Where to find us</dt>
                      <dd className="mt-1 text-base leading-6 text-muted">
                        {ORG.address}
                        <span className="block text-sm text-subtle">{ORG.addressHint}</span>
                      </dd>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Phone className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                    <div>
                      <dt className="text-sm font-semibold text-body">Phone</dt>
                      <dd className="mt-1 text-base leading-6">
                        {/* Displayed locally, dialled internationally — see lib/site.ts. */}
                        <a
                          href={ORG.phoneHref}
                          className="font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700"
                        >
                          {ORG.phone}
                        </a>
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --- how we work: the dark band ------------------------------------------------ */}
        <section
          aria-labelledby="promises-heading"
          className="bg-ink-950 font-(family-name:--font-ui)"
        >
          <div className="mx-auto grid max-w-[80rem] items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-32">
            <div>
              {/* Gold is legible here and almost nowhere else: 14.9:1 on this near-black
                  ground, 1.37:1 on the white sections above and below. */}
              <p className="flex items-center gap-4 text-sm leading-5 font-semibold tracking-[0.05em] text-gold-400 uppercase">
                <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                How we work
              </p>

              <h2
                id="promises-heading"
                className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-[1.17] font-bold tracking-[-0.02em] text-balance text-white"
              >
                Four things that are true{' '}
                <span className="text-gold-400">before you tell us anything</span>.
              </h2>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/80">
                These are not a promise about how we hope to behave. Each one is built into how
                the office runs and into the system that holds the records, which is why we can
                print them on a page rather than say them at a desk.
              </p>

              <ul className="mt-10 flex flex-col gap-8">
                {PROMISES.map((promise, index) => (
                  <li key={promise.title}>
                    <Reveal delay={index * 100}>
                      <div className="flex gap-4">
                        <span
                          aria-hidden="true"
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-gold-400 ring-1 ring-white/15 ring-inset"
                        >
                          <promise.icon className="size-5" strokeWidth={1.75} />
                        </span>
                        <div>
                          <h3 className="text-lg leading-6 font-bold tracking-[-0.01em] text-white">
                            {promise.title}
                          </h3>
                          <p className="mt-2 text-base leading-6 text-white/75">{promise.body}</p>
                        </div>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>

            {/* The reference hangs a cut-out photograph of the team down this side. Reserved,
                and tall, because the shape is what the composition depends on. */}
            <Reveal delay={150} className="hidden lg:block">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
                <ReservedFrame
                  dark
                  brief="Tall photograph — the team, or the office in use, cut out against the dark"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* --- the five pillars ---------------------------------------------------------- */}
        <section aria-labelledby="pillars-heading" className="bg-white font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
            <div className="max-w-3xl">
              <p className="flex items-center gap-4 text-sm leading-5 font-semibold tracking-[0.05em] text-muted uppercase">
                <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
                What the work is
              </p>

              <h2
                id="pillars-heading"
                className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-[1.17] font-bold tracking-[-0.02em] text-balance text-body"
              >
                Five pillars, and every programme sits under one of them.
              </h2>

              <p className="mt-6 text-base leading-7 text-muted">
                They are not a way of describing the work after the fact. Every programme, every
                case and every enrolment on record names one of them, so what you read here is
                the same list the organisation is answerable to.
              </p>
            </div>

            {/*
              * NOT NUMBERED 01–05, though the reference numbers its list and the pattern is
              * everywhere. A numeral is a claim that order matters, and these five are
              * categories — nobody works through them, and putting documentation at 01 and
              * women and youth at 05 states a priority the organisation has not set.
              *
              * What each card carries instead is what is actually under that pillar, read
              * from lib/programmes.ts. It is more useful than a numeral, and it cannot drift
              * from the programmes page: both render the same array.
              */}
            <ul className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {PROGRAMME_PILLARS.map((pillar, index) => (
                <li key={pillar}>
                  <Reveal delay={index * 80}>
                    <div className="flex h-full flex-col border-t-2 border-line pt-6">
                      <h3 className="text-xl leading-7 font-bold tracking-[-0.01em] text-balance text-body">
                        {PILLAR_LABELS[pillar]}
                      </h3>
                      <span aria-hidden="true" className="mt-4 h-0.5 w-10 rounded-full bg-gold-400" />

                      <ul className="mt-5 flex flex-col gap-2">
                        {PROGRAMMES.filter((programme) => programme.pillar === pillar).map(
                          (programme) => (
                            <li
                              key={programme.id}
                              className="flex gap-2.5 text-base leading-6 text-muted"
                            >
                              <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                              {programme.title}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </Reveal>
                </li>
              ))}

              {/* The sixth cell is the way through to the detail, rather than a sixth pillar.
                  A grid of five in a three-column layout leaves a hole; this fills it with the
                  one thing a reader of this list actually wants next. */}
              <li>
                <Reveal delay={400}>
                  <Link
                    href={PATHS.programmes}
                    className="flex h-full flex-col justify-between rounded-2xl bg-brand-50 p-6 transition-colors hover:bg-brand-100"
                  >
                    <span className="text-base leading-6 font-semibold text-brand-800">
                      What each pillar actually runs, programme by programme
                    </span>
                    <span className="mt-6 text-sm font-bold tracking-[0.05em] text-brand-700 uppercase">
                      See the programmes →
                    </span>
                  </Link>
                </Reveal>
              </li>
            </ul>
          </div>
        </section>

        {/*
          * Both of these were built, argued in their own headers, and then left unimported
          * when the home page was trimmed. Impact counts three things that are true and
          * checkable rather than a headcount nobody has measured; Partners holds one partner
          * because one is what has agreed to appear.
          */}
        <Impact />
        <Partners />

        {/* --- the way in ---------------------------------------------------------------- */}
        <section aria-labelledby="cta-heading" className="bg-ink-950 font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 text-center lg:px-8 lg:py-24">
            <h2
              id="cta-heading"
              className="mx-auto max-w-3xl text-[clamp(1.75rem,4.5vw,2.75rem)] leading-[1.2] font-bold tracking-[-0.02em] text-balance text-white"
            >
              If you need help, you do not need to read any further.
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-pretty text-white/80">
              Come to the office, or phone. Nobody is turned away for arriving without an
              appointment, without papers, or without knowing what to ask for.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={PATHS.getHelp}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold-400 px-8 text-sm font-bold tracking-[0.05em] text-ink-950 uppercase transition-colors hover:bg-gold-500 sm:w-auto"
              >
                Get help
              </Link>
              <a
                href={ORG.phoneHref}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/70 px-8 text-sm font-bold tracking-[0.05em] text-white uppercase transition-colors hover:bg-white/15 sm:w-auto"
              >
                <Phone className="size-4" aria-hidden="true" />
                {ORG.phone}
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ChatGuide />
    </>
  );
}

/**
 * The space a photograph will occupy, labelled with what belongs in it.
 *
 * The same device the banner and the services page use: a dashed frame at the picture's real
 * proportions, so the page is laid out for the photograph before the photograph exists and
 * nothing moves when it arrives. `aria-hidden`, because an empty frame is not information a
 * screen reader needs — the section around it already says what the section is about.
 */
function ReservedFrame({ brief, dark = false }: { brief: string; dark?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`grid h-full place-items-center border-2 border-dashed p-6 text-center ${
        dark ? 'border-white/20' : 'border-line-strong'
      }`}
    >
      <span>
        <ImageIcon
          className={`mx-auto size-8 ${dark ? 'text-white/30' : 'text-line-strong'}`}
          strokeWidth={1.5}
        />
        <span
          className={`mt-3 block text-sm font-semibold ${dark ? 'text-white/40' : 'text-subtle'}`}
        >
          {brief}
        </span>
      </span>
    </div>
  );
}
