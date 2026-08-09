'use client';

import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { PILLAR_LABELS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';

/*
 * Open service requests, split across the five pillars.
 *
 * HORIZONTAL BARS, NOT A DONUT. The reference puts a pie here, and for five categories
 * named "Women & Youth Empowerment" and "Advocacy & Documentation" that means a ring you
 * cannot label and a legend you have to keep looking back at. Bars put the name, the
 * length and the number on one line, in the order the eye already reads.
 *
 * PILLAR IS THE ONLY BREAKDOWN THE SERVER WILL GIVE. Nationality, gender, age band and
 * vulnerability are absent from the metric store by design — in a town Rustenburg's size a
 * cell of one is a person, and this panel is visible to roles holding no beneficiary access
 * at all. Another axis here is a POPIA decision, not a chart change.
 */

const PILLAR_ORDER: ProgrammePillar[] = [
  'ADVOCACY_DOCUMENTATION',
  'SKILLS_ENTREPRENEURSHIP',
  'EDUCATION',
  'SOCIAL_COHESION',
  'WOMEN_YOUTH_EMPOWERMENT',
];

/*
 * The logo's four figures, plus one deeper step of the brand blue. Assigned in a FIXED
 * order — never by rank, or a quiet week would repaint every pillar and the reader would
 * lose the only thing colour is doing here.
 */
const PILLAR_COLOUR: Record<ProgrammePillar, string> = {
  ADVOCACY_DOCUMENTATION: 'var(--color-brand-500)',
  SKILLS_ENTREPRENEURSHIP: 'var(--color-accent-500)',
  EDUCATION: 'var(--color-gold-400)',
  SOCIAL_COHESION: 'var(--color-danger-500)',
  WOMEN_YOUTH_EMPOWERMENT: 'var(--color-brand-800)',
};

export interface PillarBarsProps {
  counts: Partial<Record<ProgrammePillar, number>>;
  className?: string;
}

export function PillarBars({ counts, className }: PillarBarsProps) {
  const rows = PILLAR_ORDER.map((pillar) => ({
    pillar,
    value: counts[pillar] ?? 0,
    colour: PILLAR_COLOUR[pillar],
  }));

  const total = rows.reduce((sum, r) => sum + r.value, 0);
  // Bars are scaled against the largest pillar, not the total: at a 5-way split every bar
  // would otherwise sit under a fifth of the track and the differences would be invisible.
  const peak = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <p className="text-sm text-muted">
        <span className="text-2xl font-semibold tracking-[-0.02em] text-body">
          {formatCount(total)}
        </span>{' '}
        open across five pillars
      </p>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const share = total === 0 ? 0 : Math.round((row.value / total) * 100);
          return (
            <li key={row.pillar} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-muted">{PILLAR_LABELS[row.pillar]}</span>
                {/* The number is always present. The bar is a comparison aid, never the
                    only way to read the value — which is also what makes this legible in
                    grayscale and under forced-colors. */}
                <span
                  className="shrink-0 font-semibold text-body"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.value}
                  {total > 0 && <span className="ml-1.5 font-normal text-subtle">{share}%</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${(row.value / peak) * 100}%`, background: row.colour }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PillarBars;
