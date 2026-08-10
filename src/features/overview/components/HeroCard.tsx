'use client';

import { cn } from '@/lib/utils';
import { formatCount, formatValueCompact } from '@/lib/format';
import { formatDateTime } from '@/lib/dates';
import { ROLE_LABELS } from '@/types/enums';
import type { Role } from '@/types/enums';
import type { DashboardCard } from '@/api/reports.api';

/*
 * The one number the dashboard leads with.
 *
 * The reference template puts a celebration here — "Congratulations John! 10M page views,
 * 100% of target". Two things about that do not survive the move to this system.
 *
 * FIRST, THERE IS NO TARGET. Nothing in the data carries one, and inventing "100% of
 * target" would be inventing the target too.
 *
 * SECOND, AND THE REASON THIS CARD IS WORDED THE WAY IT IS: the number is people. A screen
 * that congratulates a director on eighteen refugees has misunderstood what it is counting.
 * So the figure is stated plainly — a fact the reader can act on, not an achievement the
 * interface is pleased about. The greeting is a greeting; the number stands on its own.
 *
 * This is the only saturated panel on the screen, which is deliberate: boldness spent in
 * one place, everything around it black-and-white. White on brand-500 is 7.3:1 (AAA) — of
 * the logo's four colours it is the only one that can carry white text at all, which is why
 * the hero is blue rather than orange or gold.
 */

export interface HeroCardProps {
  name?: string;
  role?: Role;
  /** The headline figure — people currently on the register. */
  headline?: DashboardCard;
  /** Context beneath it — how many arrived this month. */
  supporting?: DashboardCard;
  generatedAt?: string;
  className?: string;
}

export function HeroCard({ name, role, headline, supporting, generatedAt, className }: HeroCardProps) {
  const firstName = name?.split(' ')[0] ?? '';

  return (
    <section
      className={cn(
        'relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl bg-brand-500 p-6 text-white',
        className
      )}
    >
      {/*
        * The four figures from the mark, as a spine. `.brand-rule` is NWHR's own device —
        * a black house sheltering four figures in blue, orange, gold and red — and this is
        * the one place the whole palette appears at once.
        */}
      <div className="brand-rule absolute inset-x-0 top-0 h-1" aria-hidden="true" />

      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-white/70 uppercase">
          {role ? ROLE_LABELS[role] : 'Dashboard'}
        </p>
        <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.01em] text-white">
          {firstName ? `Welcome back, ${firstName}` : 'Overview'}
        </h1>
      </div>

      {headline ? (
        <div>
          {/*
            * The hero figure: the largest thing on the screen, in the same sans as
            * everything else. Proportional numerals, not tabular — a standalone number at
            * display size looks slack when every digit is the width of a zero.
            */}
          <p className="text-[clamp(2.75rem,7vw,4rem)] leading-[0.95] font-semibold tracking-[-0.03em]">
            {formatValueCompact(headline.value, headline.unit)}
          </p>
          <p className="mt-2 text-sm text-white/80">
            {/* Lower-cased deliberately: the server's label is a column heading, and this
                is the end of a sentence about people. */}
            {headline.label.toLowerCase()}
            {headline.scoped && ' you captured'}
          </p>

          {supporting && (
            <p className="mt-4 border-t border-white/20 pt-3 text-sm text-white/80">
              <span className="font-semibold text-white">
                {formatCount(supporting.value)}
              </span>{' '}
              {supporting.label.toLowerCase()} this month
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/80">
          Your role does not include the register, so there is no headline figure here.
        </p>
      )}

      {generatedAt && (
        <p className="text-xs text-white/60">Figures as at {formatDateTime(generatedAt)}</p>
      )}
    </section>
  );
}

export default HeroCard;
