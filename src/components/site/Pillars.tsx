import { BookOpen, FileText, GraduationCap, HeartHandshake, Users } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { CardCarousel } from './CardCarousel';
import type { CarouselCard } from './CardCarousel';
import { PILLAR_LABELS } from '@/types/enums';

/*
 * The five pillars, as a looping carousel.
 *
 * LABELS COME FROM types/enums.ts, not from strings typed here. That file mirrors the enum
 * the server validates programmes against, so renaming a pillar moves this page with it
 * rather than leaving the public site advertising a category the API no longer accepts.
 *
 * The wording of each blurb is deliberately the same as the assistant's six doors —
 * somebody who reads this section and then opens the assistant should meet the same
 * vocabulary, because consistency is how a person learns their way around a service.
 *
 * ONE COLOUR EACH, from the mark. Four of the five take a figure's hue; documentation takes
 * the mark's own near-black, which suits it — it is the pillar most people arrive through,
 * since a school place or a formal job almost always waits on a permit.
 *
 * NOTHING HERE IS A LINK YET. Every marketing route on this site currently 404s, and a card
 * that looks clickable and lands on a 404 is worse than a card that never offered. Give each
 * one an href when its page exists.
 */

/*
 * Icons are RENDERED here, not handed over as components. CardCarousel is a client
 * component, and a component is a function — functions cannot cross that boundary. Drawing
 * them on the server also keeps the icon set out of the client bundle.
 */
const ICON = 'size-6';

const PILLARS: CarouselCard[] = [
  {
    id: 'ADVOCACY_DOCUMENTATION',
    title: PILLAR_LABELS.ADVOCACY_DOCUMENTATION,
    description:
      'Permits, asylum papers, birth certificates and Home Affairs appointments. We can check what you have and what is missing.',
    icon: <FileText className={ICON} aria-hidden="true" />,
    tint: 'bg-ink-100 text-ink-950',
    ring: 'border-ink-200',
  },
  {
    id: 'EDUCATION',
    title: PILLAR_LABELS.EDUCATION,
    description:
      'School placement for children, and help with the paperwork a school will ask for.',
    icon: <GraduationCap className={ICON} aria-hidden="true" />,
    tint: 'bg-brand-50 text-brand-700',
    ring: 'border-brand-200',
  },
  {
    id: 'SKILLS_ENTREPRENEURSHIP',
    title: PILLAR_LABELS.SKILLS_ENTREPRENEURSHIP,
    description: 'Training courses, and help getting started with work or a small business.',
    icon: <BookOpen className={ICON} aria-hidden="true" />,
    tint: 'bg-accent-50 text-accent-800',
    ring: 'border-accent-200',
  },
  {
    id: 'SOCIAL_COHESION',
    title: PILLAR_LABELS.SOCIAL_COHESION,
    description: 'Food, shelter, counselling, and support when something has gone wrong.',
    icon: <HeartHandshake className={ICON} aria-hidden="true" />,
    tint: 'bg-gold-100 text-gold-700',
    ring: 'border-gold-200',
  },
  {
    id: 'WOMEN_YOUTH_EMPOWERMENT',
    title: PILLAR_LABELS.WOMEN_YOUTH_EMPOWERMENT,
    description:
      'Programmes for women and for young people, including safety and support groups.',
    icon: <Users className={ICON} aria-hidden="true" />,
    tint: 'bg-danger-50 text-danger-700',
    ring: 'border-danger-100',
  },
];

export function Pillars() {
  return (
    /*
     * The hero's scroll cue points here.
     *
     * `--font-ui` is set here as every other section sets it. Its absence was what made the
     * two dead font variables below visible rather than harmless: an undefined var() leaves
     * font-family inheriting, and with nothing set on this section the chain ran all the way
     * to <body> and landed on the browser's default serif.
     */
    <section id="what-we-do" className="bg-surface font-(family-name:--font-ui)">
      {/*
       * DESIGN.md's container, verbatim, and the only thing about this section that was off
       * it: 1280px centred, 20px margins on mobile, 64px from lg. It previously read
       * `max-w-7xl px-6 sm:px-10 py-20 lg:py-28` — the same 1280px by a different name, but
       * 24px margins and an extra 40px step at sm that no other section on the site has, so
       * every band scrolled past at one width and this one at another.
       *
       * The vertical is 64/128, both on DESIGN.md's 32-64-128 rhythm, matching HowItWorks —
       * the other full-width band with a heading and a row beneath it.
       */}
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <SectionHeading
          flourish
          eyebrow="What we do"
          title="Five Ways We Help"
          lead="Documentation and advocacy, education, skills and enterprise, social cohesion, and programmes for women and young people — from a first appointment through to settling in."
        />

        {/* -mx-2.5 cancels the padding each card carries for its own gap, so the row still
            lines up with the heading above it rather than sitting 10px inside it. */}
        <CardCarousel items={PILLARS} label="Ways we help" className="mt-16 -mx-2.5" />
      </div>
    </section>
  );
}

export default Pillars;
