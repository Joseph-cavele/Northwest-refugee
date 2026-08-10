'use client';

import { useMemo, useState } from 'react';
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
}

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
}: SeriesChartProps) {
  const [hover, setHover] = useState<number | null>(null);

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
        {empty ?? <p className="text-sm text-muted">Nothing stored yet.</p>}
      </div>
    );
  }

  const dates = series[0]?.points ?? [];
  const slot = plot.w / Math.max(length, 1);

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
      {/* A legend is always present for two or more series — identity must never be
          carried by colour alone. */}
      {series.length > 1 && (
        <ul className="mb-1 flex flex-wrap gap-4 px-1">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 text-xs text-muted">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ background: COLOURS[i % COLOURS.length] }}
              />
              {s.label}
            </li>
          ))}
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
            : series.map((s, si) => (
                <path
                  key={s.key}
                  d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(p.value)}`).join(' ')}
                  fill="none"
                  stroke={COLOURS[si % COLOURS.length]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

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

        {hover !== null && dates[hover] && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 right-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm"
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
