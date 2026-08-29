import Image from 'next/image';
import Link from 'next/link';
import { HandHeart, ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/*
 * The banner every marketing page opens with: a photograph run to both edges, washed down to
 * near-black, the page's title centred on it, and a torn white edge along the top.
 *
 * REUSABLE FROM THE FIRST USE, NOT THE SECOND. There are eight more marketing routes in
 * paths.ts waiting to be built, and a page banner is precisely the component that gets copied
 * with one value changed until four pages have four different heading sizes. `/contact` is
 * simply the first page to need it.
 *
 * NO SCRIPT FACE FOR THE EYEBROW. The reference sets it in handwriting; DESIGN.md specifies
 * Inter exclusively, and SectionHeading records what happened the last time a `--font-script`
 * variable was reached for — an undefined var() invalidates the whole declaration and the line
 * silently renders in the browser's default serif. Gold small caps carry the same job.
 *
 * GOLD IS SAFE HERE AND ALMOST NOWHERE ELSE. On this near-black ground the logo's yellow
 * measures 14.9:1; on the white of every other section it is 1.37:1 and cannot be type at all.
 * The eyebrow, the heart and the rule are all gold for that reason, and only here.
 *
 * THE WASH IS NOT DECORATION. A photograph has no fixed contrast ratio — the sky in one corner
 * and the shadow in another are twenty stops apart — so white type laid straight onto one is
 * legible by luck. The wash sets a floor: at 88% down the left and 72% at the right edge, the
 * lightest pixel any glyph can sit on still clears AA.
 */

export interface PageBannerImage {
  /** A path under /public, or null to render the reserved frame. */
  src: string | null;
  /** What the picture shows. Read aloud, so never "banner image". */
  alt: string;
  /** What the frame is waiting for, shown while `src` is null. */
  brief: string;
}

interface PageBannerProps {
  /** The small line above the title. */
  eyebrow: string;
  /** The page's h1. A node, so a caller can accent a word. */
  title: ReactNode;
  /** One sentence at most — the page itself is where the argument goes. */
  lead?: string;
  image: PageBannerImage;
  /**
   * A trail under the title: `[{ label: 'Home', href: '/' }]`, with the current page appended
   * automatically from `eyebrow`. Omit it on a page reached from more than one place, where a
   * single trail would be a guess about how somebody got here.
   */
  breadcrumb?: { label: string; href: string }[];
}

/*
 * The torn edge along the top, as one path stretched to whatever width the window is.
 *
 * `preserveAspectRatio="none"` lets a 1440 × 40 drawing become the edge of a 390px phone
 * without a second path — the teeth compress, which is what a torn edge does anyway. The
 * irregularity is deliberate: an even zigzag reads as a graphic device, and the reference's
 * edge reads as something ripped.
 */
const TORN_TOP =
  'M 0 0 L 1440 0 L 1440 23.6 L 1438.9 8.1 L 1398.1 15 L 1375.4 14.7 L 1354.5 7.2 L 1309.9 24.4 ' +
  'L 1286.4 13.2 L 1266.2 6.6 L 1237.7 25.4 L 1210 20 L 1164.3 14.9 L 1119.7 21.3 L 1074.5 18.5 ' +
  'L 1033.8 2.6 L 1004.2 3.3 L 958.9 6 L 914.4 16.2 L 870.7 15.1 L 846 21.9 L 808.2 20.8 ' +
  'L 787.2 8.2 L 753.8 20.7 L 727.3 8.9 L 698.9 9.9 L 658 15.7 L 632.2 2.9 L 611.5 4.7 ' +
  'L 588 21.6 L 561 6.3 L 537.9 17.4 L 507.3 16.2 L 469.2 13.4 L 448.8 9.5 L 412.3 15.7 ' +
  'L 384 20.2 L 355.9 25.3 L 320.5 17.8 L 286 20.8 L 266.4 10.6 L 227.8 14.3 L 198 19 ' +
  'L 177.6 2.6 L 146.9 7.3 L 116.4 6.6 L 94.8 14.7 L 64.9 16.2 L 44.6 23.4 L 0 24.2 Z';

export function PageBanner({ eyebrow, title, lead, image, breadcrumb }: PageBannerProps) {
  return (
    <section className="relative isolate overflow-hidden bg-ink-950 font-(family-name:--font-ui)">
      {/* --- the photograph, or the space kept for it ------------------------------------ */}
      {image.src ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority
          sizes="100vw"
          /* Greyscale, so the wash over it is one colour rather than a tint fighting whatever
             the photograph happens to be. */
          className="-z-10 object-cover object-center grayscale"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 grid place-items-center border-b-2 border-dashed border-white/20 p-6 text-center"
        >
          <span>
            <ImageIcon className="mx-auto size-8 text-white/30" strokeWidth={1.5} />
            <span className="mt-3 block text-sm font-semibold text-white/40">{image.brief}</span>
          </span>
        </div>
      )}

      {/* The wash. Heavier on the left, as in the reference, so the drawn heart in that margin
          sits on solid colour rather than on a face. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950 from-15% via-ink-950/85 to-ink-950/70"
      />

      {/* --- the torn white edge, along the top ----------------------------------------- */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 40"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-6 w-full text-white sm:h-8"
      >
        <path d={TORN_TOP} fill="currentColor" />
      </svg>

      {/* --- the drawn heart in the left margin ----------------------------------------- */}
      <svg
        aria-hidden="true"
        viewBox="0 0 120 108"
        fill="none"
        className="pointer-events-none absolute bottom-12 left-[4%] hidden w-20 text-gold-400 lg:block"
      >
        {/* The same two-stroke heart the mission section carries — drawn twice and slightly out
            of register, which is what reads as sketched rather than as an icon. */}
        <path
          d="M60 100C60 100 8 70 8 38C8 20 22 8 38 8C48 8 56 14 60 22C64 14 72 8 82 8C98 8 112 20 112 38C112 70 60 100 60 100Z"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M60 93C60 93 15 67 15 39C15 24 27 14 40 14C49 14 56 19 60 26"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>

      {/* --- the words ------------------------------------------------------------------- */}
      <div className="mx-auto flex min-h-80 max-w-[80rem] flex-col items-center justify-center px-4 py-20 text-center lg:min-h-[26rem] lg:px-8">
        <p className="flex items-center gap-2.5 text-sm leading-5 font-semibold tracking-[0.05em] text-gold-400 uppercase">
          <HandHeart className="size-5 shrink-0" aria-hidden="true" />
          {eyebrow}
        </p>

        <h1 className="mt-5 text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.05] font-extrabold tracking-[-0.02em] text-balance text-white">
          {title}
        </h1>

        {lead && (
          <p className="mt-6 max-w-2xl text-base leading-7 text-pretty text-white/80">{lead}</p>
        )}

        {/*
         * A real <nav> with an ordered list, because a breadcrumb is a navigation landmark and
         * the order carries the meaning. The current page is the last item and is NOT a link —
         * linking a page to itself is the commonest breadcrumb mistake and it gives a screen
         * reader a link that goes nowhere. `aria-current="page"` marks it instead.
         */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mt-8">
            <ol className="flex flex-wrap items-center justify-center gap-2 text-sm text-white/70">
              {breadcrumb.map((crumb) => (
                <li key={crumb.href} className="flex items-center gap-2">
                  <Link href={crumb.href} className="underline underline-offset-2 hover:text-white">
                    {crumb.label}
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
              ))}
              <li aria-current="page" className="font-semibold text-white">
                {eyebrow}
              </li>
            </ol>
          </nav>
        )}
      </div>
    </section>
  );
}

export default PageBanner;
