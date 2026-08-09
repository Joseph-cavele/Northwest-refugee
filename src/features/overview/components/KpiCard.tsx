'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValueCompact } from '@/lib/format';
import type { DashboardCard } from '@/api/reports.api';
import { Sparkline } from './Sparkline';
import { computeDelta, directionOf, formatDelta, toPoints } from '../lib/series';
import type { Direction } from '../lib/series';
import type { MetricRow } from '@/api/reports.api';

/*
 * A headline figure.
 *
 * The reference template puts a percentage under every number. This one shows a delta only
 * when the stored series can support the arithmetic — see lib/series.ts. On a dashboard the
 * comparison is the most-believed and least-checked thing on the screen, and a fabricated
 * one is worse than a blank space, because a funder report is eventually built from what a
 * person read here.
 *
 * When there is no history, the card says what would fill it rather than showing a dash and
 * leaving the reader to wonder whether the number is broken.
 */

const PERIOD_CAPTION: Record<DashboardCard['period'], string> = {
  CURRENT: 'Right now',
  MONTH_TO_DATE: 'This month so far',
};

const DIRECTION_STYLE: Record<Direction, { className: string; Icon: typeof Minus }> = {
  // Colour is never the only signal: the arrow encodes direction, and the caption names
  // what the comparison is against.
  good: { className: 'text-success-700', Icon: ArrowUpRight },
  bad: { className: 'text-danger-700', Icon: ArrowDownRight },
  neutral: { className: 'text-subtle', Icon: Minus },
};

export interface KpiCardProps {
  card: DashboardCard;
  /** The stored series for this metric, if the caller could fetch it. */
  series?: MetricRow[];
  className?: string;
}

export function KpiCard({ card, series = [], className }: KpiCardProps) {
  const points = toPoints(series, card.key);
  const kind = card.period === 'CURRENT' ? 'STOCK' : 'FLOW';
  const delta = computeDelta(points, kind, 30);

  // An arrow pointing up is not good news on "overdue requests" — see directionOf.
  const direction: Direction = delta ? directionOf(card.key, delta.change) : 'neutral';
  const { className: deltaClass, Icon } = DIRECTION_STYLE[direction];

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-line bg-surface p-5',
        'transition-colors hover:border-line-strong',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.6875rem] font-semibold tracking-[0.12em] text-subtle uppercase">
            {card.label}
          </h3>
          {/*
            * Proportional figures, not tabular. Tabular gives every digit the width of a
            * zero, which is right in a column and looks slack at display size.
            */}
          <p className="mt-2 text-[1.75rem] leading-none font-semibold tracking-[-0.02em] text-body">
            {formatValueCompact(card.value, card.unit)}
          </p>
        </div>

        {points.length >= 2 && (
          <Sparkline points={points} tone={direction} className="h-8 w-24 shrink-0" />
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 text-xs">
        {delta ? (
          <>
            <span className={cn('inline-flex items-center gap-1 font-semibold', deltaClass)}>
              <Icon className="size-3.5" aria-hidden="true" />
              {formatDelta(delta)}
            </span>
            <span className="truncate text-subtle">vs {delta.against}</span>
          </>
        ) : (
          <span className="truncate text-subtle">
            {PERIOD_CAPTION[card.period]}
            {card.scoped && ' · your caseload'}
          </span>
        )}
      </div>

      {/*
        * The caseload caption survives even when a delta has taken the row above. A
        * coordinator's "12 open cases" covers their own work; the Executive Director's
        * covers the organisation, and the number alone cannot say which.
        */}
      {delta && card.scoped && (
        <p className="-mt-2 text-xs text-subtle">Your caseload</p>
      )}
    </article>
  );
}

export default KpiCard;
