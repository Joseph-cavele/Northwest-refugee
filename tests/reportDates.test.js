import { describe, it, expect } from 'vitest';
import { startOfDaySAST, startOfMonthSAST, sastDayRange } from '../src/utils/dates.js';
import { METRICS, METRIC_KEYS } from '../src/modules/reports/metric.model.js';

// No database needed: these are the pure pieces the reporting module is built on, and the
// day boundary is the one most likely to be quietly wrong for two hours every night.

describe('SAST calendar days', () => {
  it('files 00:30 SAST under that day, not the one before', async () => {
    // 21:30 UTC on the 8th is 23:30 SAST on the 8th; 22:30 UTC is 00:30 SAST on the 9th.
    // A UTC-based bucket puts both on the 8th, and everything the WhatsApp bot captures
    // overnight lands on the wrong day.
    const lateEvening = startOfDaySAST(new Date('2026-08-08T21:30:00Z'));
    const justAfterMidnight = startOfDaySAST(new Date('2026-08-08T22:30:00Z'));

    expect(lateEvening.toISOString()).toBe('2026-08-07T22:00:00.000Z'); // SAST 8 Aug 00:00
    expect(justAfterMidnight.toISOString()).toBe('2026-08-08T22:00:00.000Z'); // SAST 9 Aug 00:00
    expect(justAfterMidnight.getTime()).toBeGreaterThan(lateEvening.getTime());
  });

  it('is stable across the southern summer — South Africa keeps no daylight saving', async () => {
    for (const month of ['01', '04', '07', '10']) {
      const midnight = startOfDaySAST(new Date(`2026-${month}-15T12:00:00Z`));
      // Always 22:00 UTC the previous day. A country that shifted would break this.
      expect(midnight.toISOString()).toMatch(/T22:00:00\.000Z$/);
    }
  });

  it('accepts a plain date string, which is what a query parameter carries', async () => {
    expect(startOfDaySAST('2026-03-01').toISOString()).toBe('2026-02-28T22:00:00.000Z');
    expect(startOfDaySAST('not a date')).toBe(null);
  });

  it('tiles: one day ends exactly where the next begins', async () => {
    const first = sastDayRange(new Date('2026-08-08T12:00:00Z'));
    const second = sastDayRange(new Date('2026-08-09T12:00:00Z'));

    // Half-open. An inclusive 23:59:59.999 end drops the final millisecond of every day,
    // and two consecutive days then fail to cover the gap between them.
    expect(first.to.getTime()).toBe(second.from.getTime());
    expect(first.to.getTime() - first.from.getTime()).toBe(86_400_000);
  });

  it('starts a month at SAST midnight on the first', async () => {
    expect(startOfMonthSAST(new Date('2026-08-20T12:00:00Z')).toISOString()).toBe(
      '2026-07-31T22:00:00.000Z'
    );
    // 00:30 SAST on the 1st is still the new month, not the last hour of the old one.
    expect(startOfMonthSAST(new Date('2026-07-31T22:30:00Z')).toISOString()).toBe(
      '2026-07-31T22:00:00.000Z'
    );
  });
});

describe('metric vocabulary', () => {
  it('gives every metric a label, a unit and a kind', async () => {
    expect(METRIC_KEYS.length).toBeGreaterThan(0);
    for (const key of METRIC_KEYS) {
      const definition = METRICS[key];
      expect(definition.label).toBeTruthy();
      expect(['COUNT', 'CENTS']).toContain(definition.unit);
      expect(['STOCK', 'FLOW']).toContain(definition.kind);
      expect(key).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
    }
  });

  it('marks money as cents so nothing downstream can read it as rands', async () => {
    expect(METRICS['donations.settled_value'].unit).toBe('CENTS');
    expect(METRICS['transactions.pending_approval_value'].unit).toBe('CENTS');
    // The count beside it is a count — a card that mixed the two would be unreadable.
    expect(METRICS['donations.settled_count'].unit).toBe('COUNT');
  });

  it('marks a level as a STOCK, which a chart must never sum across days', async () => {
    expect(METRICS['cases.open'].kind).toBe('STOCK');
    expect(METRICS['enrollments.active'].kind).toBe('STOCK');
    // ...and a period total as a FLOW, which it must.
    expect(METRICS['cases.closed'].kind).toBe('FLOW');
    expect(METRICS['beneficiaries.registered'].kind).toBe('FLOW');
  });

  it('breaks nothing down by an axis that could identify a person', async () => {
    // Rustenburg's refugee community is small enough that a cell of one is a name. Adding
    // an axis here is a POPIA decision — this test is the tripwire, not the policy.
    const axes = Object.values(METRICS).flatMap((definition) => definition.dimensions ?? []);
    expect(new Set(axes)).toEqual(new Set(['pillar']));
  });
});
