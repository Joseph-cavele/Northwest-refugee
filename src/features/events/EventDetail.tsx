'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Globe, MapPin, Pencil, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, getEvent, organiserOf } from '@/api/events.api';
import { AttendanceBreakdown } from './AttendanceBreakdown';
import { describeTurnout } from './lib/turnout';
import { PILLAR_LABELS } from '@/types/enums';
import type { Id } from '@/types/models';
import { formatCount } from '@/lib/format';
import { formatDate, formatDateTime, formatTime } from '@/lib/dates';

/*
 * One event, and who came to it.
 *
 * The headline is the turnout against what was planned for — the single figure anyone
 * writing a report or briefing a funder is looking for. The breakdown beneath it is the
 * only account of the attendees this screen gives, and it is a tally by design: see the
 * note in AttendanceBreakdown.
 */

export function EventDetail({ id }: { id: Id }) {
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getEvent(id, signal), [id]),
    [id]
  );

  if (loading) return <Spinner label="Loading the event" className="py-24" />;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <BackLink />
        <ErrorAlert error={error}>
          {error.code === 'NOT_FOUND' &&
            'Either no event has that id, or it is outside the events your role covers.'}
        </ErrorAlert>
        <Button variant="subtle" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const event = data;
  const organiser = organiserOf(event);
  const turnout = describeTurnout({
    recorded: event.recordedAttendance,
    expected: event.expectedAttendance,
    status: event.status,
    isPast: event.isPast,
  });

  // The headline, and the sentence under it. Stated as a fact about the day rather than a
  // verdict on it — an under-attended dialogue in the rain is not a failure of anyone's.
  const { headline, detail, tone } = (() => {
    switch (turnout.kind) {
      case 'CANCELLED':
        return { headline: 'Cancelled', detail: 'The event did not take place.', tone: 'text-muted' };
      case 'UPCOMING':
        return {
          headline: turnout.expected > 0 ? `${formatCount(turnout.expected)} expected` : 'Coming up',
          detail:
            turnout.expected > 0
              ? 'Attendance is recorded on the day, against this plan.'
              : 'No attendance target was set for this event.',
          tone: 'text-body',
        };
      case 'NO_TARGET':
        return {
          headline: `${formatCount(turnout.recorded)} attended`,
          detail: 'No target was set, so the count stands on its own.',
          tone: 'text-body',
        };
      case 'SHORT':
        return {
          headline: `${formatCount(turnout.recorded)} attended`,
          detail: `${formatCount(turnout.by)} short of the ${formatCount(turnout.expected)} planned for — ${Math.round(turnout.ratio * 100)}% of target.`,
          tone: 'text-accent-800',
        };
      case 'MET':
        return {
          headline: `${formatCount(turnout.recorded)} attended`,
          detail: `Exactly the ${formatCount(turnout.expected)} planned for.`,
          tone: 'text-success-700',
        };
      case 'OVER':
        return {
          headline: `${formatCount(turnout.recorded)} attended`,
          detail: `${formatCount(turnout.by)} more than the ${formatCount(turnout.expected)} planned for — ${Math.round(turnout.ratio * 100)}% of target.`,
          tone: 'text-success-700',
        };
    }
  })();

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
          {EVENT_TYPE_LABELS[event.type]}
          {event.pillar && ` · ${PILLAR_LABELS[event.pillar]}`}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">{event.title}</h1>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-sm font-semibold text-ink-600">
            {EVENT_STATUS_LABELS[event.status]}
          </span>

          {/*
            * Whether the public can see this, stated on the record rather than only on the
            * edit form. Somebody looking at an event to answer a question about it needs to
            * know whether it is on the website before they answer.
            */}
          {event.publication?.status === 'PUBLISHED' ? (
            <a
              href={`/news/${event._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-sm font-semibold text-success-700 underline-offset-4 hover:underline"
            >
              <Globe className="size-3.5" aria-hidden="true" />
              Live on the site
              <span className="sr-only">(opens the public page in a new tab)</span>
            </a>
          ) : (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-sm font-semibold text-ink-600">
              Draft
            </span>
          )}

          {can(PERMISSIONS.EVENT_UPDATE) && (
            <Link
              href={`/dashboard/events/${event._id}/edit`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Link>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-subtle">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {formatDateTime(event.startsAt)}
            {event.endsAt && ` to ${formatTime(event.endsAt)}`}
          </span>
          {event.venue && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {event.venue}
              {event.address && `, ${event.address}`}
            </span>
          )}
          {organiser && (
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden="true" />
              Organised by {organiser.name}
            </span>
          )}
        </div>

        {event.description && (
          <p className="mt-3 max-w-prose text-base text-muted">{event.description}</p>
        )}
      </header>

      {event.status === 'CANCELLED' && event.cancellationReason && (
        <Alert tone="error">
          <strong className="font-semibold">Cancelled.</strong> {event.cancellationReason}
        </Alert>
      )}

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
          Turnout
        </h2>
        <p className={cn('mt-1.5 text-[1.375rem] leading-tight font-semibold tracking-[-0.015em]', tone)}>
          {headline}
        </p>
        <p className="mt-1 max-w-prose text-base text-muted">{detail}</p>
        {/*
          * No bar. Turnout has no ceiling — 300 at a 200-person dialogue is a real outcome —
          * and a track that pins at 100% would hide the most interesting result there is.
          */}
      </section>

      <AttendanceBreakdown eventId={event._id} />

      <p className="text-sm text-subtle">
        Recorded {formatDate(event.createdAt)}.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/events"
      className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to events
    </Link>
  );
}

export default EventDetail;
