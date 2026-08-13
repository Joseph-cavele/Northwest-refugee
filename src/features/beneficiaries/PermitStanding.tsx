import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dates';
import { IMMIGRATION_STATUS_LABELS } from '@/types/enums';
import type { ImmigrationStatus } from '@/types/enums';
import { describePermit } from './lib/permit';

/*
 * The permit, at the top of the record and at the size of the decision it drives.
 *
 * WHY THIS IS THE FIRST THING ON THE PAGE and not a row in a table of fields: a permit
 * decides whether a person may work, rent a room, enrol a child in school, or be detained
 * at a roadblock. Everything else on this record — household size, languages, address — is
 * context for a conversation. This is the conversation. An admin layout that gives it the
 * same visual weight as "Province: North West" is arranging the facts by database column
 * rather than by what a caseworker has to act on before the person leaves the office.
 *
 * THE TIMELINE IS DATA, NOT DECORATION. The filled portion is literally the share of this
 * permit's validity already spent, computed from the issue and expiry dates on the record.
 * It is drawn only when both dates are known — see the null `elapsed` case in lib/permit.ts,
 * which exists so the bar can never imply a measurement it did not make.
 *
 * It is also aria-hidden. The headline, the countdown and both dates are already text; a
 * screen reader gains nothing from a second, wordless rendering of the same fact.
 */

export interface PermitStandingProps {
  immigrationStatus: ImmigrationStatus;
  permitType: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  /** The server's `permitExpired` virtual — it beats the browser clock. */
  serverSaysExpired: boolean | null;
  /** One instant for the whole screen, fixed on mount by the parent. */
  now: number;
}

/** Per state: the rule down the left, the wash behind it, and the filled part of the track. */
const TONES = {
  EXPIRED: { rule: 'border-l-danger-500', wash: 'bg-danger-50', fill: 'bg-danger-500' },
  EXPIRING: { rule: 'border-l-accent-500', wash: 'bg-accent-50', fill: 'bg-accent-500' },
  VALID: { rule: 'border-l-success-500', wash: 'bg-surface', fill: 'bg-success-500' },
  NONE: { rule: 'border-l-ink-300', wash: 'bg-sunken', fill: 'bg-ink-300' },
} as const;

export function PermitStanding({
  immigrationStatus,
  permitType,
  issuedAt,
  expiresAt,
  serverSaysExpired,
  now,
}: PermitStandingProps) {
  const standing = describePermit({ expiresAt, issuedAt, now, serverSaysExpired });
  const tone = TONES[standing.kind];

  // The headline is the number a caseworker repeats out loud; the line under it is the
  // date they write down. Both, always — "in 12 days" without the date is unactionable,
  // and the date without the count is a subtraction done under pressure.
  const { headline, detail } = (() => {
    switch (standing.kind) {
      case 'EXPIRED':
        return {
          headline: `${standing.days} ${standing.days === 1 ? 'day' : 'days'} overdue`,
          detail: `Permit expired ${formatDate(expiresAt)}. Renewal comes before anything else on this record.`,
        };
      case 'EXPIRING':
        return {
          headline: standing.days === 0 ? 'Expires today' : `${standing.days} ${standing.days === 1 ? 'day' : 'days'} left`,
          detail: `Permit expires ${formatDate(expiresAt)}. This person is on the renewal queue.`,
        };
      case 'VALID':
        return {
          headline: 'Permit valid',
          detail: `Until ${formatDate(expiresAt)} — ${standing.days} days left.`,
        };
      case 'NONE':
        return {
          headline: 'No permit recorded',
          // Said plainly so it does not read as a missing field somebody should go and
          // fill in. Undocumented is a large share of the people NWHR serves.
          detail: 'Not a gap in the record — many of the people NWHR serves are undocumented.',
        };
    }
  })();

  return (
    <section
      aria-label="Permit standing"
      className={cn('rounded-xl border border-line border-l-4 p-5', tone.rule, tone.wash)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[0.6875rem] font-semibold tracking-[0.14em] text-subtle uppercase">
            Permit standing
          </h2>
          <p className="mt-1.5 text-[1.375rem] leading-tight font-semibold tracking-[-0.015em] text-body">
            {headline}
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted">{detail}</p>
        </div>

        <div className="text-sm sm:text-right">
          <p className="font-medium text-body">{IMMIGRATION_STATUS_LABELS[immigrationStatus]}</p>
          {permitType && <p className="mt-0.5 text-muted">{permitType}</p>}
        </div>
      </div>

      {standing.elapsed !== null && (
        <div className="mt-5" aria-hidden="true">
          <div className="flex items-baseline justify-between gap-4 text-xs text-subtle">
            <span>Issued {formatDate(issuedAt)}</span>
            <span>Expires {formatDate(expiresAt)}</span>
          </div>
          <div className="relative mt-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
              <div
                className={cn('h-full rounded-full', tone.fill)}
                style={{ width: `${standing.elapsed * 100}%` }}
              />
            </div>
            {/*
              * The tick is what makes this a timeline rather than a progress meter: it
              * marks where today falls between the two dates. Dropped once the permit has
              * expired, where the fill already runs to the end and a tick on the edge would
              * claim today and the expiry date are the same day.
              */}
            {standing.kind !== 'EXPIRED' && (
              <span
                className="absolute -top-0.5 h-2.5 w-px bg-ink-700"
                style={{ left: `${standing.elapsed * 100}%` }}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default PermitStanding;
