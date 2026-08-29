import { AppealCarousel } from './AppealCarousel';
import type { Appeal } from './AppealCarousel';
import { PATHS } from '@/lib/paths';

/*
 * "What your giving pays for" — the appeals band, built on AppealCarousel.
 *
 * EVERY APPEAL IS A SERVICE THAT ALREADY EXISTS. Home Affairs trips, school placements,
 * skills training, the food and shelter response and the women's and youth programmes are
 * the five pillars in types/enums.ts, which is the same list the register validates a
 * programme against. A public appeal for work the organisation does not do is the one thing
 * on this page a funder can check in an afternoon.
 *
 * THE TARGETS ARE PLANS. A goal is something the organisation sets, so writing one down costs
 * nothing but a decision.
 *
 * THE RAISED FIGURES ARE NOT. READ THIS BEFORE THE PAGE GOES PUBLIC. `raisedCents` is a claim
 * that money has actually arrived, and nothing here is wired to Paystack — the five values
 * below are INVENTED, and they exist for one reason: the progress bar animates as its card
 * comes round, and a bar with no data to draw animates nothing, so there would be nothing to
 * review. They are safe on a localhost build being designed and they are a false statement
 * about donations the moment this page is served to anybody else.
 *
 * TODO(NWHR): confirm the five targets with the Finance Officer. Then either delete every
 * `raisedCents` line — the cards fall back to "Not open yet", which is honest and which the
 * layout is built for — or wire them to the real campaign totals. Do one or the other BEFORE
 * this page is published; do not publish the numbers below.
 *
 * AMOUNTS ARE INTEGER CENTS — the rule holds on the public site too, not only in finance.
 * Writing 250_000_00 rather than 25000000 keeps the rand figure readable at a glance.
 *
 * THE PICTURES ARE ILLUSTRATIVE AND NOBODY IN THEM IS A CLIENT. They are generated images in
 * /public/cards-images, and that is the only reason they can be here at all: a photograph of
 * an identifiable person next to the words "refugee" and "asylum seeker" is a written-consent
 * question, not a layout one — the same reason About.tsx carries no named face. Never caption
 * one with a name, a story or a place, and if a photograph of real people ever replaces one,
 * the consent has to exist on file first.
 */
const APPEALS: Appeal[] = [
  {
    id: 'documentation',
    title: 'Getting papers in order',
    description:
      'Transport to Home Affairs in Rustenburg, certified copies, and a caseworker who goes with you.',
    image: '/cards-images/appeal-documentation.png',
    imageAlt:
      'Two people sitting at a service counter over an application form, one holding a worn envelope of documents.',
    imageBrief: '4:3 — a caseworker and a client at the Home Affairs counter',
    goalCents: 120_000_00,
    // INVENTED — see the warning at the top of this file.
    raisedCents: 50_400_00,
    href: PATHS.donate,
  },
  {
    id: 'school-places',
    title: 'A place in school',
    description:
      'Uniforms, stationery and the paperwork a school asks for before it will take a child.',
    image: '/cards-images/appeal-school.png',
    imageAlt:
      'A child in school uniform, seen from behind, walking through a school gate with a backpack.',
    imageBrief: '4:3 — a child in uniform outside a Rustenburg primary school',
    goalCents: 180_000_00,
    // INVENTED — see the warning at the top of this file.
    raisedCents: 122_400_00,
    href: PATHS.donate,
  },
  {
    id: 'skills',
    title: 'Skills and a first income',
    description:
      'Short courses, tools and start-up stock for someone building a small business.',
    image: '/cards-images/appeal-skills.png',
    imageAlt:
      'Hands guiding fabric through an industrial sewing machine in a training room, other machines behind.',
    imageBrief: '4:3 — a sewing or welding training session',
    goalCents: 240_000_00,
    // INVENTED — see the warning at the top of this file.
    raisedCents: 36_000_00,
    href: PATHS.donate,
  },
  {
    id: 'emergency',
    title: 'Food and a safe night',
    description:
      'Food parcels and emergency shelter for a family who arrived at the office with nothing.',
    image: '/cards-images/appeal-food.png',
    imageAlt:
      'Seen from above, hands packing maize meal, tinned food and cooking oil into cardboard relief boxes.',
    imageBrief: '4:3 — food parcels being packed, hands and boxes only',
    goalCents: 90_000_00,
    // INVENTED — see the warning at the top of this file.
    raisedCents: 79_200_00,
    href: PATHS.donate,
  },
  {
    id: 'women-youth',
    title: 'Women and young people',
    description:
      'Support groups, safety work and holiday programmes for young people out of school.',
    image: '/cards-images/appeal-women-youth.png',
    imageAlt:
      'Women seated in a circle of plastic chairs in a community hall, one of them speaking.',
    imageBrief: '4:3 — a women’s support group in a community hall',
    goalCents: 150_000_00,
    // INVENTED — see the warning at the top of this file.
    raisedCents: 49_500_00,
    href: PATHS.donate,
  },
];

export function Appeals() {
  return (
    <section aria-labelledby="appeals-heading" className="bg-white">
      {/* DESIGN.md's container and band, verbatim: 1280px centred, 20px margins on mobile and
          64px from lg, 64px / 128px vertical. */}
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <AppealCarousel
          items={APPEALS}
          label="Appeals"
          eyebrow="Where your giving goes"
          /*
           * The id sits on a span wrapping the WHOLE line, not on the accented word.
           * aria-labelledby reads the element it points at, so naming the section after
           * "one thing" would announce the band as exactly that.
           */
          title={
            <span id="appeals-heading">
              Give to <span className="text-gold-700">one thing</span>, and see what it pays
              for.
            </span>
          }
        />
      </div>
    </section>
  );
}

export default Appeals;
