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
 * ONE HUE, NOT FIVE. This was a five-colour scale — one per pillar, drawn from the logo —
 * and it was replaced for three reasons, in ascending order of seriousness.
 *
 * IT ENCODED NOTHING. Every row below already prints its pillar name, its count and its
 * share. Colour was restating the label beside it, which is what Design.md §30 means by
 * "do not create meaningless analytics" — the rule is about the ink as much as the metric.
 *
 * TWO OF THE FIVE WERE BARELY VISIBLE. Measured against this surface, gold #fdd731 came in
 * at 1.37:1 contrast and accent #f28529 at 2.51:1, both under the 3:1 a filled mark needs;
 * and brand-800 #1a265c has chroma 0.098, low enough that it reads as grey rather than as a
 * colour. So the "code" had two bars you could hardly see and one that looked like a
 * neutral.
 *
 * IT SPENT THE DESTRUCTIVE COLOUR ON A PROGRAMME. Social cohesion was painted in
 * danger-500, the same red this dashboard uses 64 times to mean something is wrong, and
 * which §4 lists as its own reserved token. A red bar has to mean trouble everywhere or
 * nowhere; a pillar is not trouble, and a reader who learns to skim for red should not be
 * stopped by a programme name.
 *
 * Bars all measure the same quantity — open cases — so this is magnitude, and magnitude
 * takes a single hue. Identity is carried by the label, where it already was.
 */
const BAR_COLOUR = 'var(--color-brand-500)';

export interface PillarBarsProps {
  counts: Partial<Record<ProgrammePillar, number>>;
  className?: string;
}

export function PillarBars({ counts, className }: PillarBarsProps) {
  const rows = PILLAR_ORDER.map((pillar) => ({
    pillar,
    value: counts[pillar] ?? 0,
  }));

  const total = rows.reduce((sum, r) => sum + r.value, 0);
  // Bars are scaled against the largest pillar, not the total: at a 5-way split every bar
  // would otherwise sit under a fifth of the track and the differences would be invisible.
  const peak = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <p className="text-base text-muted">
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
              <div className="flex items-baseline justify-between gap-3 text-sm">
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
                  style={{ width: `${(row.value / peak) * 100}%`, background: BAR_COLOUR }}
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
