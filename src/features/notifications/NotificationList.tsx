'use client';

import { useCallback, useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Spinner } from '@/components/ui/spinner';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { listNotifications, markAllRead, markRead } from '@/api/notifications.api';
import type { ListNotificationsQuery } from '@/api/notifications.api';
import { NOTIFICATION_TYPES } from '@/types/enums';
import type { NotificationType } from '@/types/enums';
import { formatCount, humanise } from '@/lib/format';

/*
 * Everything addressed to the signed-in person.
 *
 * WHY THIS EXISTS. The bell showed six and there was nowhere to go from it — and, more to
 * the point, nothing anywhere called markRead or markAllRead. The endpoints were built and
 * never wired, so a notification could be seen and never cleared: the badge only ever
 * counted up, and a count that never falls is one people stop reading. Everything here
 * hangs off fixing that.
 *
 * EVERY ROW IS THE CALLER'S OWN. No route accepts a user id — the filter is `userId:
 * actor._id` inside the service — so there is no permission on this page and no way to
 * render somebody else's. That is why it is guarded by RequireAuth alone.
 *
 * The rollup job addresses these to a person deliberately ("3 of your service requests are
 * past due") and carries COUNTS ONLY, never a beneficiary's name, because a notification is
 * read by whoever is looking at the screen. Nothing here should start rendering names.
 */

const PAGE_SIZE = 25;

export function NotificationList() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<NotificationType | ''>('');
  const [page, setPage] = useState(1);
  // Ids in flight, so a row can show it is working without blanking the list.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [clearing, setClearing] = useState(false);

  const { data, loading, error, reload } = useApi(
    useCallback(
      (signal: AbortSignal) => {
        const query: ListNotificationsQuery = {
          page,
          limit: PAGE_SIZE,
          sort: '-createdAt',
          ...(unreadOnly ? { unreadOnly: true } : {}),
          ...(type ? { type } : {}),
        };
        return listNotifications(query, signal);
      },
      [page, unreadOnly, type]
    ),
    [page, unreadOnly, type]
  );

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const unreadHere = rows.filter((row) => !row.isRead).length;

  async function handleMarkRead(id: string) {
    setPending((prev) => new Set(prev).add(id));
    try {
      await markRead(id);
      reload();
    } finally {
      // Cleared whatever happened: a row stuck pulsing after a failed request is worse
      // than one that simply did not change.
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleMarkAll() {
    setClearing(true);
    try {
      await markAllRead();
      reload();
    } finally {
      setClearing(false);
    }
  }

  function refilter(change: () => void) {
    change();
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Notifications</h1>
          <p className="mt-1 text-sm text-muted">
            {meta
              ? `${formatCount(meta.total)} ${meta.total === 1 ? 'notification' : 'notifications'} addressed to you`
              : 'Everything addressed to you.'}
          </p>
        </div>

        {unreadHere > 0 && (
          <Button
            variant="subtle"
            className="px-4 py-2"
            loading={clearing}
            onClick={() => void handleMarkAll()}
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            {clearing ? 'Clearing…' : 'Mark all as read'}
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => refilter(() => setUnreadOnly((v) => !v))}
          className={cn(
            'min-h-10 rounded-full border px-4 text-sm font-medium transition-colors',
            unreadOnly
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-line bg-surface text-body hover:border-line-strong'
          )}
        >
          Unread only
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Filter by type</span>
          <select
            value={type}
            onChange={(event) => refilter(() => setType(event.target.value as NotificationType | ''))}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm text-body hover:border-line-strong"
          >
            <option value="">Every kind</option>
            {NOTIFICATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {/* No label map for these on the client; humanise() is the sanctioned
                    fallback rather than printing ACCESS_REQUEST at somebody. */}
                {humanise(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && !data && <Spinner label="Loading notifications" className="py-20" />}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <BellOff className="mx-auto size-5 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-sm text-body">
            {unreadOnly ? 'Nothing unread.' : type ? 'Nothing of that kind.' : 'Nothing yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Notifications are raised by the nightly rollup and by work that needs a decision.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <NotificationsPanel
            notifications={rows}
            onMarkRead={(id) => void handleMarkRead(id)}
            pending={pending}
          />
        </div>
      )}

      {meta && <Pager meta={meta} onPage={setPage} label="Notification pages" />}
    </div>
  );
}

export default NotificationList;
