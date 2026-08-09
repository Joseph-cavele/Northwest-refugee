import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import Case from '../src/modules/cases/case.model.js';

const hasDb = await connect();
const base = '/api/v1/cases';

describe.runIf(hasDb)('case routes', () => {
  let admin; let coord; let peer; let ed; let beneficiary;

  beforeEach(async () => {
    await resetDatabase();
    // The partial unique index is the guarantee behind "one active case per person", so
    // it has to exist on a freshly emptied collection.
    await Case.syncIndexes();

    admin = await makeUser(ROLES.ADMIN_OFFICER);
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    peer = await makeUser(ROLES.PEER_LEADER);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    beneficiary = await makeBeneficiary(admin.user);
  });
  afterAll(disconnect);

  const open = (token = admin.token, body = {}) =>
    request(app).post(base).set('Authorization', `Bearer ${token}`).send({
      beneficiary: String(beneficiary._id), category: 'LEGAL_DOCUMENTATION', ...body,
    });

  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(base), 401);
    const volunteer = await makeUser(ROLES.VOLUNTEER);
    expectError(await request(app).get(base).set('Authorization', `Bearer ${volunteer.token}`), 403);
  });

  it('lets the ED read but not open a case', async () => {
    expectSuccess(await request(app).get(base).set('Authorization', `Bearer ${ed.token}`));
    expectError(await open(ed.token), 403);
  });

  it('opens a case with a number, an open date and a caseworker', async () => {
    const data = expectSuccess(await open(admin.token, { priority: 'URGENT' }), 201);
    expect(data.caseNumber).toMatch(/^CASE-\d{4}-/);
    expect(data.openedAt).toBeTruthy();
    expect(data.status).toBe('OPEN');
    // Defaults to the person opening it — an unowned case is one nobody is answerable for.
    expect(data.caseworker).toBe(admin.id);
    expect(data.isEscalated).toBe(true);
  });

  it('allows only one active case per beneficiary', async () => {
    expectSuccess(await open(), 201);
    const res = await open();
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/already has an open case/i);
  });

  it('counts ON_HOLD as active', async () => {
    const first = expectSuccess(await open(), 201);
    await request(app).post(`${base}/${first._id}/status`).set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'ON_HOLD' });
    expectError(await open(), 409);
  });

  it('shows urgent cases oldest first and excludes normal ones', async () => {
    expectSuccess(await open(admin.token, { priority: 'URGENT' }), 201);
    const second = await makeBeneficiary(admin.user);
    await request(app).post(base).set('Authorization', `Bearer ${admin.token}`)
      .send({ beneficiary: String(second._id), category: 'SHELTER', priority: 'NORMAL' });

    const res = await request(app).get(`${base}/urgent`).set('Authorization', `Bearer ${admin.token}`);
    const data = expectSuccess(res);
    expect(data).toHaveLength(1);
    expect(data[0].priority).toBe('URGENT');
  });

  it('lets the assigned caseworker see their own case despite programme scoping', async () => {
    // The coordinator has no programmes and the case has none — being the caseworker has
    // to be enough, or the person answerable cannot open the file.
    const opened = expectSuccess(await open(admin.token, { caseworker: coord.id }), 201);

    const mine = await request(app).get(`${base}?mine=true`).set('Authorization', `Bearer ${coord.token}`);
    expect(expectSuccess(mine)).toHaveLength(1);
    expectSuccess(await request(app).get(`${base}/${opened._id}`).set('Authorization', `Bearer ${coord.token}`));
  });

  it('still hides cases that are not theirs', async () => {
    const opened = expectSuccess(await open(), 201);
    expectError(await request(app).get(`${base}/${opened._id}`).set('Authorization', `Bearer ${peer.token}`), 404);
  });

  it('requires an outcome to close, and a note for the ones that need explaining', async () => {
    const opened = expectSuccess(await open(), 201);
    const url = `${base}/${opened._id}/close`;

    expectError(await request(app).post(url).set('Authorization', `Bearer ${admin.token}`).send({}), 422);
    expectError(
      await request(app).post(url).set('Authorization', `Bearer ${admin.token}`).send({ outcome: 'UNREACHABLE' }),
      422
    );
  });

  it('closes a case and records who, when and how long', async () => {
    const opened = expectSuccess(await open(), 201);
    const res = await request(app).post(`${base}/${opened._id}/close`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ outcome: 'RESOLVED', notes: 'Permit renewed' });

    const data = expectSuccess(res);
    expect(data.status).toBe('CLOSED');
    expect(data.closure.closedBy).toBe(admin.id);
    expect(typeof data.ageDays).toBe('number');
  });

  it('refuses to close a peer leader without case:close', async () => {
    const opened = expectSuccess(await open(), 201);
    expectError(
      await request(app).post(`${base}/${opened._id}/close`).set('Authorization', `Bearer ${peer.token}`)
        .send({ outcome: 'RESOLVED' }),
      403
    );
  });

  it('treats a closed case as final and frees the beneficiary for a new one', async () => {
    const opened = expectSuccess(await open(), 201);
    await request(app).post(`${base}/${opened._id}/close`).set('Authorization', `Bearer ${admin.token}`)
      .send({ outcome: 'RESOLVED', notes: 'done' });

    const reopen = await request(app).post(`${base}/${opened._id}/status`).set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'OPEN' });
    expectError(reopen, 409);
    expect(reopen.body.error.message).toMatch(/open a new case/i);

    // A returning beneficiary gets a fresh file rather than a resurrected one.
    expectSuccess(await open(), 201);
  });
});
