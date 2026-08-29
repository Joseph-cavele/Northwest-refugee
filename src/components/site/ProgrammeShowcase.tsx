import { SectionHeading } from './SectionHeading';
import { ProgrammeStrip } from './ProgrammeStrip';
import type { Programme } from './ProgrammeStrip';
import { PILLAR_LABELS } from '@/types/enums';
import { PATHS } from '@/lib/paths';

/*
 * The programme strip — the five pillars as pictures, on a shallow arc.
 *
 * THE CATEGORIES COME FROM types/enums.ts, not from strings typed here. That file mirrors the
 * enum the server validates a programme against, so renaming a pillar moves this strip with it
 * rather than leaving the public site advertising a category the API no longer accepts. It is
 * the same rule Pillars.tsx follows for the same reason.
 *
 * IT IS THE SAME FIVE PILLARS AS THAT SECTION, ON PURPOSE AND NOT BY ACCIDENT. Pillars.tsx
 * says what each one is, in a sentence, to somebody deciding whether they have come to the
 * right place. This says what each one looks like, to somebody who has not decided to read
 * anything yet. If only one of the two ever ships, it should be the one with the sentences.
 *
 * THE PICTURES ARE ILLUSTRATIVE AND NOBODY IN THEM IS A CLIENT. Generated images, in
 * /public/cards-images — the same call Appeals.tsx, GetInvolved.tsx and Mission.tsx record,
 * and the only reason a face can appear on a page beside the words "refugee" and "asylum
 * seeker" at all. Never caption one with a name, a story or a place.
 *
 * EACH PANEL STILL HOLDS ITS RESERVATION. Set `image` to null and the labelled empty frame
 * comes back with the arc, the caption and the layout unchanged.
 *
 * THEY ARE COMPOSED FOR GREYSCALE, WHICH IS THE CONSTRAINT THAT DECIDED THEM. Four of the five
 * are drained of colour at any moment, so each has to survive as a shape rather than as a
 * scene: one subject large in frame, strong tonal separation, and nothing where small detail
 * carries the meaning. That is also why they are close single-object shots — a stamp, a stack
 * of books, a knife, a box, a raised hand — where the appeal cards covering the same five
 * pillars are wide documentary scenes. Two rows of the same photographs three screens apart
 * would read as one row rendered twice.
 *
 * THE SKILLS PANEL IS A KITCHEN RATHER THAN A WORKSHOP, which was NWHR's choice and is the
 * better one: catering is the trade this programme most often places people into, and it is a
 * qualification somebody can use the week they get it.
 *
 * THE TITLES ARE DELIBERATELY NOT THE APPEAL CARDS' TITLES. Both sections cover the same five
 * pillars, and the first draft of this one repeated "Getting papers in order", "A place in
 * school" and two more word for word — a reader scrolling past would have met the same four
 * phrases twice in one page and concluded the second row was a rendering mistake. These name
 * the programme; the appeals name the thing a donation buys.
 *
 * TODO(NWHR): every card links to /programmes, which does not exist yet. When the pillar pages
 * are built, point each panel at its own.
 */
const PROGRAMMES: Programme[] = [
  {
    id: 'documentation',
    title: 'Permits and papers',
    category: PILLAR_LABELS.ADVOCACY_DOCUMENTATION,
    href: PATHS.programmes,
    image: '/cards-images/programme-documentation.png',
    imageAlt: 'A hand pressing a dated rubber stamp onto an application form in an open folder.',
    imageBrief: '4:3 — a caseworker and a client with a folder of documents',
  },
  {
    id: 'education',
    title: 'School placement',
    category: PILLAR_LABELS.EDUCATION,
    href: PATHS.programmes,
    image: '/cards-images/programme-education.png',
    imageAlt:
      "A child in uniform lifting the top book from a stack of exercise books beside a school backpack.",
    imageBrief: '4:3 — children in uniform at a school gate',
  },
  {
    id: 'skills',
    title: 'Training and enterprise',
    category: PILLAR_LABELS.SKILLS_ENTREPRENEURSHIP,
    href: PATHS.programmes,
    image: '/cards-images/programme-skills.png',
    imageAlt: 'A woman in chef whites slicing an onion on a board in a busy commercial kitchen.',
    imageBrief: '4:3 — a catering training kitchen, mid-service',
  },
  {
    id: 'social-cohesion',
    title: 'Emergency support',
    category: PILLAR_LABELS.SOCIAL_COHESION,
    href: PATHS.programmes,
    image: '/cards-images/programme-social-cohesion.png',
    imageAlt:
      'Two pairs of hands passing a cardboard box of maize meal and tinned food across a table.',
    imageBrief: '4:3 — food parcels being handed over',
  },
  {
    id: 'women-youth',
    title: 'Women and youth groups',
    category: PILLAR_LABELS.WOMEN_YOUTH_EMPOWERMENT,
    href: PATHS.programmes,
    image: '/cards-images/programme-women-youth.png',
    imageAlt:
      'Women seated in a circle of chairs in a hall, one speaking with a hand raised mid-gesture.',
    imageBrief: '4:3 — a women’s group meeting in a community hall',
  },
];

export function ProgrammeShowcase() {
  return (
    <section aria-labelledby="showcase-heading" className="bg-white font-(family-name:--font-ui)">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <SectionHeading
          eyebrow="What we run"
          title={
            <span id="showcase-heading">
              Five programmes, <span className="text-gold-700">one office</span>
            </span>
          }
        />

        <ProgrammeStrip items={PROGRAMMES} label="Programmes" className="mt-14" />
      </div>
    </section>
  );
}

export default ProgrammeShowcase;
