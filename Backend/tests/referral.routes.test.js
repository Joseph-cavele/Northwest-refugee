import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import { withdrawConsent } from '../src/modules/beneficiaries/beneficiary.service.js';

const hasDb = await connect();
const base = '/api/v1/referrals';

describe.runIf(hasDb)('referral routes', () => {
  let admin; let beneficiary;

  const consent = { given: true, method: 'SIGNED_FORM' };
  const organisation = { name: 'Legal Aid SA — Rustenburg', type: 'LEGAL_AID' };

  beforeEach(async () => {
    await resetDatabase();
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    beneficiary = await makeBeneficiary(admin.user);
  });
  afterAll(disconnect);

  const create = (token = admin.token, body = {}) =>
    request(app).post(base).set('Authorization', `Bearer ${token}`).send({
      beneficiary: String(beneficiary._id),
      category: 'LEGAL_DOCUMENTATION',
      organisation,
      informationSharing: consent,
      ...body,
    });

  const setStatus = (id, body, token = admin.token) =>
    request(app).post(`${base}/${id}/status`).set('Authorization', `Bearer ${token}`).send(body);

  it('requires authentication', async () => {
    expectError(await request(app).get(base), 401);
  });

  it('enforces the create permission', async () => {
    const comms = await makeUser(ROLES.COMMS_OFFICER);
    expectError(await create(comms.token), 403);
  });

  it('creates a referral with a reference, a pillar and a follow-up date', async () => {
    const data = expectSuccess(await create(admin.token, { urgency: 'URGENT' }), 201);
    expect(data.reference).toMatch(/^REF-\d{4}-/);
    expect(data.pillar).toBe('ADVOCACY_DOCUMENTATION');
    expect(data.status).toBe('PENDING');
    expect(data.direction).toBe('OUTBOUND');
    // URGENT is a one-day standard, same as a service request's.
    expect(new Date(data.followUpAt) - Date.now()).toBeLessThanOrEqual(25 * 3600 * 1000);
    expect(data.informationSharing.witnessedBy).toBe(admin.id);
  });

  it('refuses an outbound referral with no recorded sharing consent', async () => {
    const res = await request(app).post(base).set('Authorization', `Bearer ${admin.token}`).send({
      beneficiary: String(beneficiary._id),
      category: 'LEGAL_DOCUMENTATION',
      organisation,
    });
    expectError(res, 422);
    expect(res.body.error.details).toHaveProperty('informationSharing');
  });

  it('accepts an inbound referral without one, because the disclosure was not ours', async () => {
    const data = expectSuccess(
      await request(app).post(base).set('Authorization', `Bearer ${admin.token}`).send({
        beneficiary: String(beneficiary._id),
        category: 'SHELTER',
        direction: 'INBOUND',
        organisation: { name: 'Tshwaranang Shelter', type: 'SHELTER' },
      }),
      201
    );
    expect(data.direction).toBe('INBOUND');
    expect(data.informationSharing).toBeNull();
  });

  it('refuses a referral for a beneficiary the caller cannot see', async () => {
    // A coordinator with no programmes assigned matches nothing, which is the correct
    // answer rather than an open query.
    const coordinator = await makeUser(ROLES.PROJECT_COORDINATOR);
    expectError(await create(coordinator.token), 404);
  });

  it('refuses to refer someone who has withdrawn consent', async () => {
    await withdrawConsent(beneficiary._id, { reason: 'Requested' }, admin.user, {});
    const res = await create();
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/consent/i);
  });

  it('refuses to file a referral under another beneficiary\'s service request', async () => {
    const other = await makeBeneficiary(admin.user);
    const request_ = expectSuccess(
      await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${admin.token}`)
        .send({ beneficiary: String(other._id), category: 'LEGAL_DOCUMENTATION' }),
      201
    );

    const res = await create(admin.token, { serviceRequest: request_._id });
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/different beneficiary/i);

    // And the same rule on the way in through PATCH, or it is one edit away from bypassed.
    const created = expectSuccess(await create(), 201);
    expectError(
      await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`)
        .send({ serviceRequest: request_._id }),
      409
    );
  });

  it('requires a note on every outcome, so a decline always carries its reason', async () => {
    const created = expectSuccess(await create(), 201);
    expectError(await setStatus(created._id, { status: 'DECLINED' }), 422);
    expectError(await setStatus(created._id, { status: 'CANCELLED' }), 422);
    expectSuccess(await setStatus(created._id, { status: 'ACCEPTED' }));
  });

  it('treats a completed referral as final, so onward referrals cannot be double-counted', async () => {
    const created = expectSuccess(await create(), 201);
    expectSuccess(await setStatus(created._id, { status: 'ACCEPTED' }));

    const done = expectSuccess(
      await setStatus(created._id, { status: 'COMPLETED', notes: 'Permit application lodged' })
    );
    expect(done.status).toBe('COMPLETED');
    expect(done.outcome.recordedBy).toBe(admin.id);
    expect(done.respondedAt).not.toBeNull();
    expect(done.closedAt).not.toBeNull();

    expectError(await setStatus(created._id, { status: 'COMPLETED', notes: 'again' }), 409);
    const revive = await setStatus(created._id, { status: 'ACCEPTED' });
    expectError(revive, 409);
    expect(revive.body.error.message).toMatch(/final/i);
  });

  it('refuses edits once terminal', async () => {
    const created = expectSuccess(await create(), 201);
    await setStatus(created._id, { status: 'DECLINED', notes: 'No appointment slots' });

    expectError(
      await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`)
        .send({ urgency: 'LOW' }),
      409
    );
  });

  it('patches contact details but never the organisation, the person or the status', async () => {
    const created = expectSuccess(await create(), 201);
    const other = await makeBeneficiary(admin.user);

    const data = expectSuccess(
      await request(app).patch(`${base}/${created._id}`).set('Authorization', `Bearer ${admin.token}`)
        .send({
          organisation: { name: 'Somewhere else', type: 'NGO', contactPerson: 'M. Dlamini' },
          beneficiary: String(other._id),
          status: 'COMPLETED',
          urgency: 'URGENT',
        })
    );

    expect(data.organisation.contactPerson).toBe('M. Dlamini');
    // A referral to a different organisation is a new referral — editing it in place would
    // quietly repair the first organisation's decline rate.
    expect(data.organisation.name).toBe(organisation.name);
    expect(data.organisation.type).toBe('LEGAL_AID');
    expect(String(data.beneficiary)).toBe(String(beneficiary._id));
    expect(data.status).toBe('PENDING');
    // Urgency is patchable, and the chase date follows it.
    expect(new Date(data.followUpAt) - Date.now()).toBeLessThanOrEqual(25 * 3600 * 1000);
  });

  it('lists what nobody has chased, and drops it once closed', async () => {
    const created = expectSuccess(await create(), 201);
    const { default: Referral } = await import('../src/modules/referrals/referral.model.js');
    await Referral.updateOne(
      { _id: created._id },
      { $set: { followUpAt: new Date(Date.now() - 86_400_000) } }
    );

    const overdue = await request(app).get(`${base}?overdue=true`).set('Authorization', `Bearer ${admin.token}`);
    expect(expectSuccess(overdue)).toHaveLength(1);

    await setStatus(created._id, { status: 'CANCELLED', notes: 'Beneficiary relocated' });
    const after = await request(app).get(`${base}?overdue=true`).set('Authorization', `Bearer ${admin.token}`);
    expect(expectSuccess(after)).toHaveLength(0);
  });

  it('writes an audit entry that carries no free text', async () => {
    const created = expectSuccess(await create(admin.token, { reason: 'Detained at the DHA queue' }), 201);

    const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
    const entry = await AuditLog.findOne({ action: 'referral.created', targetId: created._id }).lean();

    expect(entry).not.toBeNull();
    expect(entry.meta.organisationType).toBe('LEGAL_AID');
    expect(entry.meta.consentMethod).toBe('SIGNED_FORM');
    expect(JSON.stringify(entry.meta)).not.toMatch(/Detained/);
  });
});
