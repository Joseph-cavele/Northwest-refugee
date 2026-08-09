import type { ComponentType } from 'react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import { cn } from '@/lib/utils';
import { ORG } from '@/lib/site';

/*
 * Links to the organisation's own pages. NOT sign-in providers.
 *
 * The design this came from puts Google/Facebook/GitHub buttons above the password
 * field, which reads as federated login. This backend has no OAuth — no provider, no
 * callback route, no account-linking table — so rendering them that way would be four
 * controls that do nothing. Whether staff auth for a system holding minors' identity
 * documents *should* be federated to Google or Facebook is NWHR's decision to make, not
 * something to imply in a form.
 *
 * Hence the visible heading: a bare row of platform logos on a login screen is read as
 * "sign in with" no matter what the markup says.
 */

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'youtube';

interface PlatformMeta {
  Icon: ComponentType<{ className?: string }>;
  /** Names the destination, because "Facebook" alone does not say whose page it is. */
  label: string;
}

const PLATFORMS: Record<SocialPlatform, PlatformMeta> = {
  facebook: { Icon: FaFacebookF, label: `${ORG.shortName} on Facebook` },
  instagram: { Icon: FaInstagram, label: `${ORG.shortName} on Instagram` },
  linkedin: { Icon: FaLinkedinIn, label: `${ORG.shortName} on LinkedIn` },
  x: { Icon: FaXTwitter, label: `${ORG.shortName} on X` },
  youtube: { Icon: FaYoutube, label: `${ORG.shortName} on YouTube` },
};

export interface SocialRowProps {
  links: { platform: SocialPlatform; href: string }[];
  heading?: string;
  className?: string;
}

export function SocialRow({ links, heading = `Follow ${ORG.name}`, className }: SocialRowProps) {
  // Renders nothing rather than an empty heading when no profiles are configured.
  if (links.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-xs text-subtle">{heading}</span>
      <div className="flex gap-2">
        {links.map(({ platform, href }) => {
          const { Icon, label } = PLATFORMS[platform];
          return (
            <a
              key={platform}
              href={href}
              target="_blank"
              // noreferrer implies noopener everywhere that matters; without it the
              // opened tab keeps a handle on this one through window.opener.
              rel="noreferrer"
              aria-label={label}
              className={cn(
                'grid size-9 place-items-center rounded-md border border-line text-muted',
                'transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-500'
              )}
            >
              <Icon className="size-4" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
