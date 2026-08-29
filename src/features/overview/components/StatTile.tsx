'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValueCompact } from '@/lib/format';
import type { DashboardCard } from '@/api/reports.api';

/*
 * The secondary figures — the ones worth a glance, not a chart.
 *
 * The icon chip is the only place the logo's accent colours appear at size on this screen.
 * They are FILLS BEHIND A GLYPH, never a background for text: white on accent-500 is 2.6:1
 * and fails AA outright, so every label here sits on the surface in ink.
 */

export interface StatTileProps {
  card: DashboardCard;
  icon: LucideIcon;
  /** One of the logo's four figures. Fill only — never put text on it. */
  tone: 'brand' | 'accent' | 'gold' | 'danger';
  /**
   * Render as a cell of a divided strip rather than as a card: no border, no radius, no
   * shadow. The strip around it owns those, and a card inside a card is two frames for
   * one object.
   */
  flush?: boolean;
  className?: string;
}

/*
 * The chip's fill, and the hairline that repeats it along the tile's top edge.
 *
 * The ring is what stops the paler chips — gold especially, at 1.37:1 against this surface —
 * from dissolving into the card. It is the same hue one step darker at low alpha, so the
 * chip reads as a deliberate shape rather than a smudge, without introducing a sixth colour.
 */
const TONE: Record<StatTileProps['tone'], { chip: string; edge: string }> = {
  brand: { chip: 'bg-brand-50 text-brand-700 ring-brand-500/15', edge: 'bg-brand-500' },
  accent: { chip: 'bg-accent-50 text-accent-800 ring-accent-500/20', edge: 'bg-accent-500' },
  gold: { chip: 'bg-gold-50 text-gold-700 ring-gold-500/25', edge: 'bg-gold-400' },
  danger: { chip: 'bg-danger-50 text-danger-700 ring-danger-500/15', edge: 'bg-danger-500' },
};

export function StatTile({ card, icon: Icon, tone, flush = false, className }: StatTileProps) {
  const { chip, edge } = TONE[tone];

  return (
    <article
      className={cn(
        'group relative flex items-center gap-4 overflow-hidden bg-surface p-4',
        flush
          ? // A cell cannot lift, and should not try: the strip is one object, and a
            // shadow under one quarter of it would be a corner peeling off a sheet.
            'p-5'
          : cn(
              'rounded-2xl border border-line shadow-card',
              // A lift on hover rather than a border change: the border was already the
              // quietest signal on the card and darkening it by one step is close to
              // invisible.
              'transition-shadow duration-200 hover:shadow-lift motion-reduce:transition-none'
            ),
        className
      )}
    >
      {/*
        * A short colour edge, revealed on hover. It repeats the chip's hue so the tile reads
        * as one object rather than a grey card with a coloured square parked in it — and it
        * is the only thing distinguishing four otherwise identical white rectangles at a
        * glance. Decorative: the label beside it already names the figure.
        */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-300',
          'group-hover:scale-x-100 motion-reduce:transition-none',
          edge
        )}
      />

      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
          chip
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <p className="text-2xl leading-none font-semibold tracking-[-0.025em] text-body">
          {formatValueCompact(card.value, card.unit)}
        </p>
        <p className="mt-1.5 truncate text-sm text-muted">{card.label}</p>
      </div>
    </article>
  );
}

export default StatTile;
