'use client';

import { useId } from 'react';
import type { Point } from '../lib/series';

/*
 * The small trace inside a KPI card.
 *
 * DELIBERATELY UNLABELLED AND UNREADABLE AS A VALUE. A sparkline's job is shape — rising,
 * falling, spiky, flat — and putting an axis on something 32 pixels tall invites reading a
 * number off it that the pixels cannot support. The exact figure is the big number beside
 * it; this only says which way it has been going.
 *
 * It renders nothing at all below two points. One point is not a trend, and a flat line
 * drawn through a single value asserts a stability nobody measured.
 */

export interface SparklineProps {
  points: Point[];
  /** Matches the card's delta direction, so trace and caption never disagree. */
  tone: 'good' | 'bad' | 'neutral';
  className?: string;
}

const TONE: Record<SparklineProps['tone'], string> = {
  good: 'var(--color-success-500)',
  bad: 'var(--color-danger-500)',
  neutral: 'var(--color-brand-500)',
};

const W = 120;
const H = 32;

export function Sparkline({ points, tone, className }: SparklineProps) {
  const gradientId = useId();
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  // 1px of padding top and bottom so a peak is not clipped flat by the viewBox edge.
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 1 - ((v - min) / span) * (H - 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const colour = TONE[tone];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      // Decorative: the number and the delta beside it carry the meaning, and a screen
      // reader announcing a path description would be noise.
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.22" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={colour}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        // preserveAspectRatio="none" stretches the stroke with the box; this keeps it even.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default Sparkline;
