import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpRight,
  Check,
  FileText,
  Footprints,
  ImageIcon,
  Phone,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { ORG } from '@/lib/site';
import { PATHS } from '@/lib/paths';

/*
 * "How NWHR Helps" — src/Design/Design.md §16, slot four.
 *
 * BUILT TO A SUPPLIED REFERENCE: picture composition left, argument right — headline with one
 * accent word, a lead, two icon features, six ticked commitments in two columns, then an
 * action. The structure is the reference's. Three things in it are deliberately not.
 *
 * NO NAMED PERSON. The reference closes with a portrait, a name and a job title. A named face
 * endorsing a refugee charity has to be a real person who agreed in writing to appear next to
 * the words "refugee" and "asylum seeker" — that is a consent question, not a layout one. The
 * slot is a phone number instead, which is the thing a reader in trouble actually wants there
 * and which §69 asks for anyway: a way to reach a human.
 *
 * NO LOREM. Every line below is a control that exists in `src/server/`. Consent really is
 * captured before anything is stored, permit numbers really are encrypted at rest and never
 * printed in a report, and a minor really cannot be registered without a recorded guardian.
 * A promise on a public page that no code enforces is the kind a funder checks.
 *
 * THE ACCENT WORD IS gold-700, NOT THE LOGO'S YELLOW. gold-400 on white measures 1.37:1 and
 * cannot be type at all. gold-700 is 4.50:1, which clears AA. Everywhere else on this light
 * ground the logo's yellow is a rule or a fill and never a glyph — that constraint is why the
 * eyebrow is a gold bar rather than gold words.
 *
 * WITH NO PHOTOGRAPH IT IS ONE COLUMN, NOT A COLUMN AND A HOLE. `PORTRAIT` is null until real
 * pictures exist, and the section collapses to a single centred measure that reads as finished
 * rather than as a layout missing its left half. That is the test a placeholder has to pass
 * before it earns a slot — an earlier build of this same reference shipped an empty circle,
 * which rendered as a blank disc and taught the reader nothing.
 */

interface Slot {
  /** A path under /public/images, or null to render the section without a photograph. */
  src: string | null;
  alt: string;
}

/*
 * Both null by design — see the image briefs at the foot of this file. The tall frame is the
 * scene; the circle is the detail inside it. They are a pair and should be shot as one, which
 * is why supplying only one of them still renders the single-column form.
 */
const PORTRAIT: Slot = {
  src: '/images/about-office.jpg',
  alt: 'Two women sitting side by side at an office desk over an open folder of papers. One takes notes with a pen; the other is speaking and gesturing towards the page.',
};
/*
 * Decorative, so the alt is deliberately empty and the wrapper is aria-hidden. It is a
 * second view of what the frame beside it already shows — a screen reader that announces
 * both gets the same scene described twice, and the first description is the better one.
 */
const INSET: Slot = { src: '/images/about-detail.jpg', alt: '' };

/*
 * The two stages, labelled by WHEN rather than numbered 01/02. The sequence is real — one
 * happens at the first appointment, one happens for as long afterwards as it takes — and
 * naming the moments carries that, where a pair of digits would only assert it. The second
 * label is the organisation's actual difference from a referral service, so it does the work
 * a heading would otherwise have to.
 */
const STAGES = [
  {
    when: 'First visit',
    title: 'Come in with what you have',
    body: 'A caseworker works out what is missing and what happens next. No appointment, and no documents required to be seen.',
    Icon: FileText,
  },
  {
    when: 'Every visit after',
    title: 'We go with you',
    body: 'To Home Affairs and to the school — not a referral and good luck. The same caseworker stays on your file.',
    Icon: Footprints,
  },
];

/*
 * The reference's six ticks. Ordered so the two that answer "is it safe to tell you anything"
 * come first — for this reader that question precedes every other one on the page, and a
 * commitment about legal referrals means nothing to somebody still deciding whether to give
 * their name.
 */
const COMMITMENTS = [
  'Consent before anything is stored',
  'Permit numbers encrypted at rest',
  'Documents shared by private link only',
  'English · Français · Kiswahili · Português',
  'Referral to attorneys, at no cost',
  'Under 18 only with a recorded guardian',
];

export function About() {
  return (
    <section aria-labelledby="about-heading" className="bg-white font-(family-name:--font-ui)">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-20">
          {/* --- the picture ------------------------------------------------------------
           *
           * THE SPACE IS HELD WHETHER OR NOT THE PHOTOGRAPHS EXIST. The frame keeps its 3:4
           * box and the circle keeps its diameter and offset, so dropping the two files in
           * moves nothing — the layout that ships is the layout being reviewed now, and the
           * page scores no cumulative layout shift when the images arrive.
           *
           * The circle overlaps the frame's lower-right corner and is ringed in the page's
           * own white, so it reads as lifted off the photograph rather than cut into it.
           *
           * The empty state is a labelled reservation, NOT a blank disc: an earlier build of
           * this reference shipped an unfilled circle with nothing in it, which read as a
           * decorative blob. Naming the file that belongs here makes it obviously scaffolding
           * — and obviously not finished, which is the honest signal while it is not.
           */}
          <Reveal>
            <div className="relative" aria-hidden={PORTRAIT.src ? undefined : true}>
              <div className="relative aspect-3/4 overflow-hidden rounded-3xl">
                {PORTRAIT.src ? (
                  <Image
                    src={PORTRAIT.src}
                    alt={PORTRAIT.alt}
                    fill
                    sizes="(min-width: 1024px) 42vw, 100vw"
                    className="object-cover object-center"
                  />
                ) : (
                  <div className="grid h-full place-items-center border-2 border-dashed border-line-strong bg-brand-50 p-6 text-center">
                    <span>
                      <ImageIcon
                        className="mx-auto size-8 text-line-strong"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <span className="mt-3 block text-sm font-semibold text-subtle">
                        /images/about-office.jpg
                      </span>
                      <span className="mt-1 block text-sm text-subtle">Portrait 3:4</span>
                    </span>
                  </div>
                )}
              </div>

              <div
                aria-hidden={INSET.src ? true : undefined}
                className="absolute -right-4 bottom-8 size-40 overflow-hidden rounded-full border-8 border-white sm:size-52 lg:-right-10"
              >
                {INSET.src ? (
                  <Image
                    src={INSET.src}
                    alt={INSET.alt}
                    fill
                    sizes="13rem"
                    className="object-cover object-center"
                  />
                ) : (
                  /* aria-hidden: the frame behind it now carries a real alt, so this
                     reservation is the only thing left that a screen reader would read out,
                     and "square detail" is scaffolding rather than content. */
                  <div
                    aria-hidden="true"
                    className="grid h-full place-items-center border-2 border-dashed border-line-strong bg-gold-50 p-4 text-center"
                  >
                    <span className="text-sm font-semibold text-subtle">Square detail</span>
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          {/* --- the argument ----------------------------------------------------------- */}
          <div>
            <p className="flex items-center gap-3 text-sm font-semibold tracking-[0.05em] text-muted uppercase">
              {/* Gold as a rule, which is the only thing it can be on white. */}
              <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
              Who we are
            </p>

            {/* §5's section heading step, 28–40px, and no larger. */}
            <h2
              id="about-heading"
              className="mt-5 text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.14] font-extrabold tracking-[-0.02em] text-balance text-body"
            >
              Help that starts with <span className="text-gold-700">papers</span> and does not
              stop there.
            </h2>

            <p className="mt-6 max-w-xl text-base leading-7 text-muted">
              A permit is what a school place, a formal job and most support depend on. We start
              there, then stay with the same person through everything that follows.
            </p>

            {/* --- two stages, the reference's paired features --------------------------- */}
            <ol className="mt-10 grid gap-8 sm:grid-cols-2">
              {STAGES.map((stage, index) => (
                <Reveal key={stage.title} delay={index * 90}>
                  <li>
                    {/*
                     * The icon sits in brand blue on its own tint rather than in gold. At
                     * 40px it is a fill, not a rule, and the logo's yellow behind a
                     * dark glyph at that size is the one place this palette reliably fails.
                     */}
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-500">
                      <stage.Icon className="size-5" strokeWidth={2} aria-hidden="true" />
                    </span>

                    <h3 className="mt-4 text-xl font-extrabold tracking-[-0.02em] text-body">
                      {stage.title}
                    </h3>
                    <p className="mt-1 text-sm font-semibold tracking-[0.05em] text-subtle uppercase">
                      {stage.when}
                    </p>
                    <p className="mt-2.5 text-base leading-7 text-muted">{stage.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>

            {/* --- six ticks -------------------------------------------------------------
             *
             * A list, not six paragraphs: these are checkable facts about the system and
             * they are read by scanning. The tick is aria-hidden — the <ul> already tells a
             * screen reader this is a list of six things, and "check mark, consent before
             * anything is stored" six times over is worse than the sentence alone.
             */}
            <ul className="mt-10 grid gap-x-8 gap-y-4 border-t border-line pt-8 sm:grid-cols-2">
              {COMMITMENTS.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-500 text-white"
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="text-base leading-6 text-body">{item}</span>
                </li>
              ))}
            </ul>

            {/* --- action ----------------------------------------------------------------
             *
             * Where the reference puts a named portrait. The number is the honest occupant of
             * that slot: it is the one thing on this section a person in trouble might use
             * today, and it is real — unlike a face, it needs nobody's written permission to
             * appear beside the word "refugee".
             */}
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                href={PATHS.about}
                className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-gold-400 px-7 text-sm font-semibold tracking-wider text-ink-950 uppercase transition-colors hover:bg-gold-500"
              >
                More about us
                <ArrowUpRight
                  className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>

              <a
                href={ORG.phoneHref}
                className="group inline-flex items-center gap-3 transition-colors hover:text-body"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-500">
                  <Phone className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-subtle">Talk to a person</span>
                  <span className="block font-bold text-body">{ORG.phone}</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------------------
 * IMAGE BRIEFS — the two slots above, per §Image Assets. Both go in /public/images.
 * Shoot or licence them as a pair: the circle is a detail from the same room and the same
 * afternoon as the frame, and it reads as decoration the moment it is visibly a stock photo
 * of somewhere else.
 *
 * /images/about-office.jpg — portrait 3:4, min 1600px wide
 *
 *   Documentary photograph, vertical 3:4. A caseworker and a woman in her thirties at a desk
 *   in a small NGO office in Rustenburg, South Africa, mid-conversation over an open folder.
 *   Neither looks at the camera. Natural window light from the left, ordinary room — filing
 *   boxes, a wall calendar, a kettle. Warm, unhurried, competent. 35mm, eye level, natural
 *   colour.
 *
 *   Avoid: eye contact with the camera; cupped or outstretched hands; tears or pleading; a
 *   child as the subject; legible names or numbers on the paperwork; NGO or UN branding on
 *   lanyards, folders or walls; heavy grading.
 *
 * /images/about-detail.jpg — square, min 800px
 *
 *   Documentary photograph, square, framed to survive a circular crop — keep the subject
 *   centred and clear of the corners. A detail from the same room: two pairs of hands over a
 *   form, one indicating a line, or a caseworker's hands passing a folder across a desk. No
 *   faces, or one face partially in frame at the edge. Same light and same colour as the
 *   frame above.
 *
 *   Avoid: legible personal data, real permit or ID numbers, posed handshakes, stock gloss.
 *
 * TWO RULES ACROSS BOTH, from §15 and §70: no exploitative imagery, and no identifiable
 * person without written permission on file. If these are generated rather than licensed,
 * check hands and any text in frame — both are still unreliable.
 * ---------------------------------------------------------------------------------------
 */

export default About;
