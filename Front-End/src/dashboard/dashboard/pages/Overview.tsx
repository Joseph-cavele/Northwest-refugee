import { useCallback } from 'react';
import { ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { getDashboardCards } from '@/api/reports.api';
import type { CardGroup, DashboardCard } from '@/api/reports.api';
import { formatDateTime } from '@/lib/dates';
import { StatCard } from '../components/StatCard';

/*
 * The screen every role lands on after signing in.
 *
 * One page serves all eight roles, because the server already decides what each one may
 * see: GET /reports/cards returns only the cards the caller's permissions earn, scoped
 * to their own caseload where that applies. Branching per role here would be a second
 * copy of the permission matrix, and the copy that drifts is the one that leaks.
 *
 * A card the user may not see is ABSENT from the response, never zero. So a missing
 * group renders nothing at all — no "0 open cases" for someone who cannot see cases.
 */

const GROUP_HEADINGS: Record<CardGroup, string> = {
  register: 'The register',
  casework: 'Casework',
  programmes: 'Programmes',
  events: 'Events',
  finance: 'Finance',
  fundraising: 'Fundraising',
};

// Fixed order, so the page does not reshuffle itself between roles or reloads. Response
// order is not a guarantee, and a dashboard whose sections move is one nobody learns.
const GROUP_ORDER: CardGroup[] = [
  'register',
  'casework',
  'programmes',
  'events',
  'finance',
  'fundraising',
];

function groupCards(cards: DashboardCard[]): [CardGroup, DashboardCard[]][] {
  return GROUP_ORDER.map(
    (group) => [group, cards.filter((card) => card.group === group)] as [CardGroup, DashboardCard[]]
  ).filter(([, inGroup]) => inGroup.length > 0);
}

export default function Overview() {
  const { user } = useAuth();
  const fetchCards = useCallback((signal: AbortSignal) => getDashboardCards(signal), []);
  const { data, loading, error, reload } = useApi(fetchCards);

  // Only the first name. "Good morning, Thandiwe Mokoena" reads like a form letter.
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-body">
          {firstName ? `Welcome back, ${firstName}` : 'Overview'}
        </h1>
        <p className="text-sm text-muted">
          {data
            ? `Figures as at ${formatDateTime(data.generatedAt)}`
            : 'Your figures for today.'}
        </p>
      </header>

      {loading && !data && <Spinner label="Loading your figures" className="py-16" />}

      {error && (
        <div className="flex flex-col items-start gap-3">
          {/* ErrorAlert surfaces the requestId — it is what lets support find the log
              line without anyone reading personal details down a phone. */}
          <ErrorAlert error={error} />
          <Button variant="subtle" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {data &&
        groupCards(data.cards).map(([group, cards]) => (
          <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
            <h2
              id={`group-${group}`}
              className="text-xs font-semibold uppercase tracking-[0.09em] text-subtle"
            >
              {GROUP_HEADINGS[group]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card) => (
                <StatCard key={card.key} card={card} />
              ))}
            </div>
          </section>
        ))}

      {data && data.cards.length === 0 && (
        /*
         * Reachable: a role can hold report:read and none of the permissions behind any
         * individual card. Saying so is better than an empty page that looks broken —
         * and better than inventing zeros, which would state something untrue.
         */
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          There are no figures your role can see yet. Your work lives in the sections of the
          menu — ask an administrator if you expected something here.
        </p>
      )}
    </div>
  );
}
