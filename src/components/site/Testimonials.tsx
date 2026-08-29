import { SectionHeading } from './SectionHeading';
import { TestimonialCarousel } from './TestimonialCarousel';
import type { Testimonial } from './TestimonialCarousel';

/*
 * "What people say" — the testimonial band, on TestimonialCarousel.
 *
 * ============================================================================================
 *  READ THIS BEFORE THE PAGE IS PUBLISHED. THE FOUR QUOTES BELOW ARE WRITTEN, NOT COLLECTED.
 * ============================================================================================
 *
 * Nobody said any of them. They were composed to show the band with real copy in it, at the
 * length a collected quote runs to, and they are indistinguishable from testimony at a glance
 * — which is exactly what makes them dangerous to leave here. A quote on a charity's site is a
 * claim that a named or described person said those words about this organisation. Published
 * as they stand, these four are four such claims that are not true, and a funder or a
 * journalist who asks to speak to the beneficiary in the first card will find there is not
 * one.
 *
 * They carry no names for that reason: `name` is null on every card, so nothing here attaches
 * invented words to a person, and `rating` is absent, so no card shows a score nobody gave.
 * The attributions describe the KIND of person each quote is waiting for.
 *
 * TODO(NWHR): replace each `quote` with what somebody actually said, recorded with consent for
 * the words as well as the name — or delete the line, and the card returns to a labelled
 * reservation the layout is built for. Do one or the other before this page goes public.
 *
 * WHO EACH SLOT IS FOR, AND WHY THAT ORDER. A funder reading this band checks two things: that
 * the work reaches people, and that other institutions vouch for it. So the row runs
 * beneficiary, partner, volunteer, donor — the person served first, because the rest is worth
 * little if that voice is missing.
 *
 * THE BENEFICIARY SLOT IS THE ONE TO BE CAREFUL WITH. A named person thanking a refugee
 * organisation has published the fact that they are a refugee or an asylum seeker, permanently
 * and to anybody who reads it — including people they may have left a country to get away
 * from. Collect that one under a first name or none at all, with "Beneficiary, Rustenburg" as
 * the attribution, and record consent for the words as well as for the name.
 *
 * THE PORTRAITS ARE ILLUSTRATIVE AND NOBODY IN THEM SAID ANYTHING EITHER. They are the same
 * generated portraits the volunteer row uses, which is the only reason a face can sit beside
 * an uncollected quote at all. Replace each one with the real person as their quote arrives.
 */
const TESTIMONIALS: Testimonial[] = [
  {
    id: 'beneficiary',
    // WRITTEN, NOT COLLECTED — see the warning at the top of this file.
    quote:
      'I came in with a photocopy and nothing else. Someone sat down with me, wrote out what was missing, and came with me to Home Affairs three times. My son started school in April.',
    quoteBrief: 'Quote to be collected — about 40 words, in the person’s own wording.',
    name: null,
    attribution: 'Beneficiary, Rustenburg',
    image: '/cards-images/volunteer-interpreting.jpg',
    imageAlt: 'A man in a brightly patterned shirt smiling, against a painted yellow wall.',
  },
  {
    id: 'partner',
    // WRITTEN, NOT COLLECTED — see the warning at the top of this file.
    quote:
      'We refer families here when the paperwork goes beyond what we can do. They take the case, they keep us updated, and they do not hand somebody back with a form and good luck.',
    quoteBrief: 'Quote to be collected — about 40 words, from the partner organisation.',
    name: null,
    attribution: 'Partner organisation',
    image: '/cards-images/volunteer-home-affairs.jpg',
    imageAlt: 'A man in a linen shirt sitting at a café table, turned towards the camera.',
  },
  {
    id: 'volunteer',
    // WRITTEN, NOT COLLECTED — see the warning at the top of this file.
    quote:
      'You spend the morning in a queue and the afternoon on the phone to a school. It is not glamorous work. It is the difference between a child being enrolled this year or next year.',
    quoteBrief: 'Quote to be collected — about 40 words, on what the work is actually like.',
    name: null,
    attribution: 'Volunteer',
    image: '/cards-images/volunteer-skills-workshops.jpg',
    imageAlt: 'A man in a work apron smiling, warm lights out of focus behind him.',
  },
  {
    id: 'donor',
    // WRITTEN, NOT COLLECTED — see the warning at the top of this file.
    quote:
      'I wanted to know where the money went, and they showed me: transport, certified copies, uniforms. Small amounts, itemised, and every one of them attached to somebody with a name.',
    quoteBrief: 'Quote to be collected — about 40 words, on why they give.',
    name: null,
    attribution: 'Donor',
    image: '/cards-images/volunteer-school-placements.jpg',
    imageAlt:
      'A man in a yellow and white striped jumper smiling, in a room with soft daylight behind him.',
  },
];

export function Testimonials() {
  return (
    /*
     * Canvas, not white. The volunteer row above it is white and the footer below is black, so
     * this band is the step between them — three white cards on the page's own grey, which is
     * also what gives the cards an edge without a shadow under every one of them.
     */
    <section aria-labelledby="testimonials-heading" className="bg-canvas font-(family-name:--font-ui)">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <SectionHeading
          eyebrow="In their words"
          title={
            <span id="testimonials-heading">
              What people say <span className="text-gold-700">about us</span>
            </span>
          }
        />

        <TestimonialCarousel items={TESTIMONIALS} label="Testimonials" className="mt-16" />
      </div>
    </section>
  );
}

export default Testimonials;
