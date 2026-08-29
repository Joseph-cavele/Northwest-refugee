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

/*
 * The delta is a CHIP rather than loose coloured text.
 *
 * At 14px, a percentage in success-700 next to a percentage in danger-700 is two similar
 * dark strings and the reader has to look at the arrow to tell them apart. A tinted pill
 * gives the comparison an outline, which is what makes it findable when four of these cards
 * sit in a row — and the arrow and the "vs" caption still carry the meaning without it.
 */
const DIRECTION_STYLE: Record<Direction, { className: string; Icon: typeof Minus }> = {
  // Colour is never the only signal: the arrow encodes direction, and the caption names
  // what the comparison is against.
  good: { className: 'bg-success-50 text-success-700', Icon: ArrowUpRight },
  bad: { className: 'bg-danger-50 text-danger-700', Icon: ArrowDownRight },
  neutral: { className: 'bg-ink-100 text-muted', Icon: Minus },
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
        'group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface',
        className
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="truncate text-xs font-semibold tracking-[0.12em] text-subtle uppercase">
          {card.label}
        </h3>

        <div className="flex items-end justify-between gap-3">
          {/*
            * Proportional figures, not tabular. Tabular gives every digit the width of a
            * zero, which is right in a column and looks slack at display size.
            */}
          <p className="text-[2rem] leading-none font-semibold tracking-[-0.03em] text-body">
            {formatValueCompact(card.value, card.unit)}
          </p>

          {delta && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold',
                deltaClass
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {formatDelta(delta)}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 text-sm">
          {delta ? (
            <span className="truncate text-subtle">
              vs {delta.against}
              {/*
                * The caseload caption survives even when a delta is present. A coordinator's
                * "12 open cases" covers their own work; the Executive Director's covers the
                * organisation, and the number alone cannot say which.
                */}
              {card.scoped && ' · your caseload'}
            </span>
          ) : (
            <span className="truncate text-subtle">
              {PERIOD_CAPTION[card.period]}
              {card.scoped && ' · your caseload'}
            </span>
          )}
        </div>
      </div>

      {/*
        * The trace, run full-bleed along the card's bottom edge rather than parked beside
        * the figure.
        *
        * WHY IT MOVED: at 96px wide in the top-right it was competing with the number for
        * the same corner, and neither had room. Along the base it has four times the width —
        * which is what a shape needs to be readable as a shape — and it reads as the card's
        * floor rather than as a second, smaller figure.
        *
        * It stays decorative. The gradient fades the trace out towards the top so it never
        * sits behind the caption, and the exact value remains the large number above it.
        */}
      {points.length >= 2 && (
        <Sparkline points={points} tone={direction} className="h-12 w-full" />
      )}
    </article>
  );
}

export default KpiCard;
