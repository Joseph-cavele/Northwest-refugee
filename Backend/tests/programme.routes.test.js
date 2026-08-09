import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import { Programme } from '../src/modules/programmes/programme.model.js';

const hasDb = await connect();
const base = '/api/v1/programmes';

describe.runIf(hasDb)('programme routes', () => {
  let coord; let coord2; let admin; let ed; let volunteer; let programme;

  beforeEach(async () => {
    await resetDatabase();
    // The partial unique index backs "one live programme name per pillar".
    await Programme.syncIndexes();

    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    coord2 = await makeUser(ROLES.PROJECT_COORDINATOR);
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    volunteer = await makeUser(ROLES.VOLUNTEER);

    programme = expectSuccess(
      await request(app).post(base).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'Adult Literacy', pillar: 'EDUCATION' }),
      201
    );
    // Coordinators are scoped by User.programmes. The existing token stays valid —
    // authenticate reloads the user, so the new assignment is picked up immediately.
    coord.user.programmes = [programme._id];
    await coord.user.save();
  });
  afterAll(disconnect);

  // Programmes belong to the coordinator: PROJECT_COORDINATOR holds create/read/update,
  // while ADMIN_OFFICER and EXECUTIVE_DIRECTOR hold read only.
  const asCoord = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${coord.token}`);

  it('gives the Admin Officer read but not write on programmes', async () => {
    expectSuccess(await request(app).get(base).set('Authorization', `Bearer ${admin.token}`));
    expectError(
      await request(app).post(base).set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Admin Made', pillar: 'EDUCATION' }),
      403
    );
  });

  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(base), 401);
    expectError(await request(app).get(base).set('Authorization', `Bearer ${volunteer.token}`), 403);
  });

  it('lets the ED read but not create', async () => {
    expectSuccess(await request(app).get(base).set('Authorization', `Bearer ${ed.token}`));
    expectError(
      await request(app).post(base).set('Authorization', `Bearer ${ed.token}`)
        .send({ name: 'X', pillar: 'EDUCATION' }),
      403
    );
  });

  it('creates a programme under one of the five pillars', async () => {
    expect(programme.pillar).toBe('EDUCATION');
    expect(programme.status).toBe('PLANNED');
    const res = await request(app).post(base).set('Authorization', `Bearer ${coord.token}`)
      .send({ name: 'Nonsense', pillar: 'NOT_A_PILLAR' });
    expectError(res, 422);
  });

  it('refuses a duplicate name within the same pillar', async () => {
    const res = await request(app).post(base).set('Authorization', `Bearer ${coord.token}`)
      .send({ name: 'Adult Literacy', pillar: 'EDUCATION' });
    expectError(res, 409);
  });

  it('allows the same name under a different pillar', async () => {
    expectSuccess(
      await request(app).post(base).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'Adult Literacy', pillar: 'SOCIAL_COHESION' }),
      201
    );
  });

  it('rejects an end date before the start date', async () => {
    const res = await request(app).post(base).set('Authorization', `Bearer ${coord.token}`)
      .send({ name: 'Backwards', pillar: 'EDUCATION', startDate: '2026-06-01', endDate: '2026-01-01' });
    const err = expectError(res, 422);
    expect(err.details).toHaveProperty('endDate');
  });

  it('lets a PLANNED programme change pillar but not a live one', async () => {
    const moved = expectSuccess(
      await request(app).patch(`${base}/${programme._id}`).set('Authorization', `Bearer ${coord.token}`)
        .send({ pillar: 'SOCIAL_COHESION' })
    );
    expect(moved.pillar).toBe('SOCIAL_COHESION');

    await request(app).patch(`${base}/${programme._id}`).set('Authorization', `Bearer ${coord.token}`)
      .send({ status: 'ACTIVE' });

    // Moving a live programme would silently rewrite every figure that grouped by pillar.
    const res = await request(app).patch(`${base}/${programme._id}`).set('Authorization', `Bearer ${coord.token}`)
      .send({ pillar: 'EDUCATION' });
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/PLANNED/);
  });

  it('scopes a coordinator to their assigned programmes', async () => {
    const other = expectSuccess(
      await request(app).post(base).set('Authorization', `Bearer ${coord2.token}`)
        .send({ name: 'Someone Elses', pillar: 'SOCIAL_COHESION' }),
      201
    );

    const list = expectSuccess(await asCoord('get', base));
    expect(list.map((p) => p._id)).toEqual([programme._id]);

    // Regression guard: the scope clause and the requested id are both on _id. If they
    // are merged rather than intersected, this returns the coordinator's OWN programme
    // with a 200 instead of a 404 — and PATCH would edit the wrong record.
    const leaked = await asCoord('get', `${base}/${other._id}`);
    expect(leaked.status).toBe(404);
    expect(leaked.body?.data?._id).toBeUndefined();

    // The Admin Officer reads programmes without being scoped to any.
    expect(expectSuccess(await request(app).get(base).set('Authorization', `Bearer ${admin.token}`))).toHaveLength(2);
  });

  it('creates a cohort and rejects one whose dates run backwards', async () => {
    const cohort = expectSuccess(
      await request(app).post(`${base}/${programme._id}/cohorts`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: '2026 Intake', startDate: '2026-02-01', endDate: '2026-05-31' }),
      201
    );
    expect(cohort.capacity).toBe(30);
    expect(cohort.isEnrollable).toBe(true);
    expect(cohort.durationDays).toBe(119);

    expectError(
      await request(app).post(`${base}/${programme._id}/cohorts`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'Bad', startDate: '2026-05-01', endDate: '2026-02-01' }),
      422
    );
  });

  it('schedules a session only within its cohort dates', async () => {
    const cohort = expectSuccess(
      await request(app).post(`${base}/${programme._id}/cohorts`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: '2026 Intake', startDate: '2026-02-01', endDate: '2026-05-31' }),
      201
    );
    const url = `${base}/cohorts/${cohort._id}/sessions`;

    const session = expectSuccess(
      await request(app).post(url).set('Authorization', `Bearer ${coord.token}`)
        .send({ title: 'Week 1', scheduledAt: '2026-02-03T09:00:00.000Z' }),
      201
    );
    expect(session.durationMinutes).toBe(60);
    expect(new Date(session.endsAt) - new Date(session.scheduledAt)).toBe(60 * 60 * 1000);

    // A session outside the cohort only surfaces when attendance is taken for a day the
    // cohort was not running.
    const outside = await request(app).post(url).set('Authorization', `Bearer ${coord.token}`)
      .send({ title: 'Too early', scheduledAt: '2026-01-15T09:00:00.000Z' });
    expectError(outside, 400);

    // The end date is a whole day, so the last day itself is inside the window.
    expectSuccess(
      await request(app).post(url).set('Authorization', `Bearer ${coord.token}`)
        .send({ title: 'Last day', scheduledAt: '2026-05-31T16:00:00.000Z' }),
      201
    );
  });

  it('requires a reason to cancel a session', async () => {
    const cohort = expectSuccess(
      await request(app).post(`${base}/${programme._id}/cohorts`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'Cohort A', startDate: '2026-02-01', endDate: '2026-05-31' }),
      201
    );
    const session = expectSuccess(
      await request(app).post(`${base}/cohorts/${cohort._id}/sessions`).set('Authorization', `Bearer ${coord.token}`)
        .send({ title: 'Week 1', scheduledAt: '2026-02-03T09:00:00.000Z' }),
      201
    );

    expectError(
      await request(app).patch(`${base}/sessions/${session._id}`).set('Authorization', `Bearer ${coord.token}`)
        .send({ status: 'CANCELLED' }),
      422
    );
    expectSuccess(
      await request(app).patch(`${base}/sessions/${session._id}`).set('Authorization', `Bearer ${coord.token}`)
        .send({ status: 'CANCELLED', cancellationReason: 'Facilitator unavailable' })
    );
  });

  it('refuses to archive a programme with a live cohort', async () => {
    await request(app).post(`${base}/${programme._id}/cohorts`).set('Authorization', `Bearer ${coord.token}`)
      .send({ name: 'Running', startDate: '2026-02-01', endDate: '2026-05-31' });

    const res = await request(app).post(`${base}/${programme._id}/archive`).set('Authorization', `Bearer ${coord.token}`);
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/still open or running/);
  });

  it('archives once every cohort is closed, and then refuses edits', async () => {
    const archived = expectSuccess(
      await request(app).post(`${base}/${programme._id}/archive`).set('Authorization', `Bearer ${coord.token}`)
    );
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.isArchived).toBe(true);

    expectError(
      await request(app).patch(`${base}/${programme._id}`).set('Authorization', `Bearer ${coord.token}`)
        .send({ description: 'x' }),
      409
    );
    expectError(await request(app).post(`${base}/${programme._id}/archive`).set('Authorization', `Bearer ${coord.token}`), 409);
  });

  it('rejects an empty PATCH', async () => {
    expectError(
      await request(app).patch(`${base}/${programme._id}`).set('Authorization', `Bearer ${coord.token}`).send({}),
      422
    );
  });

  it('resolves /cohorts/:id without treating it as a programme id', async () => {
    const cohort = expectSuccess(
      await request(app).post(`${base}/${programme._id}/cohorts`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'Cohort A', startDate: '2026-02-01', endDate: '2026-05-31' }),
      201
    );
    const res = await request(app).get(`${base}/cohorts/${cohort._id}`).set('Authorization', `Bearer ${coord.token}`);
    expect(expectSuccess(res)._id).toBe(cohort._id);
  });
});
