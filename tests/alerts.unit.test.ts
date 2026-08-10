import { describe, it, expect } from 'vitest';
import { deriveAlerts } from '@/features/overview/lib/alerts';
import type { DashboardCard } from '@/api/reports.api';

/*
 * The rules behind the alerts strip.
 *
 * Two properties are worth a regression test because breaking either is silent. An alert
 * that fires on a healthy figure trains people to ignore the strip; an alert that reaches a
 * role which cannot see the underlying data is a disclosure.
 */

const card = (key: string, value: number): DashboardCard => ({
  key,
  label: key,
  value,
  unit: 'COUNT',
  group: 'casework',
  period: 'CURRENT',
  scoped: false,
});

describe('deriveAlerts', () => {
  it('says nothing when nothing is wrong', () => {
    const alerts = deriveAlerts([
      card('service_requests.overdue', 0),
      card('service_requests.open', 19),
      card('cases.escalated', 0),
      card('permits.expiring_30d', 0),
    ]);
    expect(alerts).toEqual([]);
  });

  it('cannot fire for a role whose cards it never received', () => {
    /*
     * THE LOAD-BEARING TEST. The rules read the cards the server sent, and the server only
     * sends what a role earns — so a comms officer, who holds no casework permission, gets
     * no casework card and therefore no casework alert. If this ever fails, the strip has
     * grown a second source of truth about permissions.
     */
    const commsOfficer = [card('donations.settled_count', 5), card('donations.settled_value', 90_000)];
    expect(deriveAlerts(commsOfficer)).toEqual([]);
  });

  it('grades overdue work by share, not by count', () => {
    // 14 of 2000 is a busy week. 14 of 19 is a queue that has stopped moving. The two must
    // not arrive on screen looking the same.
    const busy = deriveAlerts([
      card('service_requests.overdue', 14),
      card('service_requests.open', 2000),
    ]);
    const stuck = deriveAlerts([
      card('service_requests.overdue', 14),
      card('service_requests.open', 19),
    ]);

    expect(busy[0]!.severity).toBe('warning');
    expect(stuck[0]!.severity).toBe('serious');
  });

  it('still reports overdue work when the open total is missing', () => {
    // Without the denominator it cannot grade the share, but silence would be worse: the
    // work is late either way.
    const alerts = deriveAlerts([card('service_requests.overdue', 4)]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toContain('4 service requests');
  });

  it('puts the worst thing first', () => {
    // The strip shows two at a time, so ranking decides what is cut.
    const alerts = deriveAlerts([
      card('permits.expiring_30d', 2),
      card('cases.escalated', 3),
      card('service_requests.overdue', 14),
      card('service_requests.open', 19),
    ]);
    expect(alerts[0]!.severity).toBe('serious');
    expect(alerts[alerts.length - 1]!.severity).toBe('warning');
  });

  it('carries the numbers in the message and an instruction beside it', () => {
    // A vague alert is one nobody can act on — the point is the next step, not the mood.
    const [alert] = deriveAlerts([card('cases.escalated', 3)]);
    expect(alert!.message).toContain('3');
    expect(alert!.action.length).toBeGreaterThan(0);
  });

  it('gets the singular right', () => {
    const [one] = deriveAlerts([card('cases.escalated', 1)]);
    expect(one!.message).toContain('1 case ');
    expect(one!.message).not.toContain('cases');
  });

  it('gives every alert a stable id, so a list can key on it', () => {
    const alerts = deriveAlerts([
      card('cases.escalated', 1),
      card('permits.expiring_30d', 1),
      card('referrals.awaiting_follow_up', 1),
      card('transactions.pending_approval', 1),
    ]);
    const ids = alerts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
