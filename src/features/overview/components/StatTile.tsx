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
  className?: string;
}

const TONE: Record<StatTileProps['tone'], string> = {
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-50 text-accent-800',
  gold: 'bg-gold-50 text-gold-700',
  danger: 'bg-danger-50 text-danger-700',
};

export function StatTile({ card, icon: Icon, tone, className }: StatTileProps) {
  return (
    <article
      className={cn(
        'flex items-center gap-3.5 rounded-xl border border-line bg-surface p-4',
        'transition-colors hover:border-line-strong',
        className
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', TONE[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xl leading-none font-semibold tracking-[-0.02em] text-body">
          {formatValueCompact(card.value, card.unit)}
        </p>
        <p className="mt-1 truncate text-xs text-muted">{card.label}</p>
      </div>
    </article>
  );
}

export default StatTile;
