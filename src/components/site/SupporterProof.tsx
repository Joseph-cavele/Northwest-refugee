import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, UserRound } from 'lucide-react';
import { PATHS } from '@/lib/paths';

/*
 * Social proof under the hero's buttons: four overlapping supporter marks, a count, and a
 * quiet way to join them.
 *
 * EACH CIRCLE FALLS BACK TO A COLOURED MARK when it has no `photo` — one of the logo's four
 * figures, with a neutral silhouette on it. That is not a placeholder so much as the brand's
 * own picture of itself: the mark is four figures around a central one, so four coloured
 * discs standing for four supporters is the same idea at 44px. Clearing a `photo` back to
 * null is therefore a safe move, not a broken state.
 *
 * THE COUNT IS NULL UNTIL SOMEBODY CONFIRMS IT. "+120 supporters" arrived as design copy,
 * and a number on a nonprofit's front page is a claim rather than a label — it is the line a
 * funder is most likely to check. With it null the row still reads honestly and still shows
 * the whole design; set it and the number appears.
 */

interface Supporter {
  /** A path under /public, or null to use the anonymised mark. */
  photo: string | null;
  /** The person's name, when there is a photograph. Never "supporter photo". */
  alt: string;
  /** One of the mark's four figures. */
  tint: string;
}

/*
 * Four supporter portraits, cut from the 2x2 grid supplied as design/
 * supporters-source.png.
 *
 * CROPPED AND DOWNSCALED, not used whole. The source is 1254px square at 2.4 MB; each face is
 * cut from the upper-middle of its quadrant — where the face actually sits, rather than the
 * geometric centre, which would have put the circle on a collarbone — and written out at
 * 96px. Four 44px circles now cost about 10 KB between them instead of 2.4 MB, and 96px still
 * covers a 2x screen. The master moved OUT of /public, because everything in that folder is
 * publicly served and a 2.4 MB file nothing references is 2.4 MB anyone can fetch.
 *
 * THEY DEPICT NOBODY REAL. These are generated portraits, so `alt` is empty — naming them
 * would compound it, and the adjacent text already carries the meaning for a screen reader.
 * The row reads as evidence on a charity's front page, so replacing these with actual
 * supporters, each with written permission and their name in `alt`, is the version that
 * should ship.
 *
 * The `tint` behind each photograph still matters: it is what shows if a `photo` is ever set
 * back to null, so clearing one stays a safe move rather than a broken state.
 */
const SUPPORTERS: Supporter[] = [
  { photo: '/images/supporters/supporter-1.jpg', alt: '', tint: 'bg-brand-500' },
  { photo: '/images/supporters/supporter-2.jpg', alt: '', tint: 'bg-accent-500' },
  { photo: '/images/supporters/supporter-3.jpg', alt: '', tint: 'bg-gold-400' },
  { photo: '/images/supporters/supporter-4.jpg', alt: '', tint: 'bg-danger-500' },
];

/**
 * The verified number of supporters, or null while there is not one.
 *
 * TODO(NWHR): set this to the real figure, or wire it to the donor count the fundraising
 * module already keeps (/api/v1/fundraising/donors). Do not guess it.
 */
const SUPPORTER_COUNT: number | null = null;

/** Milliseconds before this element starts, so it follows the headline rather than racing it. */
const START = 900;

export function SupporterProof() {
  return (
    /*
     * The spacing is the design here. Wedged tight between two filled buttons above and a
     * row of chips below, this reads as a third band of controls; given room on both sides
     * it reads as an aside, which is what social proof is meant to be. The hairline does the
     * same job at one pixel — it separates without drawing a card, and fades out to the
     * right so it never looks like the top edge of a container.
     */
    <div
      className="mt-12 flex animate-fade-up flex-col gap-5 border-t border-white/10 pt-8 motion-reduce:animate-none lg:mt-14"
      style={{ animationDelay: `${START}ms` }}
    >
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
      {/*
       * The overlap is a negative margin on every circle but the first, so the row reads as
       * a group rather than as four separate things. `ring` rather than `border`: a border
       * would sit inside the 44px box and shrink the circle, and these have to stay the same
       * size as one another to the pixel.
       */}
      <ul className="flex items-center">
        {SUPPORTERS.map((supporter, index) => (
          <li
            key={index}
            className="-ml-3 animate-fade-up first:ml-0 motion-reduce:animate-none"
            // Left to right, 70ms apart — inside the brief's 80–120ms for the headline but
            // tighter here, because four marks arriving as slowly as two lines of display
            // type would read as a separate event rather than a detail.
            style={{ animationDelay: `${START + index * 70}ms` }}
          >
            <span
              className={`grid size-11 place-items-center overflow-hidden rounded-full ring-2 ring-white/90 ${supporter.tint}`}
            >
              {supporter.photo ? (
                <Image
                  src={supporter.photo}
                  alt={supporter.alt}
                  width={44}
                  height={44}
                  className="size-full object-cover object-center"
                />
              ) : (
                <UserRound className="size-5 text-white" aria-hidden="true" />
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">
          {SUPPORTER_COUNT === null ? 'Join our supporters' : `+${SUPPORTER_COUNT} supporters`}
        </p>
        <p className="text-xs text-white/60">People are helping make a difference</p>
      </div>

        {/*
         * Secondary by construction: a text link, not a third button. The hero already has a
         * filled call to action and an outlined one, and a charity page where "donate"
         * competes with "get help" has its priorities the wrong way round.
         *
         * `ms-auto` on the wide breakpoints pushes it to the far end of the row, so the
         * avatars and the count group together and the link sits apart from them rather than
         * trailing the sentence like a fourth word.
         */}
        <Link
          href={PATHS.donate}
          className="group inline-flex items-center gap-1.5 text-sm font-semibold text-gold-400 transition-colors hover:text-gold-300 sm:ms-auto"
        >
          Become a donor
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
    </div>
  );
}

export default SupporterProof;
