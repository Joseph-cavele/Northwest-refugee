'use client';

import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { PILLAR_LABELS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';

/*
 * Open service requests, split across the five pillars.
 *
 * PILLAR IS THE ONLY BREAKDOWN THE SERVER WILL GIVE. Nationality, gender, age band and
 * vulnerability are absent from the metric store by design — in a town Rustenburg's size a
 * cell of one is a person, and this panel is visible to roles holding no beneficiary access
 * at all. If a chart here ever needs another axis, that is a POPIA decision.
 *
 * Five slices means a LEGEND rather than direct labels, and the legend carries the value so
 * the ring is never the only way to read a number — which also makes it work in grayscale,
 * under forced-colors, and for the roughly one in twelve men who cannot separate red from
 * green.
 *
 * Colour order is FIXED, taken from the logo's four figures plus one step. Assigning by
 * rank instead would repaint every pillar whenever the counts reordered, and the reader
 * would lose the one thing colour is doing here — identity.
 */

const PILLAR_ORDER: ProgrammePillar[] = [
  'ADVOCACY_DOCUMENTATION',
  'SKILLS_ENTREPRENEURSHIP',
  'EDUCATION',
  'SOCIAL_COHESION',
  'WOMEN_YOUTH_EMPOWERMENT',
];

const PILLAR_COLOUR: Record<ProgrammePillar, string> = {
  ADVOCACY_DOCUMENTATION: 'var(--color-brand-500)',
  SKILLS_ENTREPRENEURSHIP: 'var(--color-accent-500)',
  EDUCATION: 'var(--color-gold-400)',
  SOCIAL_COHESION: 'var(--color-danger-500)',
  WOMEN_YOUTH_EMPOWERMENT: 'var(--color-brand-800)',
};

export interface PillarDonutProps {
  /** pillar → count. Missing pillars are drawn as zero, never dropped. */
  counts: Partial<Record<ProgrammePillar, number>>;
  className?: string;
}

const SIZE = 168;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PillarDonut({ counts, className }: PillarDonutProps) {
  const slices = PILLAR_ORDER.map((pillar) => ({
    pillar,
    value: counts[pillar] ?? 0,
    colour: PILLAR_COLOUR[pillar],
  }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;

  return (
    <div className={cn('flex flex-col items-center gap-5 sm:flex-row sm:items-center', className)}>
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Open service requests by pillar. Total ${total}.`}
          // -90° so the first slice starts at twelve o'clock, where a reader looks first.
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-ink-100)"
            strokeWidth={STROKE}
          />
          {total > 0 &&
            slices.map((slice) => {
              const fraction = slice.value / total;
              const dash = fraction * CIRCUMFERENCE;
              const element = (
                <circle
                  key={slice.pillar}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={slice.colour}
                  strokeWidth={STROKE}
                  // A 2px gap in the surface colour between segments, so two adjacent
                  // slices never read as one.
                  strokeDasharray={`${Math.max(dash - 2, 0)} ${CIRCUMFERENCE - Math.max(dash - 2, 0)}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return element;
            })}
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            {/* Proportional figures: this is a standalone number, not a column. */}
            <p className="text-2xl font-semibold tracking-tight text-body">{formatCount(total)}</p>
            <p className="text-xs text-subtle">open</p>
          </div>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.pillar} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: slice.colour }}
            />
            {/* Label and value in ink tokens — text never wears the series colour. */}
            <span className="min-w-0 flex-1 truncate text-muted">{PILLAR_LABELS[slice.pillar]}</span>
            <span className="font-semibold text-body" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {slice.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PillarDonut;
