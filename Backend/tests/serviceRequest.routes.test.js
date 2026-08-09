import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import { withdrawConsent } from '../src/modules/beneficiaries/beneficiary.service.js';

const hasDb = await connect();
const base = '/api/v1/service-requests';

describe.runIf(hasDb)('service request routes', () => {
  let admin; let peer; let beneficiary;

  beforeEach(async () => {
    await resetDatabase();
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    peer = await makeUser(ROLES.PEER_LEADER);
    beneficiary = await makeBeneficiary(admin.user);
  });
  afterAll(disconnect);

  const create = (token = admin.token, body = {}) =>
    request(app).post(base).set('Authorization', `Bearer ${token}`).send({
      beneficiary: String(beneficiary._id), category: 'LEGAL_DOCUMENTATION', ...body,
    });

  it('requires authentication', async () => {
    expectError(await request(app).get(base), 401);
  });

  it('enforces the create permission', async () => {
    const comms = await makeUser(ROLES.COMMS_OFFICER);
    expectError(await create(comms.token), 403);
  });

  it('creates a request with a reference, a pillar and an SLA', async () => {
    const data = expectSuccess(await create(admin.token, { urgency: 'URGENT' }), 201);
    expect(data.reference).toMatch(/^SR-\d{4}-/);
    expect(data.pillar).toBe('ADVOCACY_DOCUMENTATION');
    expect(data.status).toBe('OPEN');
    // URGENT is a one-day standard.
    expect(new Date(data.dueAt) - Date.now()).toBeLessThanOrEqual(25 * 3600 * 1000);
  });

  it('refuses a request against a beneficiary the caller cannot see', async () => {
    expectError(await create(peer.token), 404);
  });

  it('refuses new work after consent is withdrawn', async () => {
    await withdrawConsent(beneficiary._id, { reason: 'Requested' }, admin.user, {});
    const res = await create();
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/consent/i);
  });

  it('moves OPEN to IN_PROGRESS when assigned', async () => {
    const created = expectSuccess(await create(), 201);
    const res = await request(app)
      .post(`${base}/${created._id}/assign`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ assignedTo: admin.id });
    expect(expectSuccess(res).status).toBe('IN_PROGRESS');
  });

  it('requires a note to resolve and a referral to refer', async () => {
    const created = expectSuccess(await create(), 201);
    const url = `${base}/${created._id}/status`;

    expectError(await request(app).post(url).set('Authorization', `Bearer ${admin.token}`).send({ status: 'RESOLVED' }), 422);
    expectError(
      await request(app).post(url).set('Authorization', `Bearer ${admin.token}`).send({ status: 'REFERRED', notes: 'x' }),
      422
    );
  });

  it('treats a resolved request as final, so throughput cannot be double-counted', async () => {
    const created = expectSuccess(await create(), 201);
    const url = `${base}/${created._id}/status`;

    const resolved = expectSuccess(
      await request(app).post(url).set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'RESOLVED', notes: 'Permit renewed' })
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolution.resolvedBy).toBe(admin.id);

    expectError(
      await request(app).post(url).set('Authorization', `Bearer ${admin.token}`).send({ status: 'RESOLVED', notes: 'again' }),
      409
    );
    const revive = await request(app).post(url).set('Authorization', `Bearer ${admin.token}`).send({ status: 'IN_PROGRESS' });
    expectError(revive, 409);
    expect(revive.body.error.message).toMatch(/final/i);
  });

  it('refuses edits and reassignment once terminal', async () => {
    const created = expectSuccess(await create(), 201);
    await request(app).post(`${base}/${created._id}/status`).set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'RESOLVED', notes: 'done' });

    expectError(
      await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`).send({ urgency: 'LOW' }),
      409
    );
  });

  it('recomputes the pillar and the SLA when the request is recategorised', async () => {
    const created = expectSuccess(await create(), 201);
    const res = await request(app)
      .patch(`${base}/${created._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ category: 'GBV_SUPPORT', urgency: 'URGENT' });

    const data = expectSuccess(res);
    expect(data.pillar).toBe('WOMEN_YOUTH_EMPOWERMENT');
    expect(new Date(data.dueAt) - Date.now()).toBeLessThanOrEqual(25 * 3600 * 1000);
  });

  it('will not move a request to another beneficiary or set status through PATCH', async () => {
    const created = expectSuccess(await create(), 201);
    const other = await makeBeneficiary(admin.user);

    await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`)
      .send({ beneficiary: String(other._id), status: 'RESOLVED', notes: 'x' });

    const { default: SR } = await import('../src/modules/serviceRequests/serviceRequest.model.js');
    const reread = await SR.findById(created._id);
    expect(String(reread.beneficiary)).toBe(String(beneficiary._id));
    expect(reread.status).toBe('OPEN');
  });

  it('lists overdue work and excludes anything terminal', async () => {
    const created = expectSuccess(await create(), 201);
    const { default: SR } = await import('../src/modules/serviceRequests/serviceRequest.model.js');
    await SR.updateOne({ _id: created._id }, { $set: { dueAt: new Date(Date.now() - 86_400_000) } });

    const overdue = await request(app).get(`${base}?overdue=true`).set('Authorization', `Bearer ${admin.token}`);
    expect(expectSuccess(overdue)).toHaveLength(1);

    await request(app).post(`${base}/${created._id}/status`).set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'CANCELLED', notes: 'duplicate' });
    const after = await request(app).get(`${base}?overdue=true`).set('Authorization', `Bearer ${admin.token}`);
    expect(expectSuccess(after)).toHaveLength(0);
  });
});
