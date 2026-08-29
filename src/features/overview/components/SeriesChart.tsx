'use client';

import { useId, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValue } from '@/lib/format';
import { formatDate } from '@/lib/dates';
import type { ValueUnit } from '@/lib/format';
import type { Point } from '../lib/series';

/*
 * Two comparable measures over time, as lines or as grouped bars.
 *
 * Inline SVG rather than a charting library. The design system already refuses a webfont
 * "on a connection that may be a shared phone hotspot in Rustenburg"; shipping 150 kB of
 * charting to draw two lines would undo that for less reason.
 *
 * ONE AXIS, ALWAYS. Two measures of different scale get two charts, never a second y-axis:
 * a dual axis lets the author choose where the lines cross, which is a claim the data has
 * not made. The caller pairs measures that share a unit — and pairs a STOCK with a STOCK,
 * a FLOW with a FLOW, because a level and a rate on one axis is the same lie in a different
 * shape.
 *
 * The series colours come from the logo's own figures, assigned in a fixed order. Never by
 * rank: a filter that reordered the series would repaint them, and the reader would lose
 * the one thing colour does here, which is identity.
 */

export interface Series {
  key: string;
  label: string;
  points: Point[];
}

export interface SeriesChartProps {
  series: Series[];
  unit: ValueUnit;
  variant?: 'line' | 'bars';
  height?: number;
  className?: string;
  /** Rendered in place of the plot when there is nothing stored yet. */
  empty?: React.ReactNode;
  /**
   * One instant for the whole screen, fixed when it opens, used to work out how old the
   * newest reading is.
   *
   * PASSED IN RATHER THAN READ HERE, for the reason the register's list records: reading the
   * clock during render makes the component impure — the same series would produce different
   * output on a re-render React had every right to discard — and two charts on one screen
   * would be timed against two different instants. Omitted, the freshness line is simply not
   * drawn, which is the safe default for a caller that has not thought about it.
   */
  now?: number;
}

/*
 * How old a series may be before the chart says so.
 *
 * Two days, because the snapshot runs nightly: yesterday's last reading is normal, and
 * anything older means the job has not run or the records stopped moving. Below this
 * threshold a freshness line would be noise on every chart every day.
 */
const STALE_AFTER_DAYS = 2;

const COLOURS = ['var(--color-brand-500)', 'var(--color-accent-500)'];

const PAD = { top: 14, right: 10, bottom: 26, left: 46 };
const VIEW_W = 760;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
}

export function SeriesChart({
  series,
  unit,
  variant = 'line',
  height = 240,
  className,
  empty,
  now,
}: SeriesChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  // Two of these charts can be on screen at once, and a gradient id collision would make
  // the second one paint with the first one's fill.
  const areaId = useId();

  const length = Math.max(...series.map((s) => s.points.length), 0);
  const plot = { w: VIEW_W - PAD.left - PAD.right, h: height - PAD.top - PAD.bottom };

  const { max, ticks, xOf, yOf } = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => p.value));
    const top = niceMax(Math.max(...all, 0));
    return {
      max: top,
      ticks: [0, 0.5, 1].map((f) => ({ value: top * f, y: PAD.top + plot.h - f * plot.h })),
      xOf: (i: number) => PAD.left + (length <= 1 ? plot.w / 2 : (i / (length - 1)) * plot.w),
      yOf: (v: number) => PAD.top + plot.h - (top === 0 ? 0 : (v / top) * plot.h),
    };
  }, [series, length, plot.w, plot.h]);

  if (length === 0) {
    return (
      <div className={cn('grid min-h-52 place-items-center px-6 text-center', className)}>
        {empty ?? <p className="text-base text-muted">Nothing stored yet.</p>}
      </div>
    );
  }

  const dates = series[0]?.points ?? [];
  const slot = plot.w / Math.max(length, 1);

  /*
   * How far behind today the newest reading is, or null when it is current enough to say
   * nothing — and also null when the caller passed no instant, because a chart must not
   * invent a clock of its own.
   */
  const newest = dates[dates.length - 1];
  const staleDays = (() => {
    if (now === undefined || !newest) return null;
    const days = Math.floor((now - new Date(newest.date).getTime()) / 86_400_000);
    return days > STALE_AFTER_DAYS ? days : null;
  })();

  /*
   * Bars fill most of their slot, with a small gap between the group and its neighbours.
   *
   * The caller is expected to have bucketed a long daily series into something with few
   * enough categories to read — see sumIntoWeeks. At forty-odd slots this arithmetic still
   * produces hairlines, because no width setting rescues that many bars; the fix is fewer
   * categories, not a thicker stroke.
   */
  const GROUP_FILL = 0.78;
  const BAR_GAP = 3;
  const barW = Math.max((slot * GROUP_FILL) / series.length, 3);
  const groupW = barW * series.length;

  return (
    <div className={cn('w-full', className)}>
      {/*
        * The legend, and the latest figure beside each label.
        *
        * IT IS NOW DRAWN FOR A SINGLE SERIES TOO, because it carries a number rather than
        * only a colour key. The value used to be reachable only by hovering a 2px line —
        * which is no way to read a chart at all on a phone, where there is no hover and
        * never will be. The most recent reading is the thing a reader wants most often, so
        * it is on the page rather than behind a gesture half this audience cannot make.
        *
        * Identity is still never carried by colour alone: the swatch is beside its label.
        */}
      {series.some((s) => s.points.length > 0) && (
        <ul className="mb-1 flex flex-wrap gap-x-5 gap-y-1 px-1">
          {series.map((s, i) => {
            const latest = s.points[s.points.length - 1];
            return (
              <li key={s.key} className="flex items-baseline gap-2 text-sm text-muted">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 translate-y-px rounded-full"
                  style={{ background: COLOURS[i % COLOURS.length] }}
                />
                {s.label}
                {latest && (
                  <span
                    className="font-semibold text-body"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatValue(latest.value, unit)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`${series.map((s) => s.label).join(' and ')} over ${length} days. Highest value ${formatValue(max, unit)}.`}
          onMouseLeave={() => setHover(null)}
        >
          {variant === 'line' && (
            <defs>
              {series.map((s, si) => (
                <linearGradient key={s.key} id={`${areaId}-${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={COLOURS[si % COLOURS.length]}
                    stopOpacity="0.14"
                  />
                  <stop offset="100%" stopColor={COLOURS[si % COLOURS.length]} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
          )}

          {/* Recessive grid: it orients the eye and must not compete with the data. */}
          {ticks.map((t) => (
            <g key={t.y}>
              <line x1={PAD.left} x2={VIEW_W - PAD.right} y1={t.y} y2={t.y} stroke="var(--color-line)" strokeWidth="1" />
              <text
                x={PAD.left - 8}
                y={t.y + 4}
                textAnchor="end"
                className="fill-subtle text-[11px]"
                // Tabular here: axis ticks are a column of numbers and must align.
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatValue(t.value, unit)}
              </text>
            </g>
          ))}

          {variant === 'bars'
            ? series.map((s, si) =>
                s.points.map((p, i) => (
                  <rect
                    key={`${s.key}-${p.date}`}
                    x={xOf(i) - groupW / 2 + si * barW}
                    y={yOf(p.value)}
                    // The gap comes out of the bar, not out of the group, so the pair stays
                    // centred on its tick however many series there are.
                    width={Math.max(barW - BAR_GAP, 2)}
                    height={Math.max(PAD.top + plot.h - yOf(p.value), 0)}
                    // Rounded data-ends, anchored to the baseline.
                    rx="3"
                    fill={COLOURS[si % COLOURS.length]}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ))
              )
            : series.map((s, si) => {
                // A series the caller could not fill draws nothing. Closing an area path
                // over an empty point list would reach for xOf(-1) and paint a wedge.
                if (s.points.length === 0) return null;

                const line = s.points
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(p.value)}`)
                  .join(' ');
                const colour = COLOURS[si % COLOURS.length]!;
                const baseline = PAD.top + plot.h;

                return (
                  <g key={s.key}>
                    {/*
                      * A wash under the line, closed down to the baseline.
                      *
                      * IT ENCODES NOTHING THE LINE DOES NOT — it is there because two 2px
                      * strokes crossing on a white field give the eye no way to tell which
                      * is in front, and a filled area settles that instantly. It tops out at
                      * 14% and fades to nothing, so it never competes with the stroke and
                      * never reads as a stacked band, which WOULD be a claim: these two
                      * series are independent levels and must not look additive.
                      */}
                    <path
                      d={`${line} L${xOf(s.points.length - 1)},${baseline} L${xOf(0)},${baseline} Z`}
                      fill={`url(#${areaId}-${si})`}
                    />
                    <path
                      d={line}
                      fill="none"
                      stroke={colour}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}

          {hover !== null && (
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={PAD.top}
              y2={PAD.top + plot.h}
              stroke="var(--color-line-strong)"
              strokeWidth="1"
            />
          )}

          {variant === 'line' &&
            hover !== null &&
            series.map((s, si) => {
              const p = s.points[hover];
              if (!p) return null;
              return (
                // A 2px surface ring so the marker reads against whatever is behind it.
                <circle
                  key={s.key}
                  cx={xOf(hover)}
                  cy={yOf(p.value)}
                  r="4.5"
                  fill={COLOURS[si % COLOURS.length]}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              );
            })}

          {/* Hit targets far wider than the marks — a 2px line is not a pointer target. */}
          {dates.map((p, i) => (
            <rect
              key={p.date}
              x={xOf(i) - slot / 2}
              y={PAD.top}
              width={Math.max(slot, 8)}
              height={plot.h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          <text x={PAD.left} y={height - 6} className="fill-subtle text-[11px]">
            {dates[0] ? formatDate(dates[0].date) : ''}
          </text>
          <text x={VIEW_W - PAD.right} y={height - 6} textAnchor="end" className="fill-subtle text-[11px]">
            {dates[dates.length - 1] ? formatDate(dates[dates.length - 1]!.date) : ''}
          </text>
        </svg>

        {staleDays !== null && (
          /*
           * WHY THIS EXISTS. A series whose last reading is a fortnight old draws a line that
           * stops two thirds of the way across and then nothing. There is no visual
           * difference between "the recording stopped" and "the work fell off a cliff", and a
           * reader has no reason to prefer the first reading. Saying it in words is the only
           * fix — the same argument as the empty state that used to claim "no history yet"
           * while the request behind it was failing.
           *
           * `role="status"` rather than "alert": it is a fact about the chart worth noticing,
           * not something to interrupt a screen reader mid-sentence.
           */
          <p
            role="status"
            className="mt-1 flex flex-wrap items-center gap-x-1.5 px-1 text-sm text-accent-800"
          >
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="font-semibold">
              Last reading {staleDays} days ago, on {formatDate(dates[dates.length - 1]!.date)}.
            </span>
            <span className="text-muted">The line stops there — it is not a fall to zero.</span>
          </p>
        )}

        {hover !== null && dates[hover] && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 right-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-sm"
          >
            <p className="mb-1 text-subtle">{formatDate(dates[hover]!.date)}</p>
            {series.map((s, si) => (
              <p key={s.key} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: COLOURS[si % COLOURS.length] }}
                />
                <span className="text-muted">{s.label}</span>
                <span className="ml-auto font-semibold text-body">
                  {formatValue(s.points[hover]?.value ?? 0, unit)}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SeriesChart;
