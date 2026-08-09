import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';

const hasDb = await connect();
const base = '/api/v1/beneficiaries';

const PERMIT = 'ASY-2026-778899';
const intake = {
  firstName: 'Amina', lastName: 'Mwangi', gender: 'FEMALE', dateOfBirth: '1998-03-14',
  nationality: 'Democratic Republic of the Congo', languages: ['fr', 'sw'],
  immigration: { status: 'ASYLUM_SEEKER', permitNumber: PERMIT },
  contact: { cellphone: '082 123 4567' },
  consent: { given: true, method: 'WHATSAPP' },
  vulnerabilityFlags: ['GBV_SURVIVOR'],
};

describe.runIf(hasDb)('beneficiary routes', () => {
  let admin; let volunteer; let ed;

  beforeEach(async () => {
    await resetDatabase();
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    volunteer = await makeUser(ROLES.VOLUNTEER);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
  });
  afterAll(disconnect);

  const create = (token = admin.token, body = intake) =>
    request(app).post(base).set('Authorization', `Bearer ${token}`).send(body);

  it('requires authentication', async () => {
    expectError(await request(app).get(base), 401);
  });

  it('enforces the create permission', async () => {
    const comms = await makeUser(ROLES.COMMS_OFFICER);
    expectError(await create(comms.token), 403, 'FORBIDDEN');
  });

  it('registers a beneficiary and never echoes the permit number', async () => {
    const res = await create();
    const data = expectSuccess(res, 201);
    expect(data.referenceCode).toMatch(/^NWHR-\d{4}-/);
    expect(data.status).toBe('PENDING_VERIFICATION');
    expect(JSON.stringify(res.body)).not.toContain('778899');
    expect(data.vulnerabilityFlags).toBeUndefined();
  });

  it('normalises the cellphone to E.164', async () => {
    const data = expectSuccess(await create(), 201);
    expect(data.contact.cellphone).toBe('+27821234567');
  });

  it('refuses a minor without a guardian', async () => {
    const res = await create(admin.token, { ...intake, dateOfBirth: '2014-01-01' });
    const err = expectError(res, 422, 'VALIDATION_FAILED');
    expect(err.details).toHaveProperty('guardian');
  });

  it('refuses a record when consent was declined', async () => {
    const res = await create(admin.token, { ...intake, consent: { given: false, method: 'WHATSAPP' } });
    expectError(res, 422);
  });

  it('scopes reads — a volunteer cannot see a record they did not capture', async () => {
    const created = expectSuccess(await create(), 201);
    const res = await request(app).get(`${base}/${created._id}`).set('Authorization', `Bearer ${volunteer.token}`);
    // 404 not 403: confirming it exists would confirm the person is on the register.
    expectError(res, 404, 'NOT_FOUND');
  });

  it('caps the page size so the register cannot be dumped', async () => {
    const res = await request(app).get(`${base}?limit=100000`).set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 422);
  });

  it('gates the sensitive read behind its own permission and returns the decrypted permit', async () => {
    const created = expectSuccess(await create(), 201);

    expectError(
      await request(app).get(`${base}/${created._id}/sensitive`).set('Authorization', `Bearer ${volunteer.token}`),
      403
    );

    const res = await request(app)
      .get(`${base}/${created._id}/sensitive?reason=front desk`)
      .set('Authorization', `Bearer ${ed.token}`);
    const data = expectSuccess(res);
    expect(data.permitNumber).toBe(PERMIT);
    expect(data.vulnerabilityFlags).toEqual(['GBV_SURVIVOR']);
  });

  it('finds a beneficiary by permit number regardless of punctuation', async () => {
    const created = expectSuccess(await create(), 201);
    const res = await request(app)
      .post(`${base}/permits/lookup`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ permitNumber: 'asy 2026/778899' });
    expect(expectSuccess(res)._id).toBe(created._id);
  });

  it('resolves /permits/expiring rather than treating it as an id', async () => {
    const res = await request(app).get(`${base}/permits/expiring`).set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
  });

  it('rejects an empty PATCH instead of applying defaults over live data', async () => {
    const created = expectSuccess(await create(), 201);
    expectError(
      await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`).send({}),
      422
    );
  });

  it('does not clear vulnerability flags on an unrelated PATCH', async () => {
    const created = expectSuccess(await create(), 201);
    await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`).send({ notes: 'x' });

    const res = await request(app)
      .get(`${base}/${created._id}/sensitive`)
      .set('Authorization', `Bearer ${ed.token}`);
    expect(expectSuccess(res).vulnerabilityFlags).toEqual(['GBV_SURVIVOR']);
  });

  it('soft-deletes: the row survives but leaves the list', async () => {
    const created = expectSuccess(await create(), 201);
    const deleted = expectSuccess(
      await request(app).delete(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`)
    );
    expect(deleted.deletedAt).not.toBeNull();

    const list = await request(app).get(base).set('Authorization', `Bearer ${admin.token}`);
    expect(expectSuccess(list)).toHaveLength(0);
  });

  it('rejects a malformed id as a validation error, not a cast error', async () => {
    const res = await request(app).get(`${base}/not-an-id`).set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 422);
  });
});
