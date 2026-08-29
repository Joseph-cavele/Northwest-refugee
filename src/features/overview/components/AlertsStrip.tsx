'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alert, AlertSeverity } from '../lib/alerts';

/*
 * What needs a person today, at the top of the screen.
 *
 * COMPACT ON PURPOSE. Three stacked banners would push the figures they refer to below the
 * fold, and an alert that hides the thing it is about has cost more than it bought. Each is
 * one line of fact and one line of what to do.
 *
 * SEVERITY IS NEVER COLOUR ALONE. Every row carries a glyph and the word "Urgent" or
 * "Attention" beside the tint, so the ranking survives grayscale, forced-colors, and the
 * roughly one man in twelve who cannot separate red from green.
 */

/*
 * Each row is a tinted card with a SOLID SPINE down its leading edge.
 *
 * The tint alone had to do two jobs it is bad at: separate the row from the canvas, and rank
 * it against the row below. accent-50 and danger-50 are both pale washes and at a glance they
 * are the same card. The spine is the full-strength hue — 4px of it, where saturation costs
 * nothing because no text sits on it — so severity is legible before a word is read, while
 * the word and the glyph remain what actually carry it.
 */
const SEVERITY: Record<
  AlertSeverity,
  { label: string; className: string; spine: string; icon: typeof Info }
> = {
  serious: {
    label: 'Urgent',
    className: 'bg-danger-50 text-danger-700 ring-danger-500/20',
    spine: 'bg-danger-500',
    icon: AlertTriangle,
  },
  warning: {
    label: 'Attention',
    // accent-800 on accent-50, never white on accent-500 — the logo's orange is 2.6:1
    // against white and fails AA outright.
    className: 'bg-accent-50 text-accent-800 ring-accent-500/20',
    spine: 'bg-accent-500',
    icon: Info,
  },
};

/** More than this and the strip becomes the page. The rest are one tap away. */
const VISIBLE = 2;

export interface AlertsStripProps {
  alerts: Alert[];
  className?: string;
}

export function AlertsStrip({ alerts, className }: AlertsStripProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) {
    /*
     * Quiet, but not absent. "Nothing" would leave the reader unsure whether the check ran
     * at all; a single muted line confirms it did and takes no space away from the figures.
     * It does not celebrate — this is a state to notice, not congratulate.
     */
    return (
      <p
        className={cn(
          'flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-base text-muted',
          className
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-success-50"
        >
          <Check className="size-3.5 text-success-700" />
        </span>
        Nothing is past due or escalated right now.
      </p>
    );
  }

  const shown = expanded ? alerts : alerts.slice(0, VISIBLE);
  const hidden = alerts.length - shown.length;

  return (
    <section aria-label="Needs attention" className={cn('flex flex-col gap-2', className)}>
      <ul className="flex flex-col gap-2">
        {shown.map((alert) => {
          const { label, className: tone, spine, icon: Icon } = SEVERITY[alert.severity];
          return (
            <li
              key={alert.id}
              className={cn(
                'relative flex items-start gap-3 overflow-hidden rounded-2xl py-3.5 pr-4 pl-5 ring-1 ring-inset',
                tone
              )}
            >
              <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', spine)} />

              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />

              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">
                  {/*
                    * The word carries the severity; the tint only echoes it. Set as its own
                    * bordered tag rather than run into the sentence — at a glance down a
                    * stack of these, the tags line up into a column you can scan.
                    */}
                  <span className="mr-2 inline-flex items-center rounded border border-current/25 px-1.5 py-px align-[0.1em] text-xs font-bold tracking-[0.1em] uppercase">
                    {label}
                  </span>
                  {alert.message}
                </p>
                <p className="mt-1 text-base opacity-90">{alert.action}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-surface px-3.5 py-2 text-base font-medium text-muted shadow-card transition-colors hover:border-line-strong hover:text-body"
        >
          <ChevronDown className="size-4" aria-hidden="true" />
          {hidden} more {hidden === 1 ? 'thing' : 'things'} need attention
        </button>
      )}
    </section>
  );
}

export default AlertsStrip;
