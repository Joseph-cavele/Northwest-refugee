import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, ImageIcon, MapPin, Monitor, Users } from 'lucide-react';
import { PageBanner } from '@/components/site/PageBanner';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { connectDB } from '@/server/config/db';
import { listPublicEvents } from '@/server/modules/events/event.service';
import { EVENT_MODE_LABELS, EVENT_TYPE_LABELS } from '@/api/events.api';
import type { EventMode, EventType, PublicEvent } from '@/api/events.api';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/lib/dates';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: 'News & events',
  description: `Community meetings, clinics, training and awareness days run by ${ORG.name} in ${ORG.city}. Everything here is open to the people it names — check who each one is for.`,
};

/*
 * `/news` — the public noticeboard, and the seventh marketing route to resolve.
 *
 * NOTHING ON THIS PAGE IS WRITTEN INTO IT. Every event comes from the database, and an event
 * appears here the moment a member of staff presses Publish in the dashboard. There is no
 * deploy in that loop and no developer in it either, which was the point of the whole
 * feature: an organisation that has to phone someone to announce a meeting stops announcing
 * meetings.
 *
 * WHY THIS RENDERS ON THE SERVER RATHER THAN FETCHING FROM THE BROWSER. Every other
 * data-driven screen in this app is a client component talking to `src/api/` — correct for
 * the dashboard, wrong here, for three reasons:
 *
 *   - it must be indexable. A noticeboard nobody can find in a search is a noticeboard on
 *     the inside of a cupboard;
 *   - it must render with no JavaScript at all. This audience is on cheap phones and
 *     borrowed data — the same reasoning that keeps a webfont off this site;
 *   - an internal HTTP hop to our own API to read our own database is a round trip that
 *     buys nothing.
 *
 * This calls the SERVICE, never the model, which is the same layer a route handler occupies
 * — so the published-only condition and the whitelisted projection in `listPublicEvents` are
 * exactly the ones the JSON API uses. `/api/v1/public/events` still exists and is what an
 * external consumer would call; this page simply does not need to go out and come back.
 *
 * WHAT A VISITOR IS NEVER SHOWN: a draft, a deleted event, an attendance figure, the officer
 * who captured it, or the programme it reports against. That is enforced in the service, not
 * here — see the note above `toPublicEvent`.
 */

/* Revalidated rather than dynamic: the noticeboard changes a few times a week, and a minute
   of staleness is invisible to a reader while a rebuild on every request is not. */
export const revalidate = 60;

const MODE_ICON: Record<EventMode, typeof MapPin> = {
  IN_PERSON: MapPin,
  ONLINE: Monitor,
  HYBRID: Monitor,
};

/** The time a reader needs: a start, and an end only when there is one. */
function whenLine(event: PublicEvent) {
  const start = formatTime(event.startsAt);
  return event.endsAt ? `${start} – ${formatTime(event.endsAt)}` : `From ${start}`;
}

function whereLine(event: PublicEvent) {
  if (event.mode === 'ONLINE') return 'Online';
  if (event.venue) return event.mode === 'HYBRID' ? `${event.venue}, and online` : event.venue;
  return EVENT_MODE_LABELS[event.mode];
}

/*
 * One card.
 *
 * BUILT TO THE SUPPLIED REFERENCE: an inset photograph with the card's own white showing
 * around it, a category chip and the date on one line beneath, then the title, then a
 * single line of small detail. Three things in it are deliberately not the reference's.
 *
 * THE CHIP IS THE KIND OF EVENT, NOT A DECORATIVE TAG. The reference colours its chips at
 * random — pink, purple, blue — for pages where the words are placeholder. Here the label
 * is a real category and the colour is fixed to it, so somebody scanning the page learns
 * the vocabulary rather than just seeing confetti.
 *
 * THE WHOLE CARD IS NOT ONE LINK. The reference makes the image, the title and the card
 * clickable, which gives a screen reader three identical links per event and swallows text
 * selection — a visitor cannot copy a venue to paste into a maps app. The title is the
 * link, and the button repeats it with the event's name attached for anyone listening to a
 * list of links.
 *
 * THE DATE IS NOT ABBREVIATED. The reference sets "2024-01-08". This audience reads in a
 * second language and a numeric date is ambiguous across the languages the office works in,
 * so it is spelled out.
 */

const CHIP_TONE: Record<EventType, string> = {
  AWARENESS: 'bg-gold-50 text-gold-700',
  OUTREACH: 'bg-brand-50 text-brand-700',
  COMMUNITY_DIALOGUE: 'bg-accent-50 text-accent-800',
  TRAINING: 'bg-success-50 text-success-700',
  COMMEMORATION: 'bg-ink-100 text-ink-600',
  FUNDRAISER: 'bg-brand-50 text-brand-700',
  STAKEHOLDER_MEETING: 'bg-ink-100 text-ink-600',
  OTHER: 'bg-ink-100 text-ink-600',
};

function EventCard({ event }: { event: PublicEvent }) {
  const ModeIcon = MODE_ICON[event.mode];

  return (
    <li>
      <article className="flex h-full flex-col rounded-2xl border border-line bg-white p-3 transition-shadow duration-200 hover:shadow-lift motion-reduce:transition-none">
        {/* --- the poster, inset, or the space kept for one ------------------------- */}
        <div className="relative aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-ink-50">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              /*
               * The title, not "event image". This is read aloud, and nine cards each
               * announcing "event image" tell a screen-reader user nothing about which
               * one they are on.
               */
              alt={event.title}
              fill
              sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div aria-hidden="true" className="grid h-full place-items-center">
              <ImageIcon className="size-8 text-line-strong" strokeWidth={1.5} />
            </div>
          )}

          {event.isCancelled && (
            /*
             * A cancelled event STAYS on the page rather than disappearing, which is why
             * this has to be unmissable: somebody read the notice last week and may be
             * about to spend a taxi fare getting here.
             */
            <p className="absolute inset-x-0 bottom-0 bg-danger-700 px-3 py-2 text-center text-sm font-bold tracking-[0.05em] text-white uppercase">
              Cancelled
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col px-2 pt-4 pb-2">
          {/* --- the chip and the date, on one line --------------------------------- */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-1 text-xs font-bold tracking-[0.06em] uppercase',
                CHIP_TONE[event.type]
              )}
            >
              {EVENT_TYPE_LABELS[event.type]}
            </span>
            <span className="text-sm font-medium text-subtle">
              {formatDate(event.startsAt)}
            </span>
          </p>

          <h2 className="mt-3 text-lg leading-6 font-bold tracking-[-0.01em] text-balance text-body">
            <Link
              href={`${PATHS.news}/${event.id}`}
              className="underline-offset-2 hover:text-brand-600 hover:underline"
            >
              {event.title}
            </Link>
          </h2>

          {event.summary && (
            /* Two lines, clamped. A card is a decision, not the page. */
            <p className="mt-2 line-clamp-2 text-base leading-6 text-muted">{event.summary}</p>
          )}

          {/* --- the practical line: when, where, who for --------------------------- */}
          <dl className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
            <div className="flex gap-2">
              <dt className="sr-only">Time</dt>
              <Clock className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <dd>{whenLine(event)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">Where</dt>
              <ModeIcon className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <dd className="line-clamp-1">{whereLine(event)}</dd>
            </div>
            {event.audience && (
              <div className="flex gap-2">
                <dt className="sr-only">Who it is for</dt>
                <Users className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                <dd className="line-clamp-1">{event.audience}</dd>
              </div>
            )}
          </dl>

          {/* mt-auto lines the buttons up across a row of cards of unequal height. */}
          <div className="mt-auto pt-4">
            <Link
              href={`${PATHS.news}/${event.id}`}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand-500 px-5 text-xs font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-brand-700"
            >
              View event
              <span className="sr-only">: {event.title}</span>
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ past?: string }>;
}) {
  const { past } = await searchParams;
  const showPast = past === 'true';

  await connectDB();
  /*
   * The cast is the JS/TS boundary, and it is the only one on this page. `src/server/` is
   * plain JavaScript by design — see CLAUDE.md — so a service function has no type to carry
   * across. `PublicEvent` in the api layer is the same shape `toPublicEvent` builds, and the
   * two are asserted against each other by the public JSON route, which returns exactly this
   * and is typed by that interface. If they ever drift, they drift together.
   */
  const { data: events, meta } = (await listPublicEvents({
    page: 1,
    limit: 24,
    past: showPast,
  })) as { data: PublicEvent[]; meta: { total: number } };

  return (
    <>
      <SiteNav />

      <main>
        <PageBanner
          eyebrow="News & events"
          title={
            <>
              What is happening at <span className="text-gold-400">{ORG.shortName}</span>
            </>
          }
          lead="Community meetings, clinics, training and awareness days. Check who each one is for before you travel."
          image={{
            /*
             * SUPPLIED ARTWORK, AND THE BANNER IS THE ONE PLACE IT WORKS. PageBanner converts
             * its picture to greyscale and lays an 88%-to-70% wash over it, so what reaches
             * the page is a tonal texture behind white type rather than a photograph anybody
             * reads as a depiction. That treatment is what makes a picture whose setting is
             * not Rustenburg survivable here and nowhere else on the site.
             */
            src: '/cards-images/image.png',
            alt: '',
            brief: 'Wide photograph — a community meeting or workshop in progress',
          }}
          breadcrumb={[{ label: 'Home', href: PATHS.home }]}
        />

        <section className="bg-canvas font-(family-name:--font-ui)">
          <div className="mx-auto max-w-[80rem] px-4 py-16 lg:px-8 lg:py-24">
            {/*
              * Upcoming and past, as two links rather than a filter control. They are real
              * URLs, so a reader can bookmark the archive and a search engine can index it —
              * neither of which is true of a button that swaps a list in place.
              */}
            <nav aria-label="Which events to show" className="flex flex-wrap gap-2">
              {[
                { label: 'Coming up', active: !showPast, href: PATHS.news },
                { label: 'Past events', active: showPast, href: `${PATHS.news}?past=true` },
              ].map((tab) => (
                <Link
                  key={tab.label}
                  href={tab.href}
                  aria-current={tab.active ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full px-5 text-sm font-bold tracking-[0.05em] uppercase transition-colors ${
                    tab.active
                      ? 'bg-ink-950 text-white'
                      : 'border border-line bg-white text-muted hover:border-line-strong hover:text-body'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>

            {events.length === 0 ? (
              /*
               * An empty noticeboard is a normal state for a small organisation, not a fault,
               * and it says what to do instead rather than apologising. The office is open
               * whether or not anything is scheduled — that is the useful fact here.
               */
              <div className="mt-12 rounded-2xl border border-line bg-white px-6 py-16 text-center">
                <p className="text-lg font-semibold text-body">
                  {showPast ? 'Nothing in the archive yet.' : 'Nothing is scheduled at the moment.'}
                </p>
                <p className="mx-auto mt-2 max-w-md text-base leading-7 text-muted">
                  The office is open whether or not there is an event on. Come in, or phone{' '}
                  <a
                    href={ORG.phoneHref}
                    className="font-semibold text-brand-600 underline underline-offset-4"
                  >
                    {ORG.phone}
                  </a>
                  , and somebody will help you.
                </p>
              </div>
            ) : (
              <>
                <p className="mt-8 text-sm text-subtle">
                  {meta.total} {meta.total === 1 ? 'event' : 'events'}
                  {showPast ? ' in the archive' : ' coming up'}
                </p>
                <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
      <ChatGuide />
    </>
  );
}
