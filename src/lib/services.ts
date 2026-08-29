import type { ServiceCategory } from '@/types/enums';

/*
 * What somebody can ask for, for the public services page.
 *
 * THE LIST IS SERVICE_CATEGORIES, NOT A NEW ONE. Every entry below is a category the register
 * already logs a service request under — the same values a caseworker picks from in the
 * dashboard, from types/enums.ts. That is what makes this page checkable: a service advertised
 * here can be counted in the system, and one the system cannot log cannot be advertised.
 *
 * HOW THIS DIFFERS FROM /programmes, WHICH IS THE OBVIOUS QUESTION. A programme is ongoing work
 * somebody joins — a training intake, a women's group, a holiday club — and belongs to one of
 * the five pillars. A service is a discrete thing somebody asks for on a given day, and it is
 * what a request is filed as. Most people arrive needing a service; some of them end up in a
 * programme. If the two pages ever start describing the same things in the same words, this one
 * is the one to keep, because it is the one a visitor's problem is actually shaped like.
 *
 * WHAT IS NOT SAID ON ANY CARD. No waiting times, no capacity, no "we help X people a month".
 * Those are commitments a page cannot make on the office's behalf, and a person turned away
 * after reading one is worse off than one who was told nothing.
 */

export interface PublicService {
  id: ServiceCategory;
  /** The service, named as somebody would ask for it rather than as the enum spells it. */
  title: string;
  summary: string;
  /** Which lucide icon draws it. A NAME, not a component — see the note in ServiceGrid. */
  icon: string;
}

export const SERVICES: PublicService[] = [
  {
    id: 'LEGAL_DOCUMENTATION',
    title: 'Papers, permits and documents',
    summary:
      'Asylum and refugee permit applications and renewals, birth registration, and referral to legal partners where a right is being denied.',
    icon: 'FileCheck2',
  },
  {
    id: 'EDUCATION_PLACEMENT',
    title: 'School for a child',
    summary:
      'Getting a child into school and keeping them there, including when a school turns them away for lack of documents.',
    icon: 'GraduationCap',
  },
  {
    id: 'FOOD_ASSISTANCE',
    title: 'Food',
    summary:
      'Food parcels for a household that has run out, and a referral to a longer-term source where one exists.',
    icon: 'ShoppingBasket',
  },
  {
    id: 'SHELTER',
    title: 'A safe place to stay',
    summary:
      'Emergency shelter for somebody with nowhere to sleep tonight, and help finding something more settled.',
    icon: 'Home',
  },
  {
    id: 'HEALTHCARE',
    title: 'Getting seen at a clinic',
    summary:
      'Help reaching healthcare, including where a clinic has refused somebody for want of a document.',
    icon: 'Stethoscope',
  },
  {
    id: 'PSYCHOSOCIAL',
    title: 'Someone to talk to',
    summary:
      'Psychosocial support for people carrying what they left behind, and referral where specialist care is needed.',
    icon: 'HeartHandshake',
  },
  {
    id: 'GBV_SUPPORT',
    title: 'After violence or abuse',
    summary:
      'Support for survivors of gender-based violence, including going with you to a clinic or a police station.',
    icon: 'ShieldCheck',
  },
  {
    id: 'CHILD_PROTECTION',
    title: 'A child at risk',
    summary:
      'Working with families and social development where a child is unaccompanied, separated or unsafe.',
    icon: 'Baby',
  },
  {
    id: 'FAMILY_REUNIFICATION',
    title: 'Finding family',
    summary:
      'Tracing and reunification where a family was separated crossing a border or since arriving.',
    icon: 'Users',
  },
  {
    id: 'SKILLS_TRAINING',
    title: 'Training and skills',
    summary:
      'Short courses that lead to work, with the tools and materials to practise what was taught.',
    icon: 'Wrench',
  },
  {
    id: 'EMPLOYMENT',
    title: 'Looking for work',
    summary:
      'Help with what an employer will ask for, and with the paperwork that makes formal work possible.',
    icon: 'Briefcase',
  },
  {
    id: 'FINANCIAL_ASSISTANCE',
    title: 'Help with a fee',
    summary:
      'Assistance with the costs that block a next step — a permit fee, a certified copy, a school levy.',
    icon: 'Banknote',
  },
  {
    id: 'TRANSPORT',
    title: 'Getting there',
    summary:
      'A taxi fare where the journey is the only thing standing between somebody and an appointment.',
    icon: 'Bus',
  },
  {
    id: 'OTHER',
    title: 'Something else',
    summary:
      'Most people arrive with a problem that does not have a name on this page. Come in and describe it.',
    icon: 'MessageCircleQuestion',
  },
];
