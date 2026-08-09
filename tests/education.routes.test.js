import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import { SchoolPlacement, MIN_COOPERATIVE_MEMBERS } from '../src/modules/education/education.model.js';
import { Programme } from '../src/modules/programmes/programme.model.js';

const hasDb = await connect();
const base = '/api/v1/education';

describe.runIf(hasDb)('education routes', () => {
  let coord; let ed; let admin; let child; let programme;

  beforeEach(async () => {
    await resetDatabase();
    // The partial unique index backs "one live placement per child per year".
    await SchoolPlacement.syncIndexes();

    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    admin = await makeUser(ROLES.ADMIN_OFFICER);

    // Coordinators are scoped to their assigned programmes, and a beneficiary is visible
    // to them only through one. Capturing a record is NOT enough on its own — see the
    // note in the module summary.
    programme = await Programme.create({ name: 'Education Support', pillar: 'EDUCATION', status: 'ACTIVE' });
    coord.user.programmes = [programme._id];
    await coord.user.save();

    child = await makeBeneficiary(coord.user, {
      dateOfBirth: new Date('2014-05-02'),
      guardian: { fullName: 'Grace Mwangi', relationship: 'Mother' },
      programmes: [programme._id],
    });
  });
  afterAll(disconnect);

  const asCoord = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${coord.token}`);

  const placement = (over = {}) => ({
    beneficiary: String(child._id),
    school: { name: 'Rustenburg Primary', phase: 'PRIMARY' },
    grade: '4',
    academicYear: 2026,
    ...over,
  });

  // --- access ---------------------------------------------------------------
  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(`${base}/placements`), 401);
    // Programmes and education belong to the coordinator; the Admin Officer has neither.
    expectError(await request(app).get(`${base}/placements`).set('Authorization', `Bearer ${admin.token}`), 403);
  });

  it('lets the ED read but not create', async () => {
    expectSuccess(await request(app).get(`${base}/placements`).set('Authorization', `Bearer ${ed.token}`));
    expectError(
      await request(app).post(`${base}/placements`).set('Authorization', `Bearer ${ed.token}`).send(placement()),
      403
    );
  });

  // --- school placements ----------------------------------------------------
  it('records a placement', async () => {
    const data = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    expect(data.status).toBe('APPLIED');
    expect(data.grade).toBe('4');
    expect(data.isActive).toBe(true);
  });

  it('rejects an unknown grade', async () => {
    expectError(await asCoord('post', `${base}/placements`).send(placement({ grade: '13' })), 422);
  });

  it('allows only one live placement per child per academic year', async () => {
    expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    const res = await asCoord('post', `${base}/placements`).send(
      placement({ school: { name: 'Another Primary' } })
    );
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/2026/);
  });

  it('frees the year once a placement is refused, so another school can be tried', async () => {
    const first = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    await asCoord('patch', `${base}/placements/${first._id}`).send({
      status: 'REFUSED',
      refusal: { reason: 'No birth certificate', dueToLackOfDocuments: true },
    });

    expectSuccess(
      await asCoord('post', `${base}/placements`).send(placement({ school: { name: 'Second Chance Primary' } })),
      201
    );
  });

  it('requires a reason when admission is refused', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    expectError(
      await asCoord('patch', `${base}/placements/${created._id}`).send({ status: 'REFUSED' }),
      422
    );
  });

  it('flags a refusal for want of documents as unlawful and queues it for advocacy', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    const refused = expectSuccess(
      await asCoord('patch', `${base}/placements/${created._id}`).send({
        status: 'REFUSED',
        refusal: { reason: 'Child has no birth certificate', dueToLackOfDocuments: true },
      })
    );
    // Refusing admission on these grounds is unlawful in South Africa; counting them is
    // the reason refusals are recorded apart from withdrawals.
    expect(refused.isUnlawfulRefusal).toBe(true);

    const queue = expectSuccess(await asCoord('get', `${base}/placements?unlawfulRefusalsOnly=true`));
    expect(queue).toHaveLength(1);
    expect(queue[0]._id).toBe(created._id);
  });

  it('does not put an ordinary refusal in the advocacy queue', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    await asCoord('patch', `${base}/placements/${created._id}`).send({
      status: 'REFUSED',
      refusal: { reason: 'School is full', dueToLackOfDocuments: false },
    });
    expect(expectSuccess(await asCoord('get', `${base}/placements?unlawfulRefusalsOnly=true`))).toHaveLength(0);
  });

  it('stamps placedAt and exitedAt rather than trusting the client', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    const placed = expectSuccess(await asCoord('patch', `${base}/placements/${created._id}`).send({ status: 'PLACED' }));
    expect(placed.placedAt).toBeTruthy();

    const done = expectSuccess(await asCoord('patch', `${base}/placements/${created._id}`).send({ status: 'COMPLETED' }));
    expect(done.exitedAt).toBeTruthy();
  });

  it('will not move a placement to another child', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    const other = await makeBeneficiary(coord.user, { programmes: [programme._id] });
    await asCoord('patch', `${base}/placements/${created._id}`).send({
      beneficiary: String(other._id), notes: 'x',
    });
    const reread = await SchoolPlacement.findById(created._id);
    expect(String(reread.beneficiary)).toBe(String(child._id));
  });

  it('rejects an empty PATCH', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/placements`).send(placement()), 201);
    expectError(await asCoord('patch', `${base}/placements/${created._id}`).send({}), 422);
  });

  // --- cooperatives ---------------------------------------------------------
  const coop = (over = {}) => ({ name: 'Rustenburg Sewing Co-op', sector: 'SEWING', ...over });

  it('creates a cooperative and counts its active members', async () => {
    const data = expectSuccess(await asCoord('post', `${base}/cooperatives`).send(coop()), 201);
    expect(data.status).toBe('FORMING');
    expect(data.activeMemberCount).toBe(0);
    expect(data.meetsRegistrationMinimum).toBe(false);
  });

  it('refuses a duplicate cooperative name', async () => {
    expectSuccess(await asCoord('post', `${base}/cooperatives`).send(coop()), 201);
    expectError(await asCoord('post', `${base}/cooperatives`).send(coop()), 409);
  });

  it('refuses the same person listed twice at creation', async () => {
    const res = await asCoord('post', `${base}/cooperatives`).send(
      coop({ members: [{ beneficiary: String(child._id) }, { beneficiary: String(child._id) }] })
    );
    expectError(res, 400);
  });

  it('refuses registration below the statutory five members', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/cooperatives`).send(coop()), 201);
    for (let i = 0; i < MIN_COOPERATIVE_MEMBERS - 1; i += 1) {
      const member = await makeBeneficiary(coord.user, { programmes: [programme._id] });
      await asCoord('post', `${base}/cooperatives/${created._id}/members`).send({ beneficiary: String(member._id) });
    }

    // The Co-operatives Act 14 of 2005 requires five natural persons — recording it as
    // registered below that asserts something CIPC never granted.
    const res = await asCoord('patch', `${base}/cooperatives/${created._id}`).send({ status: 'REGISTERED' });
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/at least 5 active members/);
  });

  it('registers once the fifth member joins, and stamps registeredAt', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/cooperatives`).send(coop()), 201);
    for (let i = 0; i < MIN_COOPERATIVE_MEMBERS; i += 1) {
      const member = await makeBeneficiary(coord.user, { programmes: [programme._id] });
      await asCoord('post', `${base}/cooperatives/${created._id}/members`).send({ beneficiary: String(member._id) });
    }

    const registered = expectSuccess(
      await asCoord('patch', `${base}/cooperatives/${created._id}`).send({ status: 'REGISTERED' })
    );
    expect(registered.status).toBe('REGISTERED');
    expect(registered.registeredAt).toBeTruthy();
    expect(registered.meetsRegistrationMinimum).toBe(true);
  });

  it('refuses to add the same member twice', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/cooperatives`).send(coop()), 201);
    const url = `${base}/cooperatives/${created._id}/members`;
    expectSuccess(await asCoord('post', url).send({ beneficiary: String(child._id), role: 'CHAIRPERSON' }));
    expectError(await asCoord('post', url).send({ beneficiary: String(child._id) }), 409);
  });

  it('keeps a departed member with an exit date rather than deleting the row', async () => {
    const created = expectSuccess(await asCoord('post', `${base}/cooperatives`).send(coop()), 201);
    await asCoord('post', `${base}/cooperatives/${created._id}/members`).send({ beneficiary: String(child._id) });

    const after = expectSuccess(
      await asCoord('delete', `${base}/cooperatives/${created._id}/members/${child._id}`)
    );
    expect(after.activeMemberCount).toBe(0);
    // Who was in a co-op and when is what a funder asks about — the row stays.
    expect(after.members).toHaveLength(1);
    expect(after.members[0].exitedAt).toBeTruthy();

    expectError(await asCoord('delete', `${base}/cooperatives/${created._id}/members/${child._id}`), 404);
  });

  it('scopes cooperatives and placements to what the caller may see', async () => {
    const peer = await makeUser(ROLES.PEER_LEADER);
    // Peer leaders hold no education permission at all.
    expectError(await request(app).get(`${base}/placements`).set('Authorization', `Bearer ${peer.token}`), 403);
  });
});
