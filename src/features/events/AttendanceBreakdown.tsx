'use client';

import { useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { AGE_BANDS, getAttendanceBreakdown } from '@/api/events.api';
import type { AttendanceBreakdown as Breakdown } from '@/api/events.api';
import { GENDERS, GENDER_LABELS } from '@/types/enums';
import type { Id } from '@/types/models';
import { formatCount } from '@/lib/format';

/*
 * Who came, as a tally.
 *
 * THIS IS THE FUNDER'S VIEW AND IT DELIBERATELY CANNOT BE READ BACK TO A PERSON. The
 * participant rows exist and are listable, but nothing here fetches them: a community
 * event's attendees have mostly consented to nothing, and a demographic rollup answers
 * every question a report asks without naming anybody. Do not "improve" this panel by
 * listing individuals beside it.
 *
 * ONE HUE, NOT EIGHT. Age band and gender are each ONE measure — a headcount — spread
 * across ordered buckets, not eight or four competing identities. Colouring each bar
 * differently would be colour carrying no information, and it was checked rather than
 * assumed: the four logo hues fail as a categorical set (gold sits at lightness 0.886, far
 * outside the usable band, and reaches only 1.37:1 against this surface). A single-series
 * chart also needs no legend, which is why there is none.
 *
 * EVERY VALUE IS PRINTED. The bars are reinforcement; the counts and shares are real text,
 * so the panel is fully readable with no colour vision at all and needs no hover to give
 * up its data.
 */

/** A row of the distribution: label, proportional track, and the number in words. */
function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const share = total > 0 ? value / total : 0;

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-sm text-subtle">{label}</span>
      <span className="min-w-0 flex-1">
        {/* Reinforcement only. aria-hidden because the count beside it is the real value —
            a screen reader gains nothing from a second, wordless rendering. */}
        <span
          aria-hidden="true"
          className="block h-2 w-full overflow-hidden rounded-full bg-ink-100"
        >
          <span
            className="block h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(1, share) * 100}%` }}
          />
        </span>
      </span>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-body">
        {formatCount(value)}
        <span className="ml-1.5 text-subtle">{Math.round(share * 100)}%</span>
      </span>
    </div>
  );
}

function Distribution({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
}) {
  // Bands with nobody in them are kept: a gap in the middle of an ordered age range is
  // information — it says the day reached nobody of that age — and dropping empty rows
  // would silently close it up.
  const anything = rows.some((row) => row.value > 0);

  return (
    <div>
      <h3 className="text-xs font-semibold tracking-[0.12em] text-subtle uppercase">
        {title}
      </h3>
      {anything ? (
        <div className="mt-2">
          {rows.map((row) => (
            <Bar key={row.label} label={row.label} value={row.value} total={total} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Not recorded for this event.</p>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <p className="text-xs font-semibold tracking-[0.1em] text-subtle uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-body">{value}</p>
      {hint && <p className="text-sm text-subtle">{hint}</p>}
    </div>
  );
}

export function AttendanceBreakdown({ eventId }: { eventId: Id }) {
  const { data, loading, error } = useApi(
    useCallback((signal: AbortSignal) => getAttendanceBreakdown(eventId, signal), [eventId]),
    [eventId]
  );

  if (loading) return <Spinner label="Loading the attendance breakdown" className="py-10" />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;

  const breakdown: Breakdown = data;

  if (breakdown.total === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-body">
          <BarChart3 className="size-4 text-subtle" aria-hidden="true" />
          Who came
        </h2>
        <p className="mt-2 text-base text-muted">
          No attendance has been recorded yet. Attendees are counted by gender and age band —
          a community event register never asks for names.
        </p>
      </section>
    );
  }

  const genderRows = [
    ...GENDERS.map((g) => ({ label: GENDER_LABELS[g], value: breakdown.byGender[g] ?? 0 })),
    ...(breakdown.byGender.UNKNOWN
      ? [{ label: 'Not recorded', value: breakdown.byGender.UNKNOWN }]
      : []),
  ];

  const ageRows = [
    // Rendered in the server's own band order — an age axis out of order is unreadable.
    ...AGE_BANDS.map((band) => ({ label: band, value: breakdown.byAgeBand[band] ?? 0 })),
    ...(breakdown.byAgeBand.UNKNOWN
      ? [{ label: 'Not recorded', value: breakdown.byAgeBand.UNKNOWN }]
      : []),
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-body">
        <BarChart3 className="size-4 text-subtle" aria-hidden="true" />
        Who came
      </h2>
      <p className="mt-1 text-sm text-subtle">
        Counted, not identified — this is the shape a report is written from.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Attended" value={formatCount(breakdown.total)} />
        <Tile
          label="First time"
          value={formatCount(breakdown.firstTime)}
          hint={
            breakdown.total > 0
              ? `${Math.round((breakdown.firstTime / breakdown.total) * 100)}% of the room`
              : undefined
          }
        />
        <Tile
          label="On the register"
          value={formatCount(breakdown.known)}
          // Named plainly, because the split is the POPIA fact: the rest consented to
          // nothing and nothing identifying was stored about them.
          hint={`${formatCount(breakdown.anonymous)} counted anonymously`}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Distribution title="By gender" rows={genderRows} total={breakdown.total} />
        <Distribution title="By age band" rows={ageRows} total={breakdown.total} />
      </div>
    </section>
  );
}

export default AttendanceBreakdown;
