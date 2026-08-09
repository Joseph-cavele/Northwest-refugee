'use client';

import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatValue } from '@/lib/format';
import { formatDate } from '@/lib/dates';
import type { ValueUnit } from '@/lib/format';

/*
 * The hero chart: one measure over time.
 *
 * Inline SVG rather than a charting library. The design system already refuses a webfont
 * "on a connection that may be a shared phone hotspot in Rustenburg" — shipping 150 kB of
 * Recharts to draw one filled line would undo that for less reason.
 *
 * ONE SERIES, so no legend: the panel title names it. A second series would need one.
 * Colour carries no meaning here beyond "this is the line" — the value is read from the
 * axis and the tooltip, never from the hue.
 */

export interface AreaChartPoint {
  /** ISO date. */
  date: string;
  value: number;
}

export interface AreaChartProps {
  points: AreaChartPoint[];
  unit: ValueUnit;
  /** Announced to a screen reader in place of the drawing. */
  label: string;
  className?: string;
  height?: number;
}

const PAD = { top: 12, right: 8, bottom: 24, left: 48 };

/** Round a maximum up to something a person would choose for an axis. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export function AreaChart({ points, unit, label, className, height = 220 }: AreaChartProps) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 720; // viewBox only — the SVG scales to its container.
  const plot = {
    w: width - PAD.left - PAD.right,
    h: height - PAD.top - PAD.bottom,
  };

  const { path, area, ticks, max, xOf, yOf } = useMemo(() => {
    const values = points.map((p) => p.value);
    const top = niceMax(Math.max(...values, 0));

    // A single point has no span to divide by; centring it beats dividing by zero.
    const xOf = (i: number) =>
      PAD.left + (points.length <= 1 ? plot.w / 2 : (i / (points.length - 1)) * plot.w);
    const yOf = (v: number) => PAD.top + plot.h - (top === 0 ? 0 : (v / top) * plot.h);

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(p.value)}`).join(' ');
    const filled = points.length
      ? `${line} L${xOf(points.length - 1)},${PAD.top + plot.h} L${xOf(0)},${PAD.top + plot.h} Z`
      : '';

    return {
      path: line,
      area: filled,
      ticks: [0, 0.5, 1].map((f) => ({ value: top * f, y: PAD.top + plot.h - f * plot.h })),
      max: top,
      xOf,
      yOf,
    };
  }, [points, plot.w, plot.h]);

  if (points.length === 0) {
    return (
      <p className="grid h-full min-h-40 place-items-center text-sm text-subtle">
        No stored history yet.
      </p>
    );
  }

  const active = hover === null ? null : points[hover];

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${label}. ${points.length} days, highest value ${formatValue(max, unit)}.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Recessive grid: it orients the eye and must not compete with the data. */}
        {ticks.map((t) => (
          <g key={t.y}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={t.y + 4}
              textAnchor="end"
              className="fill-subtle text-[11px]"
              // Tabular here on purpose: axis ticks are a column of numbers and must align.
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatValue(t.value, unit)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={path} fill="none" stroke="var(--color-brand-500)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {active && (
          <g>
            <line
              x1={xOf(hover!)}
              x2={xOf(hover!)}
              y1={PAD.top}
              y2={PAD.top + plot.h}
              stroke="var(--color-line-strong)"
              strokeWidth="1"
            />
            {/* 2px surface ring so the marker reads against the fill beneath it. */}
            <circle cx={xOf(hover!)} cy={yOf(active.value)} r="5" fill="var(--color-brand-500)" stroke="var(--color-surface)" strokeWidth="2" />
          </g>
        )}

        {/* Hit targets far wider than the marks — a 2px line is not a pointer target. */}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={xOf(i) - plot.w / Math.max(points.length, 1) / 2}
            y={PAD.top}
            width={Math.max(plot.w / Math.max(points.length, 1), 8)}
            height={plot.h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        <text x={PAD.left} y={height - 6} className="fill-subtle text-[11px]">
          {formatDate(points[0]!.date)}
        </text>
        <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-subtle text-[11px]">
          {formatDate(points[points.length - 1]!.date)}
        </text>
      </svg>

      {active && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 right-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm"
        >
          <p className="font-semibold text-body">{formatValue(active.value, unit)}</p>
          <p className="text-subtle">{formatDate(active.date)}</p>
        </div>
      )}
    </div>
  );
}

export default AreaChart;
