import { Reveal } from '@/components/ui/reveal';

/*
 * What happens when somebody comes in — four steps, in order.
 *
 * BUILT TO DESIGN.md's TYPE SCALE, ROLE BY ROLE, rather than to whatever size looked right:
 *
 *   headline-xl   48px / 56px / 700 / -0.02em   the section heading, and the step numerals
 *   headline-lg   32px / 40px / 700 / -0.02em   each step's title
 *   body-md       16px / 24px / 400             the step copy
 *   label-md      14px / 600 / 0.05em / caps    the eyebrow
 *
 * The previous version broke three of those. Step copy was 14px — which is label-md, a size
 * for metadata, used for the sentences a reader is actually meant to read. Titles were 18px,
 * which is body-lg: body text pretending to be a heading. And the section padding was 96px,
 * a value the spacing rhythm does not contain.
 *
 * SPACING IS THE 8px SCALE, with 32 / 64 / 128 reserved for the gaps between components, as
 * the document sets out. So: 64px section padding on mobile and 128px on desktop, 64px
 * between the heading block and the steps, and multiples of 8 inside a step. Nothing lands
 * on 20px or 10px any more, which is where the old version drifted.
 *
 * EVERY LINE OF COPY IS FROM guide.content.js, the script the organisation already maintains
 * and the help widget already serves. That includes the two sentences that matter most and
 * that no marketing copywriter would have written:
 *
 *   "If you have none, come anyway — that is a common reason people come to us." Somebody
 *   with no papers at all is the most likely person to decide this office is not for them.
 *
 *   "We cannot decide your application. That is Home Affairs." A page that implies otherwise
 *   sets somebody up to arrive expecting a decision and blame the wrong people when it does
 *   not come.
 *
 * THE NUMBERING IS EARNED, which is worth saying because numbered markers are the most
 * over-used device in this kind of layout. This is a genuine sequence — nobody is gone with
 * to Home Affairs before a caseworker has seen what they have — so the order carries
 * information. It is an <ol> for the same reason: a screen reader should announce a sequence,
 * not four unrelated cards.
 */

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'Come in',
    body: 'Bring whatever documents you already have. If you have none, come anyway — that is a common reason people come to us.',
  },
  {
    title: 'We check what is missing',
    body: 'A caseworker goes through what you have, and what each next step will ask for.',
  },
  {
    title: 'We prepare it with you',
    body: 'We cannot decide your application — that is Home Affairs. We can help you prepare it, and go with you.',
  },
  {
    title: 'Then everything after',
    body: 'School places for children, training, and support when something goes wrong. The same caseworker, not a new queue.',
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="bg-white font-(family-name:--font-ui)">
      {/* 1280px container; 20px mobile and 64px desktop margins; 64px / 128px band. */}
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <div className="max-w-3xl">
          {/* label-md */}
          <p className="flex items-center gap-4 text-sm leading-5 font-semibold tracking-[0.05em] text-muted uppercase">
            <span aria-hidden="true" className="h-0.5 w-8 shrink-0 bg-gold-400" />
            How it works
          </p>

          {/* headline-xl, stepped down on small screens where 48px would wrap to four lines */}
          <h2
            id="how-heading"
            className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-[1.17] font-bold tracking-[-0.02em] text-balance text-body"
          >
            Four steps, and the first one is just turning up.
          </h2>
        </div>

        <ol className="mt-16 grid gap-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 100}>
                <div className="flex flex-col">
                  {/*
                   * headline-xl. The numeral is content, not ornament, so it is #7e7576 at
                   * 4.2:1 rather than the near-invisible tint this pattern usually gets — a
                   * step number a reader cannot make out is not doing its job.
                   */}
                  <span className="text-5xl leading-[1.17] font-bold tracking-[-0.02em] text-subtle tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span aria-hidden="true" className="mt-6 h-0.5 w-10 rounded-full bg-gold-400" />

                  {/* headline-lg */}
                  <h3 className="mt-6 text-[2rem] leading-10 font-bold tracking-[-0.02em] text-balance text-body">
                    {step.title}
                  </h3>

                  {/* body-md */}
                  <p className="mt-4 text-base leading-6 text-muted">{step.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
