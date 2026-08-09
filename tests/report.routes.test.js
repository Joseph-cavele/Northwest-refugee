import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import Case from '../src/modules/cases/case.model.js';
import Metric, { METRICS } from '../src/modules/reports/metric.model.js';
import { startOfDaySAST } from '../src/utils/dates.js';
import { openCase, listCases } from '../src/modules/cases/case.service.js';
import { createServiceRequest } from '../src/modules/serviceRequests/serviceRequest.service.js';
import { snapshotDailyMetrics } from '../src/modules/reports/report.service.js';

const hasDb = await connect();
const base = '/api/v1/reports';

describe.runIf(hasDb)('report routes', () => {
  let ed; let admin; let me; let coord; let finance; let comms; let volunteer;

  beforeEach(async () => {
    await resetDatabase();
    // The partial unique index behind "one active case per person" has to exist on a
    // freshly emptied collection, or the fixtures below stack up silently.
    await Case.syncIndexes();

    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    me = await makeUser(ROLES.ME_OFFICER);
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    finance = await makeUser(ROLES.FINANCE_OFFICER);
    comms = await makeUser(ROLES.COMMS_OFFICER);
    volunteer = await makeUser(ROLES.VOLUNTEER);
  });
  afterAll(disconnect);

  const get = (path, token) => request(app).get(`${base}${path}`).set('Authorization', `Bearer ${token}`);
  const keysOf = (cards) => cards.map((card) => card.key);

  // --- cards --------------------------------------------------------------------

  describe('GET /cards', () => {
    it('needs a session and report:read', async () => {
      expectError(await request(app).get(`${base}/cards`), 401);
      // Volunteers and peer leaders hold neither reporting permission: they work from
      // their own queues, not from organisation-wide figures.
      expectError(await get('/cards', volunteer.token), 403);
      for (const user of [ed, admin, me, coord, finance, comms]) {
        expectSuccess(await get('/cards', user.token));
      }
    });

    it('omits a card the caller may not see rather than showing it as zero', async () => {
      const commsCards = expectSuccess(await get('/cards', comms.token)).cards;
      const edCards = expectSuccess(await get('/cards', ed.token)).cards;

      // A comms officer holds no beneficiary or case access at all. "0 open cases" would
      // be a statement about the caseload; the truth is that they cannot see it.
      expect(keysOf(commsCards)).not.toContain('cases.open');
      expect(keysOf(commsCards)).not.toContain('beneficiaries.active');
      expect(commsCards.every((card) => card.value !== null && card.value !== undefined)).toBe(true);

      expect(keysOf(edCards)).toContain('cases.open');
      expect(keysOf(commsCards)).toContain('donations.settled_value');
    });

    it('gives a finance officer money but not people', async () => {
      const cards = expectSuccess(await get('/cards', finance.token)).cards;
      const groups = new Set(cards.map((card) => card.group));

      expect(groups.has('finance')).toBe(true);
      expect(groups.has('fundraising')).toBe(true);
      expect(groups.has('register')).toBe(false);
      expect(groups.has('casework')).toBe(false);
    });

    it('labels every card from the metric vocabulary, with its unit and window', async () => {
      const { cards, generatedAt } = expectSuccess(await get('/cards', ed.token));
      expect(new Date(generatedAt).getTime()).toBeLessThanOrEqual(Date.now());

      for (const card of cards) {
        expect(METRICS[card.key]).toBeTruthy();
        expect(card.label).toBe(METRICS[card.key].label);
        expect(card.unit).toBe(METRICS[card.key].unit);
        expect(['CURRENT', 'MONTH_TO_DATE']).toContain(card.period);
        expect(Number.isSafeInteger(card.value)).toBe(true);
      }
    });

    it('reports money in cents, never rands', async () => {
      const cards = expectSuccess(await get('/cards', finance.token)).cards;
      const money = cards.filter((card) => card.unit === 'CENTS');
      expect(money.length).toBeGreaterThan(0);
      // Integers all the way out. Formatting is the client's job — a card that had already
      // been divided by 100 could not be added to anything.
      expect(money.every((card) => Number.isSafeInteger(card.value))).toBe(true);
    });

    it('counts the same rows the list screen shows, for a programme-scoped caller', async () => {
      const beneficiary = await makeBeneficiary(admin.user);
      await openCase({ beneficiary: String(beneficiary._id), category: 'LEGAL_DOCUMENTATION' }, admin.user);

      // A coordinator with no programmes assigned matches nothing — an empty $in is the
      // correct answer, not an open query.
      const cards = expectSuccess(await get('/cards', coord.token)).cards;
      const openCard = cards.find((card) => card.key === 'cases.open');
      const { meta } = await listCases({ page: 1, limit: 25, sort: '-openedAt', openOnly: true }, coord.user);

      expect(openCard.value).toBe(meta.total);
      expect(openCard.value).toBe(0);

      // The ED reads across the organisation and sees the same case the list does.
      const edCards = expectSuccess(await get('/cards', ed.token)).cards;
      expect(edCards.find((card) => card.key === 'cases.open').value).toBe(1);
    });

    it('says whether a figure is the caller\'s own caseload or the organisation\'s', async () => {
      const coordCards = expectSuccess(await get('/cards', coord.token)).cards;
      const edCards = expectSuccess(await get('/cards', ed.token)).cards;

      // The UI cannot tell from the number alone, and captioning an ED's figure as "yours"
      // — or a coordinator's as the organisation's — is the whole point of the flag.
      expect(coordCards.find((card) => card.key === 'cases.open').scoped).toBe(true);
      expect(edCards.find((card) => card.key === 'cases.open').scoped).toBe(false);
      // The ledger is organisation-wide for everyone who can read it.
      expect(edCards.find((card) => card.key === 'transactions.pending_approval').scoped).toBe(false);
    });
  });

  // --- the stored series --------------------------------------------------------

  describe('GET /metrics', () => {
    it('is held behind metric:read, which is narrower than report:read', async () => {
      expectError(await request(app).get(`${base}/metrics`), 401);
      for (const user of [ed, me, finance, comms]) expectSuccess(await get('/metrics', user.token));
      // Both hold report:read and see their own cards, but the stored series is unscoped —
      // a coordinator reading it would see totals covering programmes they are not on.
      for (const user of [admin, coord]) expectError(await get('/metrics', user.token), 403);
    });

    it('publishes the vocabulary, including whether a series may be summed', async () => {
      const definitions = expectSuccess(await get('/metrics/definitions', me.token));
      const byKey = Object.fromEntries(definitions.map((d) => [d.key, d]));

      expect(byKey['cases.open'].kind).toBe('STOCK');
      expect(byKey['cases.closed'].kind).toBe('FLOW');
      expect(byKey['donations.settled_value'].unit).toBe('CENTS');
    });

    it('rejects a metric key that does not exist instead of returning an empty page', async () => {
      const error = expectError(await get('/metrics?key=cases.invented', me.token), 422, 'VALIDATION_FAILED');
      expect(error.details.key).toBeTruthy();
    });

    it('returns organisation-wide rows only unless a dimension is asked for', async () => {
      await snapshotDailyMetrics({});

      const totals = expectSuccess(await get('/metrics?key=service_requests.open&limit=100', me.token));
      expect(totals.length).toBe(1);
      expect(totals[0].dimension).toBe(null);

      // Five pillars, every one written even at zero: a chart that silently loses a bar
      // reads as a pillar that was discontinued.
      const byPillar = expectSuccess(
        await get('/metrics?key=service_requests.open&dimension=pillar&limit=100', me.token)
      );
      expect(byPillar.length).toBe(5);
      expect(byPillar.every((row) => row.dimension === 'pillar')).toBe(true);
    });

    it('reads a series forward in time, unlike every list in this API', async () => {
      await snapshotDailyMetrics({ date: new Date(Date.now() - 86_400_000) });
      await snapshotDailyMetrics({});

      const rows = expectSuccess(await get('/metrics?key=cases.open&limit=100', me.token));
      expect(rows.length).toBe(2);
      expect(new Date(rows[0].date).getTime()).toBeLessThan(new Date(rows[1].date).getTime());
    });
  });

  // --- snapshots ----------------------------------------------------------------

  describe('POST /snapshots', () => {
    const snapshot = (token, body) => {
      const req = request(app).post(`${base}/snapshots`).set('Authorization', `Bearer ${token}`);
      return body ? req.send(body) : req;
    };

    it('is held by the one role whose job is producing the figures', async () => {
      expectError(await snapshot(volunteer.token), 403);
      // report:create is the M&E Officer's alone — everyone else reads what it produced.
      for (const user of [ed, admin, coord, finance, comms]) expectError(await snapshot(user.token), 403);
      expectSuccess(await snapshot(me.token), 201);
    });

    it('accepts a bodyless request as "recompute today"', async () => {
      const data = expectSuccess(await snapshot(me.token), 201);
      expect(data.metrics).toBeGreaterThan(0);
      expect(new Date(data.date).getTime()).toBe(startOfDaySAST(new Date()).getTime());
    });

    it('corrects the day rather than stacking a second copy behind it', async () => {
      const beneficiary = await makeBeneficiary(admin.user);
      expectSuccess(await snapshot(me.token), 201);

      await createServiceRequest(
        { beneficiary: String(beneficiary._id), category: 'FOOD_ASSISTANCE' },
        admin.user
      );
      expectSuccess(await snapshot(me.token), 201);

      // The unique index is the guarantee, not the code that calls it: a job that failed
      // halfway and was re-run must not double every figure it had already written. The
      // second run overwrites 0 with 1 rather than leaving both rows in the table.
      const rows = await Metric.find({ key: 'service_requests.open', dimension: null }).exec();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(1);
    });

    it('refuses to backfill a day whose levels cannot be reconstructed', async () => {
      const lastMonth = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const error = expectError(await snapshot(me.token, { date: lastMonth }), 400, 'BAD_REQUEST');
      // Nothing records that a case was open a month ago, only that it is closed now.
      // Backfilling would write today's level under an old date.
      expect(error.message).toMatch(/cannot be reconstructed/i);
    });

    it('refuses a day that has not happened', async () => {
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expectError(await snapshot(me.token, { date: tomorrow }), 400, 'BAD_REQUEST');
    });

    it('stores whole numbers with the unit they were counted in', async () => {
      expectSuccess(await snapshot(me.token), 201);
      const rows = await Metric.find({}).exec();

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Number.isSafeInteger(row.value)).toBe(true);
        expect(row.unit).toBe(METRICS[row.key].unit);
        expect(row.kind).toBe(METRICS[row.key].kind);
      }
      // Money stays in cents in the stored series too — a table that mixed rands and cents
      // is one nobody can total.
      const money = rows.find((row) => row.key === 'donations.settled_value');
      expect(money.unit).toBe('CENTS');
    });

    it('carries no personal information — only counts', async () => {
      const beneficiary = await makeBeneficiary(admin.user, {
        immigration: { status: 'ASYLUM_SEEKER', permitNumber: 'ASY-2026-778899' },
      });
      await openCase({ beneficiary: String(beneficiary._id), category: 'GBV_SUPPORT' }, admin.user);
      expectSuccess(await snapshot(me.token), 201);

      // The M&E Officer holds no beneficiary:read_sensitive, and the metrics table is read
      // by roles with no beneficiary access at all. Nothing here may identify anyone.
      const series = await get('/metrics?limit=100', me.token);
      const body = JSON.stringify(series.body);
      expect(body).not.toContain('778899');
      expect(body).not.toContain(beneficiary.referenceCode);
      expect(body).not.toContain(beneficiary.lastName);
    });
  });
});
