import {
  BookOpen,
  Briefcase,
  FileCheck2,
  HeartHandshake,
  ShieldCheck,
  Users,
} from 'lucide-react';

/*
 * What a donation pays for — the six things, on the donate page.
 *
 * FIVE OF THE SIX ARE THE PROGRAMME PILLARS, in the register's own vocabulary, and the sixth
 * (emergency and basic needs) is the response that runs across all of them. Naming them this
 * way is not tidiness: a donor who directs a gift on the form beside this list picks from the
 * same five, and a funder comparing this page against an annual report should meet one set of
 * words rather than two.
 *
 * NO NUMBERS ON THESE CARDS. Every "R500 feeds a family for a month" on a charity page is a
 * costing somebody has to stand behind, and nobody at NWHR has been asked to. The cards say
 * what the money does; the amounts on the form say how much is being given. Putting the two
 * together is a claim, and it can be made the day the figures are confirmed.
 */

const IMPACTS = [
  {
    id: 'emergency',
    Icon: HeartHandshake,
    title: 'Emergency & basic needs',
    body: 'Food parcels and a safe place to sleep for somebody who arrived at the office with nothing.',
  },
  {
    id: 'documentation',
    Icon: FileCheck2,
    title: 'Documentation & advocacy',
    body: 'Permit applications and renewals, transport to Home Affairs, and referral to legal partners.',
  },
  {
    id: 'education',
    Icon: BookOpen,
    title: 'Education & skills',
    body: 'School placements, uniforms and stationery, and short courses that lead to work.',
  },
  {
    id: 'women-youth',
    Icon: Users,
    title: 'Women, youth & girls',
    body: 'Support groups, safety work, and holiday programmes for young people out of school.',
  },
  {
    id: 'cohesion',
    Icon: ShieldCheck,
    title: 'Social cohesion',
    body: 'Bringing refugee and South African neighbours into the same rooms and the same programmes.',
  },
  {
    id: 'livelihoods',
    Icon: Briefcase,
    title: 'Entrepreneurship & livelihoods',
    body: 'Tools, start-up stock and mentoring for somebody building a small business.',
  },
];

export function ImpactCards() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {IMPACTS.map(({ id, Icon, title, body }) => (
        <li key={id}>
          {/*
           * The hover lift is the same 200ms and the same 6px the volunteer cards use, because
           * a page where three sections each invent their own hover reads as three sites.
           */}
          <article className="group h-full rounded-2xl border border-line bg-surface p-7 transition-all duration-200 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lg hover:shadow-ink-950/5 motion-reduce:transform-none motion-reduce:transition-none">
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-500 group-hover:text-white"
            >
              <Icon className="size-6" strokeWidth={1.75} />
            </span>

            <h3 className="mt-5 text-base leading-6 font-extrabold tracking-[-0.02em] text-ink-950">
              {title}
            </h3>
            <p className="mt-2.5 text-sm leading-6 text-muted">{body}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}

export default ImpactCards;
