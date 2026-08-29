import Link from 'next/link';
import { HandHeart, MapPin, Menu, Phone, UserRound } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { SocialRow } from '@/components/ui/social-row';
import { ORG, SOCIAL_LINKS } from '@/lib/site';
import { PATHS } from '@/lib/paths';

/*
 * The site header — src/Design/Design.md §14.
 *
 * GET HELP IS THE PRIMARY CALL TO ACTION, which is the substantive change here. Donate held
 * that slot before; §14 says outright to make Get Help primary, and it is also simply true of
 * this organisation — the site exists for people who need something, and donors are the
 * secondary audience. So Get Help wears the gold fill and Donate is a link like the rest.
 *
 * EIGHT OF §14'S NINE ITEMS: Home, About Us, Services, Programmes, Get Help, News & Events,
 * Donate, Contact. Seven sit in the bar as links and Get Help appears as the button, which is
 * the same eight without printing one of them twice.
 *
 * RESOURCES IS GONE, AT THE ORGANISATION'S REQUEST — not an oversight, and not something to
 * restore from the design document. It was the one item in the bar with nothing behind it and
 * no plan for anything behind it. See the note in paths.ts about a path in that file never
 * being evidence that a route resolves.
 *
 * THE LINKS ARE SENTENCE CASE, NOT UPPER. The old design document asked for all-caps labels
 * for "a clean, architectural look"; this one does not, and two things follow from dropping
 * it. Nine uppercase labels with letter-spacing do not fit a 1280px bar — they run roughly
 * 880px before gaps, against about 1100px of usable width once the logo and the two controls
 * are placed. And §3 asks for calm and simple over technical polish: "News & events" is easier
 * to scan than "NEWS & EVENTS" for somebody reading in a second language.
 *
 * NO GLASS. §3 lists "Glassmorphism everywhere" under Avoid, and a sticky translucent bar is
 * the one place it costs something measurable — type sitting over whatever happens to scroll
 * beneath it has no fixed contrast ratio, which §45 requires. Solid white, one hairline, and
 * the ambient shadow does the separating.
 *
 * THE UTILITY STRIP IS NOT IN §14 and is kept anyway. It carries one thing that matters more
 * than tidiness — the phone number — and somebody in trouble reaching for a phone should not
 * have to find the footer first. It is one line, and it scrolls away while the bar does not.
 *
 * THE MOBILE MENU IS A <details>, NOT shadcn's Sheet. §14 asks for the Sheet and it is the
 * right component once shadcn/ui is installed (Step 6 of the plan). Until then a disclosure
 * opens and closes natively, so the menu works before any JavaScript arrives — which on a
 * low-end phone over patchy data is worth more than the component swap.
 */

/**
 * §14's navigation, in its order.
 *
 * WARNING: of these, only Staff login resolves today. Every other path 404s — the pages behind
 * them are §61's work and are not built. They point at their real destinations so that
 * building each page is the only step left, but until then this bar is a promise the site does
 * not keep. Stated here once so it is impossible to miss.
 */
const NAV_LINKS = [
  { label: 'Home', href: PATHS.home },
  { label: 'About us', href: PATHS.about },
  { label: 'Services', href: PATHS.services },
  { label: 'Programmes', href: PATHS.programmes },
  { label: 'News & events', href: PATHS.news },
  { label: 'Donate', href: PATHS.donate },
  { label: 'Contact', href: PATHS.contact },
] as const;

/** Long, soft, and almost invisible at rest — it separates without drawing a border. */
const AMBIENT = 'shadow-[0_20px_40px_rgba(0,0,0,0.05)]';

export function SiteNav() {
  return (
    <header className="font-(family-name:--font-ui)">
      {/* --- utility strip ------------------------------------------------------------ */}
      <div className="bg-ink-950 text-white">
        <div className="mx-auto flex max-w-[80rem] items-center justify-between gap-4 px-4 py-2.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-x-6 text-xs">
            <a
              href={ORG.phoneHref}
              className="inline-flex shrink-0 items-center gap-2 text-white/80 transition-colors hover:text-gold-400"
            >
              <Phone className="size-3.5 shrink-0 text-gold-400" aria-hidden="true" />
              {ORG.phone}
            </a>
            {/*
             * The city, not a street address. NWHR's is the single fact on this bar that must
             * not be guessed — sending somebody who has travelled across Rustenburg to the
             * wrong door costs them a day and a taxi fare they may not have.
             */}
            <p className="hidden min-w-0 items-center gap-2 text-white/80 sm:inline-flex">
              <MapPin className="size-3.5 shrink-0 text-gold-400" aria-hidden="true" />
              {/* The street, not the city. This strip is the one place the location appears
                  above the fold, and "Rustenburg, North West" tells somebody already in
                  Rustenburg nothing they did not know. It truncates on a narrow screen, which
                  is why the street comes first in the string. */}
              <span className="truncate">{ORG.address}</span>
            </p>
          </div>

          <SocialRow
            links={SOCIAL_LINKS}
            inline
            className="hidden shrink-0 text-white/70 sm:flex"
          />
        </div>
      </div>

      {/* --- the bar ------------------------------------------------------------------- */}
      <div className={`sticky top-0 z-40 border-b border-line bg-white ${AMBIENT}`}>
        <div className="mx-auto flex max-w-[80rem] items-center justify-between gap-6 px-4 py-3.5 lg:px-8">
          <Link href={PATHS.home} className="flex shrink-0 items-center gap-3">
            <Logo size={40} decorative />
            <span className="text-xl font-extrabold tracking-[-0.02em] text-body">
              {ORG.shortName}
            </span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-6 xl:flex">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group relative text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-body"
              >
                {item.label}
                {/* The accent as a shape, never as a glyph — gold on white is 1.37:1. Grows
                    on hover AND on keyboard focus; a hover-only affordance is invisible to
                    anyone tabbing through. */}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1.5 left-0 h-0.5 w-full origin-left scale-x-0 bg-gold-400 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100"
                />
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2.5">
            {/*
             * Staff login as an icon control: it is the only link in this bar that currently
             * resolves, but it serves eight people rather than the public, so it takes the
             * quietest treatment that still leaves it reachable.
             */}
            <Link
              href={PATHS.signIn}
              title="Staff login"
              className="hidden size-11 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-ink-900 hover:text-body sm:grid"
            >
              <UserRound className="size-5" aria-hidden="true" />
              <span className="sr-only">Staff login</span>
            </Link>

            {/* §14's primary call to action. Near-black on the logo's gold is 14.9:1. */}
            <Link
              href={PATHS.getHelp}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-gold-400 px-5 text-sm font-semibold whitespace-nowrap text-ink-950 transition-colors hover:bg-gold-500 sm:px-6"
            >
              <HandHeart className="size-4 shrink-0" aria-hidden="true" />
              Get help
            </Link>

            <details className="xl:hidden">
              <summary
                aria-label="Open menu"
                className="grid size-11 cursor-pointer list-none place-items-center rounded-lg border border-line text-body transition-colors hover:border-ink-900 [&::-webkit-details-marker]:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </summary>

              {/*
               * A full-width sheet rather than a corner card: every row is the width of the
               * screen and 48px tall, which is §45's "large touch targets" and a thumb's
               * target rather than a mouse's. It positions against the STICKY wrapper —
               * `position: sticky` establishes a containing block — which is what lets it span
               * the viewport from inside a button in the corner.
               */}
              <nav
                aria-label="Main"
                className={`absolute inset-x-0 top-full max-h-[calc(100dvh-8rem)] overflow-y-auto border-b border-line bg-white ${AMBIENT}`}
              >
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex min-h-12 items-center border-b border-line px-4 text-base font-medium text-body transition-colors hover:bg-canvas"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href={PATHS.signIn}
                  className="flex min-h-12 items-center px-4 text-base text-muted transition-colors hover:bg-canvas sm:hidden"
                >
                  Staff login
                </Link>
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}

export default SiteNav;
