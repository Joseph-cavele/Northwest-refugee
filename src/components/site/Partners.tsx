import Image from 'next/image';

/*
 * The partners section: one partner, presented properly.
 *
 * ONE ENTRY IS THE DESIGN, not a gap waiting to be filled. A logo row is a claim — a funder
 * reads it as "somebody has already vouched for these people" — so it holds organisations
 * that have actually agreed to appear and nothing else. No placeholders, no invented names,
 * no carousel dots for a carousel of one.
 *
 * WHAT WAS AND WAS NOT DONE TO THE LOGO, since the brief was explicit that it must not be
 * altered. Nothing inside the mark was touched: not the figures, not the rings, not the
 * stars, and not either piece of type — "South African Refugee Led Network" around the top
 * and "SARLN" across the bottom are both still part of the image, uncropped and unrecoloured.
 *
 * The only change is the BACKGROUND behind it. The supplied file is 24-bit with no alpha and
 * its corners sample at #FDFDFE — near-white, but not this card's white — so it would have
 * rendered as a faint square. The near-white was made transparent at the original 1254px and
 * the result downscaled to 768, so the alpha edge resolves smoothly rather than fringing.
 * On a white card it is pixel-for-pixel what was supplied. The untouched original is still
 * at design/partner-logo.png if it is ever wanted.
 *
 * NO "SARLN" CAPTION under the name, as instructed — the abbreviation is already set into
 * the bottom of the mark, and printing it again underneath would read as a stutter.
 */

interface Partner {
  name: string;
  logo: string;
  /**
   * The organisation's own site. Left undefined rather than guessed — a partner logo linking
   * to the wrong domain is worse than one that does not link at all.
   */
  href?: string;
}

const PARTNERS: Partner[] = [
  {
    name: 'South African Refugee Led Network',
    logo: '/images/partners/sarln.png',
  },
];

export function Partners() {
  if (PARTNERS.length === 0) return null;

  return (
    <section
      aria-labelledby="partners-heading"
      className="bg-white font-(family-name:--font-ui)"
    >
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-20">
        {/*
         * A heading, where a bare logo would be ambiguous. A mark on a page can mean funder,
         * partner, accreditation or client, and which one it is changes what it is worth —
         * and to a screen reader an unlabelled image says nothing at all. The short blue rule
         * above it is the section's only decoration.
         */}
        <div className="flex flex-col items-center">
          <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-brand-200" />
          <h2
            id="partners-heading"
            className="mt-4 text-sm font-semibold tracking-[0.16em] text-muted uppercase"
          >
            Our partners
          </h2>
        </div>

        <ul className="mt-10 flex flex-wrap items-start justify-center gap-10">
          {PARTNERS.map((partner) => (
            <li key={partner.name} className="flex max-w-xl flex-col items-center text-center">
              {/*
               * The card. A thin light-blue edge and a very soft, wide shadow — enough to
               * lift it off the white without becoming a box with a drop shadow. The logo is
               * round, so the padding is generous on all four sides or the circle looks
               * wedged into a square.
               */}
              <div className="rounded-3xl border border-brand-100 bg-white p-8 shadow-[0_20px_50px_rgba(52,76,183,0.07)] sm:p-12">
                <Image
                  src={partner.logo}
                  // The organisation's name, never "logo" — a screen reader already announces
                  // that this is an image.
                  alt={partner.name}
                  width={768}
                  height={768}
                  // 208px on a phone, 288px from sm — the 768 source covers the larger of
                  // those at better than 2.5x, so it stays crisp on a retina screen.
                  className="size-52 object-contain sm:size-72"
                />
              </div>

              <p className="mt-8 text-xl font-bold tracking-[-0.01em] text-body sm:text-2xl">
                {partner.name}
              </p>

              <p className="mt-3 max-w-md text-base leading-7 text-muted">
                Working together to strengthen refugee-led communities and create meaningful
                change.
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default Partners;
