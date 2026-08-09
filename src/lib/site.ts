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
