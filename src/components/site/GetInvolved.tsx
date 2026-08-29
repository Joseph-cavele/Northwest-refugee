import Link from 'next/link';
import Image from 'next/image';
import { HandHeart, ImageIcon, Play } from 'lucide-react';
import { PATHS } from '@/lib/paths';

/*
 * The two-door band: give your time on the left, give money on the right, and the film in
 * between. Built to a supplied reference — three panels edge to edge, each a photograph
 * behind a colour wash, torn gold seams between them.
 *
 * FOUR THINGS IN IT ARE DELIBERATELY NOT THE REFERENCE'S.
 *
 * NO GREEN. The reference's right-hand panel is dark teal, and DonateBand already records why
 * that cannot be copied: green is not in this palette. The mark's four figures are blue,
 * orange, yellow and red on black, and a fifth hue invented for one band would be the only
 * colour on the site that came from nowhere. So the left panel is the logo's black and the
 * right is the logo's blue — the two grounds that already carry white text elsewhere here.
 *
 * THE PICTURES ARE ILLUSTRATIVE AND NOBODY IN THEM IS A CLIENT. They are generated images in
 * /public/cards-images, and that is the only reason they can be here: a photograph of an
 * identifiable person beside the words "refugee" and "asylum seeker" is a written-consent
 * question, not a layout one. Never caption one with a name, a story or a place. Appeals.tsx
 * carries the same note over the same decision.
 *
 * EACH PANEL STILL HOLDS ITS OWN RESERVATION. `image: null` renders a labelled frame naming
 * what belongs there, and the colour wash paints either way — so a picture can be pulled at
 * any time without the band collapsing, and nothing shifts when a replacement lands.
 *
 * THEY ARE COMPOSED FOR THE WASH, WHICH IS THE PART THAT IS EASY TO GET WRONG. Every one is
 * greyscaled and then covered at 78-82%, with a heading and a button sitting dead centre on
 * top, so almost all detail is lost by design. All three are weighted to the edges of the
 * frame — the family at the left, the queue along the bottom, the corridor's silhouettes down
 * both sides — and their middles are empty. A picture with its subject centred would be a
 * picture nobody ever sees.
 *
 * THE PLAY BUTTON IS NOT A BUTTON UNTIL THERE IS A FILM. It renders as a marker inside the
 * centre reservation — aria-hidden, not focusable, not clickable. A play control that responds
 * to a click by doing nothing is worse than an obviously empty frame: the reader concludes the
 * site is broken rather than unfinished. Give it a video and it becomes a real control.
 *
 * THE COPY IS THE ORGANISATION'S, not "We Give Child A Gift Of A Education". Both headings ask
 * a question the reader can actually answer, and the sub-lines say what the answer costs them
 * — an hour a week, or a fixed amount — because that is the objection standing between someone
 * reading this band and acting on it.
 */

interface Panel {
  /** A path under /public, or null to render the reserved frame. */
  image: string | null;
  /** What the picture shows. Read aloud, so never "background image". */
  imageAlt: string;
  /** What the frame is waiting for, shown while `image` is null. */
  imageBrief: string;
}

const VOLUNTEER: Panel = {
  image: '/cards-images/involved-volunteer.png',
  imageAlt:
    'A volunteer sitting with a mother and her small child, going through a folder of papers on a low table.',
  imageBrief: '4:3 or wider — a volunteer sitting with a family at the office',
};

const DONATE: Panel = {
  image: '/cards-images/involved-donate.png',
  imageAlt:
    'A long queue of people waiting along the front of a low building on a bright morning, seen from across the road.',
  imageBrief: '4:3 or wider — a queue at the door on a weekday morning',
};

/*
 * STILL A STILL. This panel is built for a film and there is not one yet — what fills it is a
 * photograph standing in for the poster frame, which is why the play marker below is still a
 * marker and not a control.
 *
 * TODO(NWHR): when the film exists, put it in /public/videos, replace this with the player,
 * and make the marker a real button. Two minutes is the outside limit for a band like this.
 */
const FILM: Panel = {
  image: '/cards-images/involved-film.png',
  imageAlt:
    'People waiting on chairs down both sides of a corridor, in silhouette against a bright doorway at the far end.',
  imageBrief: '16:9 — the two-minute introduction to NWHR',
};

/*
 * The gold line that traces a torn edge.
 *
 * THE TEAR ITSELF IS A clip-path, in globals.css — `.torn-edge-right` and `.torn-edge-left`.
 * The panel is genuinely cut along that ragged line and the centre photograph is pulled
 * underneath it, so what shows through the tear is the picture next door. This component only
 * draws the gold along the cut.
 *
 * THE NUMBERS BELOW ARE THE SAME NUMBERS AS THE clip-path, in the same order. They are one
 * edge described twice — once as a shape to cut, once as a line to draw — and changing either
 * alone puts a gold line somewhere the panel is not torn. If you regenerate one, regenerate
 * both.
 *
 * `preserveAspectRatio="none"` maps the 0-100 viewBox straight onto the panel, so the polyline
 * lands exactly on the clip whatever the panel's size. `vector-effect="non-scaling-stroke"` is
 * what stops that same stretch from smearing the stroke into a 40px-wide wedge on a wide panel
 * — the geometry stretches, the line width does not.
 */
const TEAR_RIGHT =
  '96.82,0.0 99.56,3.88 97.15,7.48 95.27,11.44 97.85,15.17 94.75,19.75 94.73,22.86 ' +
  '98.22,27.49 99.9,29.82 97.99,34.91 95.11,38.96 97.26,41.2 95.3,43.58 94.37,46.51 ' +
  '96.76,50.1 97.21,54.83 97.1,58.95 96.85,63.14 99.99,66.17 99.07,71.36 96.03,75.68 ' +
  '95.88,78.57 98.64,80.98 99.11,84.38 99.76,87.74 94.2,92.48 99.48,95.31 99.89,98.92 ' +
  '94.62,100.0';

const TEAR_LEFT =
  '3.18,0.0 0.44,3.88 2.85,7.48 4.73,11.44 2.15,15.17 5.25,19.75 5.27,22.86 1.78,27.49 ' +
  '0.1,29.82 2.01,34.91 4.89,38.96 2.74,41.2 4.7,43.58 5.63,46.51 3.24,50.1 2.79,54.83 ' +
  '2.9,58.95 3.15,63.14 0.01,66.17 0.93,71.36 3.97,75.68 4.12,78.57 1.36,80.98 0.89,84.38 ' +
  '0.24,87.74 5.8,92.48 0.52,95.31 0.11,98.92 5.38,100.0';

/**
 * The gold along one panel's torn edge. Decorative, so aria-hidden — it carries no meaning
 * the panels either side do not.
 *
 * Only from lg, like the clip it traces. Below that the panels stack and there is no seam
 * between them to tear; the stacked layout gets a gold rule instead.
 */
function TornEdge({ side }: { side: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-10 hidden size-full lg:block"
    >
      {/*
       * 10, to draw 5. This svg lives INSIDE the clipped panel, so the outer half of a stroke
       * centred on the clip boundary is cut away with everything else outside it — a 5px line
       * would paint as 2.5px. Doubling it puts a clean 5px of gold along the inside of the
       * tear, which is what the reference shows: the torn paper's edge, not a line beside it.
       */}
      <polyline
        points={side === 'left' ? TEAR_LEFT : TEAR_RIGHT}
        fill="none"
        strokeWidth={10}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-gold-400"
      />
    </svg>
  );
}

/** The reserved frame, or the photograph once it exists. Fills whatever panel it is in. */
function PanelImage({ panel, className }: { panel: Panel; className?: string }) {
  if (panel.image) {
    return (
      <Image
        src={panel.image}
        alt={panel.imageAlt}
        fill
        sizes="(min-width: 1024px) 34vw, 100vw"
        /* Greyscale, as in the reference: the photographs are the ground, and three full-colour
           pictures under three colour washes is four palettes fighting in one band. */
        className={'object-cover object-center grayscale ' + (className ?? '')}
      />
    );
  }

  return (
    <div className="absolute inset-0 grid place-items-center p-8 text-center">
      <span className="max-w-xs">
        <ImageIcon
          className="mx-auto size-8 text-white/40"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="mt-3 block text-sm font-semibold text-white/60">
          {panel.imageBrief}
        </span>
      </span>
    </div>
  );
}

export function GetInvolved() {
  return (
    /*
     * THE WHITE BELOW THE BAND IS LOAD-BEARING, not decoration. SiteFooter is bg-ink-950 and
     * so is this band's left panel — set flush against each other, the two blacks are the same
     * black, the band loses its bottom edge and the footer looks like a fourth panel of it.
     * The gap is what makes the band a band.
     *
     * 64px and 128px, DESIGN.md's 32-64-128 rhythm for the space between components, and the
     * same step Appeals uses above it. The background is stated explicitly rather than left to
     * <body>: this is the element drawing the separation, so it has to own the colour that
     * does the separating.
     */
    <section
      aria-labelledby="involved-heading"
      className="bg-white pb-16 font-(family-name:--font-ui) lg:pb-32"
    >
      {/*
       * FULL BLEED, and the only section on this page that is. The reference runs the three
       * panels to both edges of the window, and boxing them into the 1280px container would
       * leave two white margins that make the torn seams look like a mistake rather than a
       * device. The heading the section is named by is therefore visually hidden — the band
       * itself carries two headings, and a third one above them would be a caption nobody
       * asked for.
       */}
      <h2 id="involved-heading" className="sr-only">
        Get involved
      </h2>

      {/*
       * EDGE TO EDGE. No container, no max-width and no padding on this wrapper — the band is
       * the width of the window at every size, which is the one thing about the reference that
       * is not a matter of taste: three panels with white margins beside them are three cards,
       * and the tears between them stop meaning anything.
       *
       * `overflow-hidden` is here for the centre panel's negative margins. It reaches out
       * under both neighbours so its photograph can show through their tears, and without this
       * that overhang would be a horizontal scrollbar on every page of the site.
       */}
      <div className="grid w-full overflow-hidden lg:grid-cols-[1fr_1.05fr_1fr]">
        {/* --- give your time ----------------------------------------------------------- */}
        {/*
         * z-20 over the centre panel's z-0, so this panel sits on top and its clip-path cuts
         * a hole through to the photograph underneath rather than to the page.
         */}
        <div className="torn-edge-right relative z-20 min-h-96 overflow-hidden border-b-4 border-gold-400 bg-ink-950 lg:border-b-0">
          <PanelImage panel={VOLUNTEER} className="opacity-45" />
          {/*
           * The wash, painted over the picture and under the words. 78% of the logo's black
           * takes a greyscale photograph down to where white type on it clears AA at every
           * point of the frame — which a photograph on its own never guarantees, because the
           * sky in the top corner is not the shadow under the desk.
           */}
          <div aria-hidden="true" className="absolute inset-0 bg-ink-950/[0.78]" />
          <TornEdge side="right" />

          {/*
           * lg:pr-16 keeps the words off the tear. The clip eats up to 6% of the panel's width
           * at its deepest, and centred text in an untrimmed box drifts into it.
           */}
          <div className="relative flex min-h-96 flex-col items-center justify-center px-6 py-16 text-center sm:px-10 lg:pr-16">
            <HandHeart className="size-11 text-white" strokeWidth={1.5} aria-hidden="true" />

            <p className="mt-6 text-sm leading-5 font-semibold tracking-[0.05em] text-white/70 uppercase">
              An hour a week is useful
            </p>
            <h3 className="mt-3 text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-balance text-white">
              Become a volunteer?
            </h3>

            <Link
              href={PATHS.contact}
              className="mt-8 inline-flex min-h-12 items-center rounded-full bg-brand-500 px-8 text-xs font-semibold tracking-[0.09em] text-white uppercase transition-colors hover:bg-brand-700"
            >
              Contact now
            </Link>
          </div>
        </div>

        {/* --- the film ----------------------------------------------------------------- */}
        {/*
         * Ordered second in the markup as well as on screen, so the reading order matches the
         * visual one. On mobile it sits between the two doors rather than being pushed to the
         * end — it is the thing that explains both of them.
         */}
        {/*
         * PULLED UNDER BOTH NEIGHBOURS, which is what makes the tears read as tears. The
         * negative margin is wider than the deepest bite the clip takes (6% of a panel, so
         * about 38px on a 1440px window), because a tear that reaches past the underlap would
         * show white through its deepest notches and read as a rendering fault.
         *
         * No wash on this one. The side panels are washed so white type can sit on them; there
         * is no type here, and the reference's centre panel is a bright photograph precisely
         * because it is the one thing in the band that is not asking the reader for anything.
         */}
        <div className="relative z-0 min-h-96 overflow-hidden border-b-4 border-gold-400 bg-ink-800 lg:-mx-12 lg:border-b-0">
          <PanelImage panel={FILM} />

          <div className="relative grid min-h-96 place-items-center p-8">
            {/*
             * THE PLAY BUTTON, DRAWN AS THE REAL THING: gold disc, solid dark triangle, a
             * dashed ring standing off it, and a halo pulsing out from underneath. That is the
             * lockup the reference uses and the one every video player on the web has taught
             * people to recognise.
             *
             * It is still a marker rather than a control, and that has not changed because
             * there is still no film — see the note at the top of this file. aria-hidden keeps
             * it out of a screen reader entirely: announcing "play" for something that cannot
             * play is a worse lie than showing nothing.
             *
             * The triangle is nudged half a pixel right of centre on purpose. A play glyph's
             * optical centre is not its bounding box's centre — its mass is on the left — so a
             * mathematically centred triangle looks like it has slipped backwards.
             */}
            <span aria-hidden="true" className="relative grid size-24 place-items-center">
              {/* The halo. Two of them, offset in time, so the ring never fully clears before
                  the next begins — one alone reads as a blink rather than a pulse. */}
              <span className="absolute inset-0 rounded-full bg-gold-400/50 motion-safe:animate-pulse-ring" />
              <span
                className="absolute inset-0 rounded-full bg-gold-400/50 motion-safe:animate-pulse-ring"
                style={{ animationDelay: '1.3s' }}
              />

              {/* The dashed standoff ring, as in the reference. */}
              <span className="absolute inset-0 rounded-full border-2 border-dashed border-white/70" />

              <span className="relative grid size-[4.5rem] place-items-center rounded-full bg-gold-400 shadow-lg shadow-ink-950/30">
                <Play className="size-7 translate-x-px fill-ink-950 text-ink-950" />
              </span>
            </span>
          </div>
        </div>

        {/* --- give money --------------------------------------------------------------- */}
        <div className="torn-edge-left relative z-20 min-h-96 overflow-hidden bg-brand-500">
          <PanelImage panel={DONATE} className="opacity-35" />
          {/* Brand blue at 82%: the same job as the black wash opposite, in the mark's own
              blue, and white on it stays above 7:1 wherever the photograph is lightest. */}
          <div aria-hidden="true" className="absolute inset-0 bg-brand-500/[0.82]" />
          <TornEdge side="left" />

          <div className="relative flex min-h-96 flex-col items-center justify-center px-6 py-16 text-center sm:px-10 lg:pl-16">
            <HandHeart className="size-11 text-white" strokeWidth={1.5} aria-hidden="true" />

            <p className="mt-6 text-sm leading-5 font-semibold tracking-[0.05em] text-white/80 uppercase">
              Every rand is accounted for
            </p>
            <h3 className="mt-3 text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-balance text-white">
              Make a donation?
            </h3>

            {/* Gold with ink-950 type — white on this yellow is 1.4:1 and is not a button. */}
            <Link
              href={PATHS.donate}
              className="mt-8 inline-flex min-h-12 items-center rounded-full bg-gold-400 px-8 text-xs font-semibold tracking-[0.09em] text-ink-950 uppercase transition-colors hover:bg-gold-500"
            >
              Donate now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GetInvolved;
