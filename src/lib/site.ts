import type { SocialPlatform } from '@/components/ui/social-row';

/*
 * Organisation-level facts that are not code.
 *
 * Kept out of components so changing a handle or a phone number is one edit in a file
 * a non-engineer can read, rather than a search through JSX.
 */

export const ORG = {
  name: 'North West House of Refuge',
  shortName: 'NWHR',
  /** From CLAUDE.md. */
  tagline: 'Empowering. Integrating. Transforming Lives.',
  city: 'Rustenburg, North West',

  /*
   * How to reach the organisation. These appear in the header's contact strip.
   *
   * THE NUMBER IS DISPLAYED LOCALLY AND DIALLED INTERNATIONALLY, and the two differ on
   * purpose. `081 496 8907` is the form somebody in Rustenburg recognises and can read back
   * over a counter; `tel:+27814968907` is the form that connects from a foreign SIM, which
   * a good share of this audience is carrying. Writing the international form on screen
   * would make the commonest reader hesitate over a number they dial every day, and writing
   * the local form in the href would fail silently for everyone roaming.
   *
   * THE ADDRESS IS CONFIRMED, and it comes in two parts because that is how somebody actually
   * finds it. `address` is what a taxi driver, a map and a letter need; `addressHint` is what a
   * person walking down the street needs, and for a first-floor office above a college it is
   * the more useful of the two. Print both, in that order, wherever the location appears.
   *
   * IT WAS DELIBERATELY BLANK UNTIL NOW, and the reason still governs any future change: this
   * is a walk-in service, so the address is the one fact here that must not be guessed. Sending
   * somebody who has travelled across Rustenburg to the wrong door costs them a day and a taxi
   * fare they may not have. Confirm before editing, never infer.
   *
   * TODO(NWHR): the email is still a placeholder and bounces. Confirm it or delete it.
   */
  email: 'info@nwhr.org.za',
  phone: '081 496 8907',
  phoneHref: 'tel:+27814968907',
  address: '12 Pretorius Street, Rustenburg 0300',
  addressHint: 'Next to FNB, in the same building as Rock of Spring College',
} as const;

export interface SocialLink {
  platform: SocialPlatform;
  href: string;
}

/**
 * NWHR's own profiles — outbound links, NOT sign-in providers. There is no OAuth in
 * this system.
 *
 * TODO(NWHR): these are placeholders. Replace with the organisation's real profile URLs,
 * or delete the entries you do not have — the row renders nothing for an empty list,
 * and no link is better than one that lands on a platform's home page.
 */
export const SOCIAL_LINKS: SocialLink[] = [
  { platform: 'facebook', href: 'https://www.facebook.com/' },
  { platform: 'instagram', href: 'https://www.instagram.com/' },
  { platform: 'linkedin', href: 'https://www.linkedin.com/' },
  { platform: 'x', href: 'https://x.com/' },
];
