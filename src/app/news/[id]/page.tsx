import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  ExternalLink,
  ImageIcon,
  MapPin,
  Monitor,
  Phone,
  Users,
} from 'lucide-react';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { ChatGuide } from '@/components/site/ChatGuide';
import { connectDB } from '@/server/config/db';
import { getPublicEvent } from '@/server/modules/events/event.service';
import { EVENT_MODE_LABELS } from '@/api/events.api';
import type { PublicEvent } from '@/api/events.api';
import { formatDate, formatTime } from '@/lib/dates';
import { PATHS } from '@/lib/paths';
import { ORG } from '@/lib/site';

/*
 * `/news/[id]` — one published event.
 *
 * A DRAFT AND A DELETED EVENT BOTH 404 HERE, and neither is distinguishable from an id that
 * never existed. The service answers 404 rather than 403 for exactly that reason: a 403
 * would confirm that an event with this id exists and is merely hidden, which is the signal
 * that makes an id worth guessing at.
 *
 * WHAT THIS PAGE IS FOR. Somebody deciding whether to spend a taxi fare. So the order of the
 * page is the order of that decision: when, where, who it is for, and only then how to
 * register. "Who it is for" sits above the fold on purpose — it is the single field most
 * likely to save a wasted journey.
 */

const ID_PATTERN = /^[0-9a-fA-F]{24}$/;

async function loadEvent(id: string): Promise<PublicEvent | null> {
  // A malformed id is a 404 without touching the database — the service would throw a cast
  // error rather than a not-found, and a 500 on a bad URL is a worse answer than "no".
  if (!ID_PATTERN.test(id)) return null;

  await connectDB();
  try {
    return await getPublicEvent(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) return { title: 'Event not found' };

  return {
    title: event.title,
    description: event.summary || `${event.title} — ${formatDate(event.startsAt)}, ${ORG.city}.`,
  };
}

export const revalidate = 60;

/** One labelled fact. The icon is decoration; the term is what a screen reader announces. */
function Fact({
  icon: Icon,
  term,
  children,
}: {
  icon: typeof MapPin;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 border-t border-line py-4 first:border-t-0 first:pt-0">
      <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
      <div>
        <dt className="text-sm font-semibold text-body">{term}</dt>
        <dd className="mt-1 text-base leading-6 text-muted">{children}</dd>
      </div>
    </div>
  );
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) notFound();

  const when = event.endsAt
    ? `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`
    : `From ${formatTime(event.startsAt)}`;

  const isOnline = event.mode === 'ONLINE' || event.mode === 'HYBRID';

  return (
    <>
      <SiteNav />

      <main className="font-(family-name:--font-ui)">
        <div className="mx-auto max-w-[64rem] px-4 py-10 lg:px-8 lg:py-16">
          <Link
            href={PATHS.news}
            className="inline-flex items-center gap-2 text-base text-muted underline-offset-4 hover:text-brand-600 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All events
          </Link>

          {event.isCancelled && (
            /*
             * FIRST, ABOVE THE TITLE, AND IN WORDS. A cancelled event stays on the site so
             * that somebody who saw the notice finds out here rather than at a locked door —
             * which only works if the cancellation is the first thing on the page.
             */
            <p
              role="status"
              className="mt-6 rounded-xl bg-danger-700 px-5 py-4 text-base font-semibold text-white"
            >
              This event has been cancelled. Please do not travel to it. Phone{' '}
              <a href={ORG.phoneHref} className="underline underline-offset-4">
                {ORG.phone}
              </a>{' '}
              if you need help.
            </p>
          )}

          <h1 className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-[1.12] font-bold tracking-[-0.02em] text-balance text-body">
            {event.title}
          </h1>

          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-semibold text-brand-700">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-5" aria-hidden="true" />
              {formatDate(event.startsAt)}
            </span>
            <span className="inline-flex items-center gap-2 text-muted">
              <Clock className="size-5" aria-hidden="true" />
              {when}
            </span>
          </p>

          {/* --- the poster ------------------------------------------------------------- */}
          <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl bg-ink-50">
            {event.imageUrl ? (
              <Image
                src={event.imageUrl}
                alt={event.title}
                fill
                priority
                sizes="(min-width: 1024px) 64rem, 100vw"
                className="object-cover"
              />
            ) : (
              <div aria-hidden="true" className="grid h-full place-items-center">
                <ImageIcon className="size-10 text-line-strong" strokeWidth={1.5} />
              </div>
            )}
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
            {/* --- what it is --------------------------------------------------------- */}
            <div>
              {event.summary && (
                <p className="text-lg leading-8 text-pretty text-body">{event.summary}</p>
              )}

              {event.description && (
                /*
                 * `whitespace-pre-line`, so the paragraph breaks an officer typed into the
                 * dashboard survive to the page. The field is plain text and is rendered as
                 * plain text — no markdown, no HTML, nothing that would let a description
                 * put markup on a public page.
                 */
                <div className="mt-6 text-base leading-7 whitespace-pre-line text-muted">
                  {event.description}
                </div>
              )}

              {event.registrationInfo && (
                <section aria-labelledby="registration" className="mt-10">
                  <h2 id="registration" className="text-xl font-bold tracking-[-0.01em] text-body">
                    How to register
                  </h2>
                  <p className="mt-3 text-base leading-7 whitespace-pre-line text-muted">
                    {event.registrationInfo}
                  </p>

                  {event.registrationUrl && (
                    <a
                      href={event.registrationUrl}
                      /*
                       * `noopener noreferrer` on every outbound link: `noopener` because a
                       * page opened with `target=_blank` can otherwise navigate this tab,
                       * and `noreferrer` because the site somebody came from should not be
                       * handed to a third party when the page they left is about asylum.
                       */
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-500 px-7 text-sm font-bold tracking-[0.05em] text-white uppercase transition-colors hover:bg-brand-700"
                    >
                      Register for this event
                      <ExternalLink className="size-4" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </section>
              )}
            </div>

            {/* --- the practical facts ------------------------------------------------ */}
            <aside>
              <dl className="rounded-2xl border border-line bg-white p-5">
                <Fact icon={CalendarDays} term="Date and time">
                  {formatDate(event.startsAt)}
                  <span className="block">{when}</span>
                </Fact>

                <Fact icon={event.mode === 'ONLINE' ? Monitor : MapPin} term="Where">
                  <span className="block font-medium text-body">
                    {EVENT_MODE_LABELS[event.mode]}
                  </span>
                  {event.venue && <span className="block">{event.venue}</span>}
                  {event.address && <span className="block text-sm">{event.address}</span>}
                  {isOnline && event.onlineUrl && (
                    <a
                      href={event.onlineUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-600 underline underline-offset-4"
                    >
                      Joining link
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </Fact>

                {event.audience && (
                  <Fact icon={Users} term="Who it is for">
                    {event.audience}
                  </Fact>
                )}

                <Fact icon={Phone} term="Contact">
                  {/* The event's own contact where there is one; the office's number
                      otherwise, because a page about an event with no way to ask a question
                      about it is an unfinished page. */}
                  {event.contact ? (
                    <span className="block whitespace-pre-line">{event.contact}</span>
                  ) : (
                    <span className="block">Ask at the {ORG.shortName} office.</span>
                  )}
                  <a
                    href={ORG.phoneHref}
                    className="mt-2 block font-semibold text-brand-600 underline underline-offset-4"
                  >
                    {ORG.phone}
                  </a>
                  <span className="mt-2 block text-sm text-subtle">{ORG.address}</span>
                </Fact>
              </dl>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
      <ChatGuide />
    </>
  );
}
