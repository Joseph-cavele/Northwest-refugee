import { PILLAR_LABELS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';

/*
 * What NWHR runs, for the public programmes page.
 *
 * EVERY DESCRIPTION HERE IS TRACEABLE TO guide.content.js, which is the wording the assistant
 * and the WhatsApp bot already give people. That is deliberate and it is the whole reason this
 * file reads the way it does: a programmes page is exactly where an organisation invents
 * services it does not run, and the safest defence is to write nothing new. Where a line below
 * is close to a quotation, it is one.
 *
 * IT IS STATIC, NOT FETCHED, AND THAT IS A DECISION RATHER THAN A SHORTCUT. `/api/v1/programmes`
 * exists but is permission-gated end to end, because the register's programmes carry budgets,
 * assigned coordinators and enrolment counts — none of which belongs on a public page. What a
 * visitor needs is the front-of-house description, which changes when the organisation changes
 * what it does, not when a coordinator is reassigned. So it lives here, in one file a
 * non-engineer can read, and a rename is one edit rather than a migration.
 *
 * TODO(NWHR): confirm this list. It is assembled from the guide's own service descriptions, so
 * nothing in it is invented — but the guide describes what help is available, and a programme
 * page implies something more organised than that. Two things in particular need a person to
 * say yes: whether each of these runs continuously or in intakes, and whether "book a place"
 * is true of the training and the groups.
 */

/** How somebody starts. The three that are actually true of this office. */
export type ProgrammeAccess = 'WALK_IN' | 'REFERRAL' | 'BOOKED';

export const ACCESS_LABELS: Record<ProgrammeAccess, string> = {
  WALK_IN: 'Walk in',
  REFERRAL: 'By referral',
  BOOKED: 'Book a place',
};

/** Who a programme is for. Broad on purpose — a filter with nine options filters nobody. */
export type ProgrammeAudience = 'ANYONE' | 'FAMILIES' | 'WOMEN' | 'YOUNG_PEOPLE';

export const AUDIENCE_LABELS: Record<ProgrammeAudience, string> = {
  ANYONE: 'Anyone',
  FAMILIES: 'Children and families',
  WOMEN: 'Women',
  YOUNG_PEOPLE: 'Young people',
};

export interface Programme {
  id: string;
  title: string;
  /** One or two sentences, in the guide's own words wherever it has them. */
  summary: string;
  pillar: ProgrammePillar;
  audience: ProgrammeAudience;
  access: ProgrammeAccess;
  /** What a person should bring or expect. Kept short — the page is not the intake. */
  note: string;
}

/*
 * The picture used for a card, by pillar rather than by programme. Five photographs across
 * eleven programmes is honest — they illustrate the kind of work, and a distinct image per
 * programme would imply eleven photo shoots that never happened.
 */
export const PILLAR_IMAGES: Record<ProgrammePillar, string> = {
  ADVOCACY_DOCUMENTATION: '/cards-images/programme-documentation.png',
  EDUCATION: '/cards-images/programme-education.png',
  SKILLS_ENTREPRENEURSHIP: '/cards-images/programme-skills.png',
  SOCIAL_COHESION: '/cards-images/programme-social-cohesion.png',
  WOMEN_YOUTH_EMPOWERMENT: '/cards-images/programme-women-youth.png',
};

export const PROGRAMMES: Programme[] = [
  {
    id: 'permits',
    title: 'Permit applications and renewals',
    summary:
      'Help preparing an asylum or refugee permit application, and renewing one before it expires. We cannot decide your application — that is Home Affairs — but we can help you prepare it.',
    pillar: 'ADVOCACY_DOCUMENTATION',
    audience: 'ANYONE',
    access: 'WALK_IN',
    note: 'Bring whatever papers you have, even expired ones.',
  },
  {
    id: 'home-affairs',
    title: 'Going with you to Home Affairs',
    summary:
      'A caseworker or volunteer travels with you to the office in Rustenburg and stays for the appointment.',
    pillar: 'ADVOCACY_DOCUMENTATION',
    audience: 'ANYONE',
    access: 'BOOKED',
    note: 'Arranged in advance — the queues start early.',
  },
  {
    id: 'birth-registration',
    title: 'Birth registration',
    summary:
      'Registering a birth and obtaining the certificate, including where a hospital or a clinic has refused.',
    pillar: 'ADVOCACY_DOCUMENTATION',
    audience: 'FAMILIES',
    access: 'WALK_IN',
    note: 'Bring the clinic card and both parents’ documents if you have them.',
  },
  {
    id: 'legal-referral',
    title: 'Legal referral',
    summary:
      'Referral to legal partners at no cost, and taking up cases where rights are being denied.',
    pillar: 'ADVOCACY_DOCUMENTATION',
    audience: 'ANYONE',
    access: 'REFERRAL',
    note: 'We refer; the attorney decides whether to take the case.',
  },
  {
    id: 'school-placement',
    title: 'School placement',
    summary:
      'Getting children into school and keeping them there, including when a school turns a child away for lack of documents.',
    pillar: 'EDUCATION',
    audience: 'FAMILIES',
    access: 'WALK_IN',
    note: 'Come as early in the year as you can — places fill.',
  },
  {
    id: 'cooperatives',
    title: 'Cooperative training and support',
    summary:
      'Training and support for cooperatives so people can earn an income rather than depend on aid.',
    pillar: 'SKILLS_ENTREPRENEURSHIP',
    audience: 'ANYONE',
    access: 'BOOKED',
    note: 'Runs in intakes rather than continuously.',
  },
  {
    id: 'skills-training',
    title: 'Skills training',
    summary:
      'Short courses that lead to work, with the tools and materials to practise what was taught.',
    pillar: 'SKILLS_ENTREPRENEURSHIP',
    audience: 'ANYONE',
    access: 'BOOKED',
    note: 'Ask which course is open this term.',
  },
  {
    id: 'dialogues',
    title: 'Community dialogues and events',
    summary:
      'Bringing migrant and host communities together, so that neighbours meet somewhere other than a queue.',
    pillar: 'SOCIAL_COHESION',
    audience: 'ANYONE',
    access: 'WALK_IN',
    note: 'Open to everybody in the area, not only to our clients.',
  },
  {
    id: 'emergency',
    title: 'Food and emergency support',
    summary:
      'Food parcels, transport where it is what stands between somebody and an appointment, and help finding a safe place to stay.',
    pillar: 'SOCIAL_COHESION',
    audience: 'ANYONE',
    access: 'WALK_IN',
    note: 'Come in and ask. Nothing is needed to be seen.',
  },
  {
    id: 'gbv-support',
    title: 'Support after gender-based violence',
    summary:
      'Support for survivors of gender-based violence, including going with you to a clinic or a police station.',
    pillar: 'WOMEN_YOUTH_EMPOWERMENT',
    audience: 'WOMEN',
    access: 'WALK_IN',
    note: 'If you are in danger now, ring 10111 first.',
  },
  {
    id: 'child-protection',
    title: 'Child protection',
    summary:
      'Working with families and with social development where a child is unaccompanied, separated or at risk.',
    pillar: 'WOMEN_YOUTH_EMPOWERMENT',
    audience: 'FAMILIES',
    access: 'REFERRAL',
    note: 'Usually reaches us through a school, a clinic or a neighbour.',
  },
  {
    id: 'youth',
    title: 'Programmes for young people',
    summary:
      'Groups and holiday programmes for young people, including those out of school and waiting on a placement.',
    pillar: 'WOMEN_YOUTH_EMPOWERMENT',
    audience: 'YOUNG_PEOPLE',
    access: 'BOOKED',
    note: 'Ask what is running this school holiday.',
  },
];

/** The pillars that actually have a programme, in the order the register declares them. */
export const PROGRAMME_PILLARS_IN_USE = Object.keys(PILLAR_LABELS).filter((pillar) =>
  PROGRAMMES.some((programme) => programme.pillar === pillar)
) as ProgrammePillar[];
