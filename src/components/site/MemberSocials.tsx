'use client';

import { useId, useState } from 'react';
import type { ComponentType } from 'react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SocialPlatform } from '@/components/ui/social-row';

/*
 * The plus on a team card, and the profiles it opens.
 *
 * WHY NOT SocialRow, WHICH ALREADY DRAWS THESE ICONS. That component labels every link
 * `${ORG.shortName} on Facebook`, because it exists to link the organisation's own pages. On a
 * person's card that label is wrong in the way that matters most — a screen reader would
 * announce four cards' worth of links as "NWHR on Facebook" four times over, with nothing to
 * tell them apart and the wrong destination named. Here the label carries the person, or the
 * post while the person is still a reservation. The icon set is the same import, so the two
 * stay visually identical without sharing the wrong wording.
 *
 * A DISCLOSURE, NOT A HOVER MENU. `aria-expanded` on the button and a real toggle, so it works
 * on a phone, from the keyboard and under a screen reader — a fan-out that only appears on
 * :hover is invisible to all three. Escape closes it, which is what a disclosure is expected to
 * do once it has taken focus.
 *
 * TWO WAYS IN, ONE STATE TO GET WRONG. A pointer hovering the card reveals the icons in CSS —
 * no state, no handler, nothing for React to keep in sync — and the button pins them open for
 * everybody else. That split is deliberate: hover is the affordance a mouse user expects and
 * the one a phone and a keyboard cannot produce, so it is the extra, never the only route.
 *
 * CLOSED MEANS UNREACHABLE FROM THE KEYBOARD. Faded links are still in the tab order, and
 * tabbing across this row would otherwise walk through twelve invisible profile links before
 * reaching the button under them. `tabIndex={-1}` while closed is what prevents that — the
 * hover reveal deliberately does NOT grant focusability, because a link that appears under the
 * cursor and vanishes when it leaves is not somewhere focus should be able to land.
 *
 * IT NEEDS AN ANCESTOR MARKED `group` for the hover half to do anything. Inside one, hovering
 * the card reveals; outside one, the button alone still works. That is a soft dependency by
 * design — this component cannot see its card, and a hard one would make it unusable anywhere
 * else on the site.
 */

interface PlatformMeta {
  Icon: ComponentType<{ className?: string }>;
  /** Reads as "Thandi on Instagram" — the destination, not just the platform. */
  name: string;
}

const PLATFORMS: Record<SocialPlatform, PlatformMeta> = {
  facebook: { Icon: FaFacebookF, name: 'Facebook' },
  instagram: { Icon: FaInstagram, name: 'Instagram' },
  linkedin: { Icon: FaLinkedinIn, name: 'LinkedIn' },
  x: { Icon: FaXTwitter, name: 'X' },
  youtube: { Icon: FaYoutube, name: 'YouTube' },
};

export interface MemberLink {
  platform: SocialPlatform;
  href: string;
}

interface MemberSocialsProps {
  /** Whose profiles these are. The person's name, or their post until there is a name. */
  who: string;
  links: MemberLink[];
  className?: string;
}

export function MemberSocials({ who, links, className }: MemberSocialsProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  // No profiles, no control. A plus that opens an empty panel is a broken card.
  if (links.length === 0) return null;

  return (
    <div
      className={cn('relative', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          // Stop it reaching a dialog or a menu further up: the innermost open thing closes.
          event.stopPropagation();
        }
      }}
    >
      {/*
       * The stack rises out of the button. It is absolutely positioned so opening it moves
       * nothing on the card — a disclosure that reflows the row it is in makes every other
       * card jump while somebody is reading them.
       */}
      <ul
        id={panelId}
        aria-hidden={!open || undefined}
        className="absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 pb-2"
      >
        {links.map(({ platform, href }, index) => {
          const { Icon, name } = PLATFORMS[platform];
          return (
            <li key={platform}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${who} on ${name}`}
                // Out of the tab order until the button has opened them — see the note above.
                tabIndex={open ? undefined : -1}
                className={cn(
                  'grid size-10 place-items-center rounded-full bg-white text-ink-950 shadow-md transition-[opacity,transform] duration-300 hover:bg-gold-400',
                  // Resting state, and the hover reveal that overrides it inside a `group`.
                  'pointer-events-none translate-y-3 opacity-0',
                  'group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
                  // Pinned open by the button. Last in the list, so it wins over the resting
                  // state whether or not anything is being hovered.
                  open && 'pointer-events-auto translate-y-0 opacity-100'
                )}
                /*
                 * Staggered from the button outwards — the nearest icon moves first — so the
                 * three read as one movement leaving the plus rather than three things
                 * appearing at once. The list is a column above the button, so "nearest" is
                 * the LAST item, which is why the delay counts down rather than up.
                 *
                 * The same order on the way out, deliberately. Reversing it would be prettier
                 * and cannot be done: half the reveals here are a CSS :hover on the card, and
                 * nothing in JavaScript knows which direction one of those is going.
                 */
                style={{ transitionDelay: `${(links.length - 1 - index) * 60}ms` }}
              >
                <Icon className="size-4" />
              </a>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? `Hide links for ${who}` : `Show links for ${who}`}
        onClick={() => setOpen((was) => !was)}
        className="grid size-10 place-items-center rounded-full bg-ink-950 text-white transition-colors hover:bg-brand-500"
      >
        {/* One glyph, rotated — a plus turned 45° IS a cross, so the open and closed states are
            the same element moving rather than two icons swapping, which would flicker. */}
        <Plus
          className={cn('size-5 transition-transform duration-300', open && 'rotate-45')}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

export default MemberSocials;
