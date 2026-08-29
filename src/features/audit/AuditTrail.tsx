'use client';

import { useCallback, useState } from 'react';
import { Eye, KeyRound, ScrollText, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import { actorOf, listAuditActions, listAuditEntries } from '@/api/audit.api';
import type { AuditEntry, ListAuditQuery } from '@/api/audit.api';
import { familyLabel, groupActions, labelOf, weighEntry } from './lib/actions';
import type { EntryWeight } from './lib/actions';
import { ROLE_LABELS } from '@/types/enums';
import type { Role } from '@/types/enums';
import { formatCount } from '@/lib/format';
import { formatDateTime } from '@/lib/dates';

/*
 * The audit trail.
 *
 * This is the screen on which every other invariant in the system becomes checkable. A
 * permit number cannot be read without writing an entry here; a document cannot be fetched
 * without one; an approval names both the maker and the checker. None of that is worth
 * anything if the entries it produces cannot be found.
 *
 * WHAT THE SCREEN IS ORGANISED AROUND. A trail is overwhelmingly routine, and the rows
 * that matter are a thin minority buried in it — so entries are weighted, and the weighting
 * is NOT "highlight the failures". A successful sensitive read is more interesting to an
 * auditor than a routine permission denial: the first is someone reading special personal
 * information and is exactly what POPIA asks NWHR to account for, the second is usually
 * somebody following a stale link. See lib/actions.ts.
 *
 * THE FILTER IS BUILT FROM THE SERVER'S OWN VOCABULARY, fetched from /audit/actions and
 * grouped by the namespace the action names already carry. A list copied into this file
 * would drift the first time an action was added, and the symptom would be a filter that
 * silently cannot find a whole class of events.
 */

const PAGE_SIZE = 25;

const WEIGHT: Record<
  EntryWeight,
  { rule: string; chip: string | null; icon: typeof Eye | null; label: string | null }
> = {
  DISCLOSURE: {
    rule: 'border-l-brand-500',
    chip: 'bg-brand-50 text-brand-700',
    icon: Eye,
    label: 'Disclosure',
  },
  SECURITY: {
    rule: 'border-l-danger-500',
    chip: 'bg-danger-50 text-danger-700',
    icon: ShieldAlert,
    label: 'Security',
  },
  DENIAL: {
    rule: 'border-l-accent-500',
    chip: 'bg-accent-50 text-accent-800',
    icon: KeyRound,
    label: 'Refused',
  },
  // Most of the trail. No rule, no chip — the exceptional rows only stand out if the
  // ordinary ones are quiet.
  ROUTINE: { rule: 'border-l-transparent', chip: null, icon: null, label: null },
};

function Row({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const actor = actorOf(entry);
  const weight = weighEntry({ action: entry.action, status: entry.status });
  const style = WEIGHT[weight];
  const metaKeys = Object.keys(entry.meta ?? {});

  return (
    <li className={cn('border-l-4 py-3 pl-3', style.rule)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium text-body">{labelOf(entry.action)}</span>
            <span className="text-sm text-subtle">{familyLabel(entry.action.split('.')[0] ?? '')}</span>
            {style.chip && style.icon && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tracking-wide uppercase',
                  style.chip
                )}
              >
                <style.icon className="size-3" aria-hidden="true" />
                {style.label}
              </span>
            )}
            {entry.status === 'failure' && weight !== 'DENIAL' && (
              <span className="text-sm font-medium text-danger-700">refused</span>
            )}
          </div>

          <p className="mt-0.5 text-sm text-subtle">
            {/*
              * "System" rather than a blank: the actor is genuinely null for a failed login
              * on an unknown email or an access request from someone with no account, and
              * an empty cell would read as missing data.
              */}
            {actor ? (
              <>
                <span className="text-muted">{actor.name}</span>
                {actor.role && ` · ${ROLE_LABELS[actor.role as Role] ?? actor.role}`}
              </>
            ) : (
              <span className="text-muted">System or signed-out</span>
            )}
            {entry.targetType && ` · ${entry.targetType}`}
            {entry.ip && ` · ${entry.ip}`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm whitespace-nowrap text-muted">{formatDateTime(entry.createdAt)}</p>
          {metaKeys.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-sm text-brand-600 underline-offset-2 hover:underline"
            >
              {open ? 'Hide detail' : 'Detail'}
            </button>
          )}
        </div>
      </div>

      {open && metaKeys.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-sunken px-3 py-2 text-sm sm:grid-cols-2">
          {metaKeys.map((key) => (
            <div key={key} className="flex gap-2">
              <dt className="shrink-0 text-subtle">{key}</dt>
              {/*
                * Rendered as text, never as markup. `meta` is Mixed and written by many
                * services; it carries references by design and never a sensitive payload,
                * but it is still data from the database and gets no more trust than that.
                */}
              <dd className="min-w-0 break-all text-body">{String(entry.meta[key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function AuditTrail() {
  const [action, setAction] = useState('');
  const [status, setStatus] = useState<'success' | 'failure' | ''>('');
  const [page, setPage] = useState(1);

  const vocabulary = useApi(
    useCallback((signal: AbortSignal) => listAuditActions(signal), []),
    []
  );

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListAuditQuery = {
          page,
          limit: PAGE_SIZE,
          sort: '-createdAt',
          ...(action ? { action } : {}),
          ...(status ? { status } : {}),
        };
        return listAuditEntries(query, signal);
      },
      [page, action, status]
    ),
    [page, action, status]
  );

  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const grouped = groupActions(vocabulary.data ?? []);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Audit trail</h1>
        <p className="mt-1 max-w-prose text-base text-muted">
          Every consequential action, refusals included. Append-only — entries cannot be
          edited or deleted by anyone, including an administrator.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by action</span>
          <select
            value={action}
            onChange={(event) => refilter(() => setAction(event.target.value))}
            disabled={!vocabulary.data}
            className="min-h-10 max-w-xs rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong disabled:text-ink-400"
          >
            <option value="">
              {vocabulary.data ? 'Every action' : vocabulary.error ? 'Unavailable' : 'Loading…'}
            </option>
            {/* Grouped by the namespace the action names already carry — seventy flat
                options is not a filter anybody operates. */}
            {grouped.map((group) => (
              <optgroup key={group.family} label={familyLabel(group.family)}>
                {group.actions.map((value) => (
                  <option key={value} value={value}>
                    {labelOf(value)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">Filter by outcome</span>
          <select
            value={status}
            onChange={(event) =>
              refilter(() => setStatus(event.target.value as 'success' | 'failure' | ''))
            }
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-base text-body hover:border-line-strong"
          >
            <option value="">Any outcome</option>
            <option value="success">Succeeded</option>
            <option value="failure">Refused or failed</option>
          </select>
        </label>

        {(action || status) && (
          <button
            type="button"
            onClick={() => refilter(() => { setAction(''); setStatus(''); })}
            className="min-h-10 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {vocabulary.error && (
        <p className="text-sm text-subtle">
          The action list could not be loaded, so filtering by action is unavailable. The
          trail itself is unaffected.
        </p>
      )}

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading the audit trail" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <ScrollText className="mx-auto size-5 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-base text-body">
            {action || status ? 'No entries match those filters.' : 'The trail is empty.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Entries are written by the actions themselves — nothing can be added here by
            hand, and nothing can be removed.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-base text-muted">
            {formatCount(meta?.total ?? rows.length)}{' '}
            {(meta?.total ?? 0) === 1 ? 'entry' : 'entries'}, newest first
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-2">
            {rows.map((entry) => (
              <Row key={entry._id} entry={entry} />
            ))}
          </ul>
        </>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Audit pages" />}
    </div>
  );
}

export default AuditTrail;
