'use client';

import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';

/*
 * One ratio, against the whole it came out of.
 *
 * The reference puts "85% Goal" here. There is no goal anywhere in this data, and inventing
 * the percentage would mean inventing the target it is a percentage of — so this shows a
 * ratio that genuinely exists: how much of the open work is already past its service
 * standard.
 *
 * A METER, NOT A PIE. For a single ratio against a limit, a filled arc is the form that
 * reads at a glance; a two-slice pie is the one that does not. The unfilled track is a
 * lighter step of the SAME ramp as the fill, so the severity reads across the whole ring
 * rather than only in the coloured part.
 *
 * SEVERITY IS THE POINT AND IT IS NEVER COLOUR ALONE. The ring is red at three quarters
 * because three quarters of the queue being late is not a neutral fact — but the caption
 * underneath says "14 of 19 open requests are past due" in words, so the meaning survives
 * grayscale, forced-colors, and the roughly one man in twelve who cannot separate red from
 * green.
 */

export interface RatioGaugeProps {
  /** The part. */
  value: number;
  /** The whole it came from. Zero renders the empty state, never a division by zero. */
  total: number;
  /** What the ratio is of — "past due", "attended". */
  label: string;
  /** The full sentence beneath. Say it in words; the ring is the glance. */
  caption: string;
  /** True when a HIGH ratio is bad news. Overdue work rises into red; attendance does not. */
  highIsBad?: boolean;
  className?: string;
}

const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Fill and track, always two steps of one ramp. */
function ramp(share: number, highIsBad: boolean) {
  if (!highIsBad) return { fill: 'var(--color-success-500)', track: 'var(--color-success-50)' };
  if (share >= 0.6) return { fill: 'var(--color-danger-500)', track: 'var(--color-danger-50)' };
  if (share >= 0.3) return { fill: 'var(--color-accent-500)', track: 'var(--color-accent-50)' };
  return { fill: 'var(--color-success-500)', track: 'var(--color-success-50)' };
}

export function RatioGauge({
  value,
  total,
  label,
  caption,
  highIsBad = false,
  className,
}: RatioGaugeProps) {
  if (total <= 0) {
    return (
      <div className={cn('grid min-h-52 place-items-center px-6 text-center', className)}>
        <p className="max-w-[22ch] text-sm text-muted">
          Nothing open right now, so there is no share to show.
        </p>
      </div>
    );
  }

  const share = Math.min(value / total, 1);
  const percent = Math.round(share * 100);
  const { fill, track } = ramp(share, highIsBad);

  return (
    <div className={cn('flex flex-col items-center gap-4 text-center', className)}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${percent} per cent. ${caption}`}
          // Starts at twelve o'clock, where a reader looks first.
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={track} strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={fill}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
          />
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div>
            {/* Proportional figures: a standalone number at display size, not a column. */}
            <p className="text-3xl leading-none font-semibold tracking-[-0.02em] text-body">
              {percent}%
            </p>
            <p className="mt-1 text-xs text-subtle">{label}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm text-body">
          <span className="font-semibold">{formatCount(value)}</span> of{' '}
          <span className="font-semibold">{formatCount(total)}</span>
        </p>
        <p className="mt-1 max-w-[26ch] text-xs leading-relaxed text-muted">{caption}</p>
      </div>
    </div>
  );
}

export default RatioGauge;
