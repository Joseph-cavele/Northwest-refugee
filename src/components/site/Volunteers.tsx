import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, ImageIcon } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { SectionHeading } from './SectionHeading';
import { MemberSocials } from './MemberSocials';
import type { MemberLink } from './MemberSocials';
import { ROLE_LABELS } from '@/types/enums';
import { PATHS } from '@/lib/paths';

/*
 * "Meet our volunteers" — four cards to a supplied reference: portrait, name, role, a plus
 * badge on the corner of the picture, and one action underneath.
 *
 * NOBODY IS NAMED, AND THAT IS THE POINT OF THE VERSION THAT SHIPS. The reference fills its
 * cards with Michel Fokluz, Arian Drobloas and two more invented people. Invented volunteers
 * on a real organisation's page are not lorem — they are four people who do not volunteer
 * here, in front of a funder who might ask to meet one. The opposite mistake costs more: a
 * volunteer's name and face beside the words "refugee" and "asylum seeker" identifies them as
 * working with people whose own safety can depend on discretion. That is a written-consent
 * question, and About.tsx already refused a named face over it.
 *
 * SO THE WORK IS REAL AND THE PEOPLE ARE RESERVATIONS. Every card names something volunteers
 * here actually do, and `role` comes from types/enums.ts — the same map the dashboard renders
 * a user's role from, so this page cannot advertise a post the register does not recognise.
 * The name slot reads as scaffolding until somebody has agreed to appear.
 *
 * THE JOB IS THE HEADING, NOT THE DECORATION. Four cards each labelled "Volunteer" and nothing
 * else — which is what the reference does — is four identical cards: the label is true and
 * carries no information, and the row could be one card repeated. What distinguishes a
 * volunteer here is the work, so the work is what each card leads with, and it is also the one
 * thing a reader deciding whether to volunteer is actually scanning for.
 *
 * THE PORTRAITS ARE ILLUSTRATIVE AND NOBODY IN THEM VOLUNTEERS HERE. They are generated
 * images, and that is the only reason a face can be on this card at all while consent is
 * outstanding — the same call Appeals.tsx and GetInvolved.tsx record. Replace each one as its
 * volunteer agrees, and never caption one with a name it does not belong to.
 *
 * TODO(NWHR): the four shipped here are all men, which the design folder decided rather than
 * anybody choosing it — the only other portraits in it are unusable for this row. An
 * organisation with a women and youth pillar cannot have an all-male volunteer wall; commission
 * or generate at least two women before this page is published.
 *
 * TODO(NWHR): for each volunteer willing to appear — record the consent, then set `name`, the
 * photograph and their real profile links. Anyone who would rather not can stay as they are: a
 * card showing only the work is complete, and the row does not care how many are filled in.
 */

interface Volunteer {
  id: string;
  /** What they do here. The card leads with this — see the note above. */
  work: string;
  /** The post, from the register's own vocabulary. */
  role: string;
  /** Their name, once they have agreed to appear. Null renders the reservation. */
  name: string | null;
  /** A path under /public, or null to render the reserved frame. */
  image: string | null;
  /** What the picture shows. Read aloud, so never "team photo". */
  imageAlt: string;
  /** What the frame is waiting for, shown while `image` is null. */
  imageBrief: string;
  /**
   * Their own profiles. Empty or absent renders no plus — see MemberSocials.
   *
   * PERSONAL ACCOUNTS, NOT THE ORGANISATION'S. Sending four cards to the same NWHR page
   * would be four controls that all do the same thing while claiming to be four people's.
   */
  socials?: MemberLink[];
}

/*
 * PLACEHOLDER PROFILE LINKS. Every one lands on a platform's home page rather than anybody's
 * account — the same thing SOCIAL_LINKS in lib/site.ts already does, and it carries the same
 * warning: they are here so the disclosure can be reviewed, and they become a broken promise
 * the moment a reader presses one expecting a person.
 *
 * TODO(NWHR): per person, and only with the same recorded consent the name needs — replace
 * with their real profiles, or delete the `socials` line. A card without one drops the plus
 * and is complete without it. Do this before the page is published.
 */
const PLACEHOLDER_SOCIALS: MemberLink[] = [
  { platform: 'facebook', href: 'https://www.facebook.com/' },
  { platform: 'instagram', href: 'https://www.instagram.com/' },
  { platform: 'linkedin', href: 'https://www.linkedin.com/' },
];

/*
 * The four kinds of help, in the order somebody encounters them: getting through the door,
 * being understood, getting a child placed, and the week-to-week work that follows.
 * Interpreting is second rather than first because it is the one that decides whether any of
 * the rest can happen at all.
 */
const VOLUNTEERS: Volunteer[] = [
  {
    id: 'home-affairs',
    work: 'Home Affairs trips',
    role: ROLE_LABELS.VOLUNTEER,
    name: null,
    image: '/cards-images/volunteer-home-affairs.jpg',
    imageAlt:
      'A man in a linen shirt sitting at a café table, turned towards the camera.',
    imageBrief: 'Portrait 4:5 — outside the Home Affairs office',
    socials: PLACEHOLDER_SOCIALS,
  },
  {
    id: 'interpreting',
    work: 'Interpreting',
    role: ROLE_LABELS.VOLUNTEER,
    name: null,
    image: '/cards-images/volunteer-interpreting.jpg',
    imageAlt:
      'A man in a brightly patterned shirt smiling, against a painted yellow wall.',
    imageBrief: 'Portrait 4:5 — at the front desk, mid-conversation',
    socials: PLACEHOLDER_SOCIALS,
  },
  {
    id: 'school-placements',
    work: 'School placements',
    role: ROLE_LABELS.VOLUNTEER,
    name: null,
    image: '/cards-images/volunteer-school-placements.jpg',
    imageAlt:
      'A man in a yellow and white striped jumper smiling, in a room with soft daylight behind him.',
    imageBrief: 'Portrait 4:5 — with a folder of enrolment forms',
    socials: PLACEHOLDER_SOCIALS,
  },
  {
    id: 'skills-workshops',
    work: 'Skills workshops',
    role: ROLE_LABELS.VOLUNTEER,
    name: null,
    image: '/cards-images/volunteer-skills-workshops.jpg',
    imageAlt:
      'A man in a work apron smiling, warm lights out of focus behind him.',
    imageBrief: 'Portrait 4:5 — in the training room',
    socials: PLACEHOLDER_SOCIALS,
  },
];

export function Volunteers() {
  return (
    /*
     * White ground, ink-100 cards — the reference's relationship, and the clearer of the two
     * this section has worn. Against the body's own ink-50 the cards were a single step darker
     * and barely read as cards at all; white pushes the ground away from them instead of the
     * cards forward off it, so the row separates without anything having to shout.
     *
     * It also puts a white band between the black get-involved panels above and the canvas
     * below, which is the break this part of the page was missing.
     */
    <section aria-labelledby="volunteers-heading" className="bg-white font-(family-name:--font-ui)">
      {/* DESIGN.md's container and band: 1280px centred, 20px margins on mobile and 64px from
          lg, 64px / 128px vertical. */}
      <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-32">
        <SectionHeading
          eyebrow="Who gives their time"
          title={
            <span id="volunteers-heading">
              Our <span className="text-gold-700">volunteers</span>
            </span>
          }
          lead="Nobody here is paid to sit in a Home Affairs queue for six hours. These are the four things volunteers do most, and an hour a week is genuinely useful."
        />

        <ul className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VOLUNTEERS.map((volunteer, index) => (
            <li key={volunteer.id}>
              {/* Staggered by 100ms, so the row arrives as a row rather than four things at
                  once — and `Reveal` leaves everything visible when JavaScript never lands. */}
              <Reveal delay={index * 100}>
                <VolunteerCard volunteer={volunteer} />
              </Reveal>
            </li>
          ))}
        </ul>

        {/*
         * "Become a volunteer", not "More about us". This section's reader has just looked at
         * four kinds of help and is deciding whether to offer one — sending them to an about
         * page answers a question they are not asking. It is the same destination as the band
         * above, deliberately: two routes to one door, not two doors.
         */}
        <div className="mt-14 flex justify-center">
          <Link
            href={PATHS.contact}
            className="inline-flex min-h-13 items-center gap-2 rounded-full bg-gold-400 px-8 text-xs font-semibold tracking-[0.09em] text-ink-950 uppercase transition-colors hover:bg-gold-500"
          >
            Become a volunteer
            <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function VolunteerCard({ volunteer }: { volunteer: Volunteer }) {
  return (
    /*
     * NO overflow-hidden ON THE ARTICLE, deliberately. The badge straddles the picture's lower
     * edge and the profiles rise out of it, and a clip on the card would cut both off — which
     * is exactly what the first version of this card did to the badge. The picture keeps its
     * own clip, since it needs one for its rounded top and its hover zoom; the card's bottom
     * corners round without one because the body is a plain fill.
     */
    /*
     * ONE MOVEMENT, THREE PARTS. The card lifts, the portrait warms and zooms, and the gold
     * rule under the work grows out to full width — all on the same 500ms and the same
     * --ease-reveal curve the rest of the site animates on, so the card reads as one thing
     * responding rather than three effects firing near each other.
     *
     * ON FOCUS-WITHIN AS WELL AS HOVER. The card holds a real control — the plus — so a
     * keyboard user lands inside it with no pointer to show them which card they are in. The
     * same response answers both.
     *
     * `motion-reduce` keeps the colour and drops the geometry. Somebody who has asked for less
     * movement still gets the feedback that they are on a card; they just do not get a row of
     * four things sliding under the cursor.
     */
    <article className="group h-full rounded-2xl bg-ink-100 transition-[transform,box-shadow] duration-500 ease-reveal hover:-translate-y-1.5 hover:shadow-xl hover:shadow-ink-950/10 focus-within:-translate-y-1.5 focus-within:shadow-xl focus-within:shadow-ink-950/10 motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative">
        <div className="relative aspect-4/5 overflow-hidden rounded-t-2xl bg-ink-200">
          {volunteer.image ? (
            <Image
              src={volunteer.image}
              alt={volunteer.imageAlt}
              fill
              sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
              /*
               * Greyscale until hovered, as in the reference — where two of the four portraits
               * are grey and two are not, which is that same effect caught mid-hover in a
               * screenshot. It holds four portraits shot in four different rooms together as
               * one row, and the colour returning on hover is what makes a card feel like a
               * person again rather than a tile.
               */
              className="object-cover object-center grayscale transition-[filter,transform] duration-500 ease-reveal group-hover:scale-[1.03] group-hover:grayscale-0 group-focus-within:scale-[1.03] group-focus-within:grayscale-0 motion-reduce:transform-none motion-reduce:transition-[filter]"
            />
          ) : (
            <div className="grid h-full place-items-center border-2 border-dashed border-line-strong p-4 text-center">
              <span>
                <ImageIcon
                  className="mx-auto size-7 text-line-strong"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="mt-2 block text-xs font-semibold text-subtle">
                  {volunteer.imageBrief}
                </span>
              </span>
            </div>
          )}
        </div>

        {/*
         * Half on the picture and half off it, as the reference has it, and outside the
         * picture's clip so neither the badge nor the profiles above it get cut.
         *
         * `who` falls back to the work while the person is a reservation: "Interpreting
         * volunteer on Instagram" is an honest label for a link nobody has put a name to yet.
         */}
        <MemberSocials
          who={volunteer.name ?? `${volunteer.work} volunteer`}
          links={volunteer.socials ?? []}
          className="absolute right-4 bottom-0 z-10 translate-y-1/2"
        />
      </div>

      {/*
       * THE FOOT TURNS OVER ON HOVER — ink-100 to the logo's black, with the type inverting
       * with it. It is the one place on this card where the colour change is doing work rather
       * than decorating: the row is four near-identical light rectangles, and a solid dark foot
       * is legible as "this one" from the far side of the screen in a way a 6px lift is not.
       *
       * The gold rule needs no variant. It was chosen against ink-100 and it is the mark's own
       * pairing against ink-950 — the one colour here that is right on both grounds.
       *
       * `rounded-b-2xl` on this block rather than a clip on the card: the card cannot clip, or
       * it would cut the badge straddling the picture above.
       */}
      <div className="rounded-b-2xl px-5 pt-8 pb-6 transition-colors duration-500 ease-reveal group-hover:bg-ink-950 group-focus-within:bg-ink-950">
        {/*
         * The gold rule HowItWorks uses under its step numbers, borrowed and made to move. It
         * is a quarter of its width at rest, so it is a mark rather than an animation waiting
         * to happen, and it grows from the left — the direction the words under it are read.
         *
         * scaleX, not width: a transform is composited, where animating width would relayout
         * the card body four times over on a row of four. `origin-left` is what makes it grow
         * rather than spread.
         */}
        <span
          aria-hidden="true"
          className="mb-4 block h-0.5 w-16 origin-left scale-x-[0.25] rounded-full bg-gold-400 transition-transform duration-500 ease-reveal group-hover:scale-x-100 group-focus-within:scale-x-100 motion-reduce:transition-none"
        />

        <h3 className="text-base leading-6 font-extrabold tracking-[-0.02em] text-ink-950 transition-colors duration-500 ease-reveal group-hover:text-white group-focus-within:text-white">
          {volunteer.work}
        </h3>

        {volunteer.name ? (
          <p className="mt-1.5 text-sm leading-5 text-muted transition-colors duration-500 ease-reveal group-hover:text-white/70 group-focus-within:text-white/70">
            {volunteer.name} · {volunteer.role}
          </p>
        ) : (
          /*
           * The reservation says what is missing AND why, because the two are one fact here.
           * A blank line reads as a bug and a stand-in name reads as true — this reads as
           * neither, which is the only honest option while consent is outstanding.
           */
          <p className="mt-1.5 text-sm leading-5 text-subtle italic transition-colors duration-500 ease-reveal group-hover:text-white/70 group-focus-within:text-white/70">
            {volunteer.role} · name once consent is recorded
          </p>
        )}
      </div>
    </article>
  );
}

export default Volunteers;
