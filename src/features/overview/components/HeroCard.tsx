'use client';

import type { ReactNode } from 'react';
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
  /**
   * The one thing a reader can *do* from this card — a node, not a href, because the caller
   * owns both the destination and the permission that earns it. This component presents
   * figures; it must not also hold an opinion about who may register anybody.
   */
  action?: ReactNode;
  className?: string;
}

export function HeroCard({
  name,
  role,
  headline,
  supporting,
  generatedAt,
  action,
  className,
}: HeroCardProps) {
  const firstName = name?.split(' ')[0] ?? '';

  return (
    <section
      className={cn(
        'relative flex flex-col justify-between gap-8 overflow-hidden rounded-2xl bg-brand-500 p-6 text-white shadow-hero sm:p-7',
        className
      )}
    >
      {/*
        * The lit corner. See `.hero-sheen` in globals.css: white-over-blue only, so the
        * darkest point of the panel is still brand-500 and the type is still AAA.
        */}
      <div className="hero-sheen pointer-events-none absolute inset-0" aria-hidden="true" />

      {/*
        * The mark's own geometry, oversized and barely there — a house outline bled off the
        * corner. It is the one piece of decoration on the dashboard, and it earns its place
        * by being the logo rather than a stock flourish: at 7% white it is texture, not an
        * image competing with the figure in front of it.
        */}
      <svg
        className="pointer-events-none absolute -top-8 -right-10 size-56 text-white/[0.07]"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 46 50 14l38 32v42a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V46Z"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinejoin="round"
        />
      </svg>

      {/*
        * The four figures from the mark, as a spine. `.brand-rule` is NWHR's own device —
        * a black house sheltering four figures in blue, orange, gold and red — and this is
        * the one place the whole palette appears at once.
        */}
      <div className="brand-rule absolute inset-x-0 top-0 h-1" aria-hidden="true" />

      <div className="relative">
        {/*
          * The role, as a chip rather than loose eyebrow text. It is an attribute of the
          * reader, not a heading for what follows, and a bordered chip says so at a glance.
          */}
        <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-semibold tracking-[0.12em] text-white uppercase backdrop-blur-sm">
          {role ? ROLE_LABELS[role] : 'Dashboard'}
        </span>
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-white">
          {firstName ? `Welcome back, ${firstName}` : 'Overview'}
        </h1>
      </div>

      {headline ? (
        <div className="relative">
          {/*
            * The hero figure: the largest thing on the screen, in the same sans as
            * everything else. Proportional numerals, not tabular — a standalone number at
            * display size looks slack when every digit is the width of a zero.
            */}
          <p className="text-[clamp(3rem,7.5vw,4.5rem)] leading-[0.9] font-semibold tracking-[-0.035em]">
            {formatValueCompact(headline.value, headline.unit)}
          </p>
          <p className="mt-2.5 text-base text-white/85">
            {/* Lower-cased deliberately: the server's label is a column heading, and this
                is the end of a sentence about people. */}
            {headline.label.toLowerCase()}
            {headline.scoped && ' you captured'}
          </p>

          {supporting && (
            /*
             * The month's arrivals, set as a self-contained block rather than a rule and a
             * line of prose. It is a second figure, and giving it its own frame stops it
             * reading as a caption belonging to the headline above.
             */
            <p className="mt-5 inline-flex flex-wrap items-baseline gap-x-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-base text-white/85 backdrop-blur-sm">
              <span className="text-lg font-semibold text-white">
                {formatCount(supporting.value)}
              </span>
              <span>{supporting.label.toLowerCase()} this month</span>
            </p>
          )}
        </div>
      ) : (
        <p className="relative text-base text-white/85">
          Your role does not include the register, so there is no headline figure here.
        </p>
      )}

      {(generatedAt || action) && (
        /*
         * The footer carries a fact and, where the reader holds it, the act that changes
         * that fact. They share a row rather than stacking: the freshness line is the last
         * thing read on the card, and a call to action floating below it on its own reads
         * as an afterthought rather than as the point.
         */
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          {generatedAt ? (
            <p className="flex items-center gap-2 text-sm text-white/70">
              {/* A dot, because "as at" is a freshness claim and a reader scanning for whether
                  the screen is live finds a mark faster than a sentence. */}
              <span className="size-1.5 rounded-full bg-gold-400" aria-hidden="true" />
              Figures as at {formatDateTime(generatedAt)}
            </p>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
    </section>
  );
}

export default HeroCard;
