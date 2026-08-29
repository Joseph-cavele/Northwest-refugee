import Link from 'next/link';
import Image from 'next/image';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { SocialRow } from '@/components/ui/social-row';
import { ORG, SOCIAL_LINKS } from '@/lib/site';
import { PATHS } from '@/lib/paths';

/*
 * The footer — src/Design/Design.md §60.
 *
 * §60 ASKS FOR FOUR THINGS and the previous version had two. Its list is NWHR / About /
 * Services / Programmes / Get Help / Resources, then Contact, then Social Media, then Privacy
 * Policy, Terms and Accessibility — and "include partner logos where appropriate". The legal
 * row and the partner logo were the gaps.
 *
 * THE LEGAL ROW IS NOT BOILERPLATE ON THIS SITE. A privacy notice is the ordinary place a
 * person is told what is held about them and why, and this system holds immigration status,
 * permit numbers and vulnerability flags. §70 requires being explicit about why information is
 * requested; POPIA gives the person a right to ask. So `privacy` is arguably the one route in
 * lib/paths.ts that is required rather than merely planned, and it sits here where somebody
 * looking for it will actually look.
 *
 * THE PARTNER LOGO IS REAL — SARLN, the South African Refugee Led Network, whose mark is in
 * public/images/partners/. It is the one piece of third-party endorsement on this site that
 * is not a placeholder, which is exactly why it belongs in a footer rather than being padded
 * out into a row of invented companions.
 *
 * BLACK GROUND with gold used sparingly — on the contact icons and on hover. Everything else
 * is white and its two muted steps.
 *
 * EVERY LINK BELOW 404s TODAY except staff sign-in. They point at their real destinations so
 * that building each page is the only step left, but a footer full of dead links is a promise
 * the site does not keep, and it is more visible here than anywhere else.
 */

const EXPLORE = [
  { label: 'About us', href: PATHS.about },
  { label: 'Services', href: PATHS.services },
  { label: 'Programmes', href: PATHS.programmes },
  { label: 'Resources', href: PATHS.resources },
  { label: 'News & events', href: PATHS.news },
] as const;

const HELP = [
  { label: 'Get help', href: PATHS.getHelp },
  { label: 'Start a request', href: PATHS.screening },
  { label: 'Contact us', href: PATHS.contact },
  { label: 'Donate', href: PATHS.donate },
  { label: 'Staff login', href: PATHS.signIn },
] as const;

/** §60's third block. Small, quiet, and the last row of the page. */
const LEGAL = [
  { label: 'Privacy policy', href: PATHS.privacy },
  { label: 'Terms', href: PATHS.terms },
  { label: 'Accessibility', href: PATHS.accessibility },
] as const;

/*
 * Baked at build time, so it reflects the last deployment rather than today. That is the
 * normal trade for a statically prerendered page — the alternative is making the whole route
 * dynamic for one number in a copyright line.
 */
const YEAR = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="bg-ink-950 font-(family-name:--font-ui) text-white">
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* --- who --- */}
          <div>
            <div className="flex items-center gap-3">
              <Logo size={40} decorative />
              <span className="text-xl font-extrabold tracking-[-0.02em]">{ORG.shortName}</span>
            </div>

            <p className="mt-5 max-w-xs text-sm leading-6 text-white/60">
              {ORG.name} works with refugees, asylum seekers and migrants in {ORG.city} — from
              permits and school places to training and support when things go wrong.
            </p>

            <SocialRow links={SOCIAL_LINKS} inline className="mt-6 text-white/60" />
          </div>

          {/* --- explore --- */}
          <nav aria-label="Explore">
            <h2 className="text-sm font-semibold tracking-[0.16em] text-white uppercase">
              Explore
            </h2>
            <ul className="mt-5 space-y-3">
              {EXPLORE.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/60 transition-colors hover:text-gold-400"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* --- help --- */}
          <nav aria-label="Get help">
            <h2 className="text-sm font-semibold tracking-[0.16em] text-white uppercase">
              Help
            </h2>
            <ul className="mt-5 space-y-3">
              {HELP.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/60 transition-colors hover:text-gold-400"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* --- contact --- */}
          <div>
            <h2 className="text-sm font-semibold tracking-[0.16em] text-white uppercase">
              Contact
            </h2>
            <ul className="mt-5 space-y-4 text-sm">
              <li>
                <a
                  href={ORG.phoneHref}
                  className="inline-flex items-start gap-3 text-white/60 transition-colors hover:text-gold-400"
                >
                  <Phone className="mt-0.5 size-4 shrink-0 text-gold-400" aria-hidden="true" />
                  {ORG.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${ORG.email}`}
                  className="inline-flex items-start gap-3 break-all text-white/60 transition-colors hover:text-gold-400"
                >
                  <Mail className="mt-0.5 size-4 shrink-0 text-gold-400" aria-hidden="true" />
                  {ORG.email}
                </a>
              </li>
              <li className="flex items-start gap-3 text-white/60">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold-400" aria-hidden="true" />
                <address className="not-italic">
                  {ORG.address}
                  <span className="block text-white/60">{ORG.addressHint}</span>
                </address>
              </li>
            </ul>
          </div>
        </div>

        {/*
         * --- partners, §60's "include partner logos where appropriate" ---
         *
         * One partner, and it stays one. A logo row is read as endorsement, so it holds
         * organisations that have agreed to appear and nothing else — padding it out to fill
         * the width would turn the one real name here into a claim.
         *
         * The mark is knocked out to transparency, so it reads on this black ground without
         * the white card it would otherwise need.
         */}
        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-white/10 pt-10">
          <p className="text-sm font-semibold tracking-[0.16em] text-white/70 uppercase">
            In partnership with
          </p>
          <Image
            src="/images/partners/sarln.png"
            alt="South African Refugee Led Network"
            width={768}
            height={768}
            className="size-16 object-contain"
          />
          <p className="text-sm text-white/60">South African Refugee Led Network</p>
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-white/10 pt-8 text-xs text-white/45 lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {YEAR} {ORG.name}
          </p>

          {/* §60's legal block. */}
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {LEGAL.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="transition-colors hover:text-gold-400"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/*
           * Said plainly, and it is true of the system rather than of a policy document: the
           * consent gate is enforced before any personal detail is written.
           */}
          <p>Nothing about you is recorded until you have agreed to it.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
