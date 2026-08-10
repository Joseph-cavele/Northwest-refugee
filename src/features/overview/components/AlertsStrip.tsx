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

const SEVERITY: Record<AlertSeverity, { label: string; className: string; icon: typeof Info }> = {
  serious: {
    label: 'Urgent',
    className: 'bg-danger-50 text-danger-700 ring-danger-500/25',
    icon: AlertTriangle,
  },
  warning: {
    label: 'Attention',
    // accent-800 on accent-50, never white on accent-500 — the logo's orange is 2.6:1
    // against white and fails AA outright.
    className: 'bg-accent-50 text-accent-800 ring-accent-500/25',
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
      <p className={cn('flex items-center gap-2 text-sm text-muted', className)}>
        <Check className="size-4 text-success-500" aria-hidden="true" />
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
          const { label, className: tone, icon: Icon } = SEVERITY[alert.severity];
          return (
            <li
              key={alert.id}
              className={cn('flex items-start gap-3 rounded-xl px-4 py-3 ring-1', tone)}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {/* The word carries the severity; the tint only echoes it. */}
                  <span className="mr-2 text-[0.6875rem] tracking-[0.08em] uppercase opacity-80">
                    {label}
                  </span>
                  {alert.message}
                </p>
                <p className="mt-0.5 text-sm opacity-90">{alert.action}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted hover:text-body"
        >
          <ChevronDown className="size-4" aria-hidden="true" />
          {hidden} more {hidden === 1 ? 'thing' : 'things'} need attention
        </button>
      )}
    </section>
  );
}

export default AlertsStrip;
