import { cn } from '@/lib/utils';
import { formatValueCompact } from '@/lib/format';
import type { DashboardCard } from '@/api/reports.api';

/*
 * One figure from GET /reports/cards.
 *
 * WHAT THIS DELIBERATELY DOES NOT SHOW: a delta, an arrow, or a sparkline. The endpoint
 * returns a current value and no comparison, so any "+12% on last month" here would be
 * invented. A dashboard that makes up a trend is worse than one that shows none — the
 * number is what a funder report is eventually built from.
 *
 * The value wears an ink token, not a brand colour. Colouring a figure by its own size
 * implies a judgement the server has not made ("is 14 open cases bad?"), and this
 * interface never uses colour as the only carrier of meaning anyway.
 */

const PERIOD_CAPTION: Record<DashboardCard['period'], string> = {
  CURRENT: 'Right now',
  MONTH_TO_DATE: 'This month so far',
};

export interface StatCardProps {
  card: DashboardCard;
  className?: string;
}

export function StatCard({ card, className }: StatCardProps) {
  const value = formatValueCompact(card.value, card.unit);

  return (
    <article
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-line bg-surface p-5',
        'transition-colors hover:border-line-strong',
        className
      )}
    >
      <h3 className="text-sm font-medium text-muted">{card.label}</h3>

      {/*
        * Proportional figures, not tabular-nums. Tabular gives every digit the width of a
        * zero, which is right in a column of numbers and looks slack at this size.
        * `title` carries the exact figure when the displayed one is abbreviated.
        */}
      <p
        className="text-3xl font-semibold tracking-tight text-body"
        title={card.unit === 'CENTS' ? undefined : String(card.value)}
      >
        {value}
      </p>

      <p className="mt-auto pt-2 text-xs text-subtle">
        {PERIOD_CAPTION[card.period]}
        {/*
          * Said in words, because the number alone cannot say it. A coordinator's "12
          * open cases" covers their own caseload; the Executive Director's covers the
          * organisation. Captioning both the same way misstates one of them.
          */}
        {card.scoped && <span> · your caseload</span>}
      </p>
    </article>
  );
}

export default StatCard;
