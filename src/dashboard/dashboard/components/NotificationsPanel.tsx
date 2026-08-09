'use client';

import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  FileText,
  Info,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/dates';
import type { NotificationRow } from '@/api/notifications.api';
import type { NotificationPriority, NotificationType } from '@/types/enums';

/*
 * The bell, as a panel.
 *
 * Every row here belongs to the signed-in user — no route accepts a user id, so there is no
 * way to render someone else's. That is worth knowing when reading this file: the access
 * control is upstream, in the service's `user: actor._id` filter, not in anything below.
 *
 * The rollup job addresses notifications to a person on purpose ("3 of your service requests
 * are past due") and carries COUNTS ONLY, never a beneficiary's name — a bell notification
 * naming someone discloses to whoever is reading over a shoulder. Keep it that way.
 */

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  ACCESS_REQUEST: UserPlus,
  BENEFICIARY: Users,
  DONATION: Banknote,
  CAMPAIGN: Banknote,
  PROGRAMME: CalendarDays,
  REFERRAL: FileText,
  USER: UserPlus,
  SYSTEM: Info,
};

/*
 * Priority tints the icon only. It never colours the text, and it is never the sole signal:
 * URGENT and HIGH also carry a warning glyph, and the message itself says what is wrong.
 */
const PRIORITY_STYLE: Record<NotificationPriority, string> = {
  LOW: 'bg-ink-100 text-ink-600',
  MEDIUM: 'bg-brand-50 text-brand-700',
  HIGH: 'bg-accent-50 text-accent-800',
  URGENT: 'bg-danger-50 text-danger-700',
};

export interface NotificationsPanelProps {
  notifications: NotificationRow[];
}

export function NotificationsPanel({ notifications }: NotificationsPanelProps) {
  if (notifications.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        Nothing needs your attention.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {notifications.map((row) => {
        const Icon = TYPE_ICON[row.type] ?? Info;
        const escalated = row.priority === 'HIGH' || row.priority === 'URGENT';

        return (
          <li key={row._id} className="flex gap-3 px-5 py-3.5">
            <span
              className={cn(
                'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                PRIORITY_STYLE[row.priority]
              )}
            >
              {escalated ? (
                <AlertTriangle className="size-4" aria-hidden="true" />
              ) : (
                <Icon className="size-4" aria-hidden="true" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-sm',
                  // Unread is weight, not colour — it survives grayscale and forced-colors.
                  row.isRead ? 'text-muted' : 'font-semibold text-body'
                )}
              >
                {row.title}
              </p>
              <p className="truncate text-xs text-muted">{row.message}</p>
              <p className="mt-0.5 text-xs text-subtle">
                {formatRelative(row.createdAt)}
                {escalated && <span className="ml-2 font-semibold text-danger-700">Urgent</span>}
              </p>
            </div>

            {!row.isRead && (
              <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-500">
                <span className="sr-only">Unread</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default NotificationsPanel;
