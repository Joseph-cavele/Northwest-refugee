import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import { Programme, Cohort, ProgrammeSession } from '../src/modules/programmes/programme.model.js';
import { Enrollment, Attendance } from '../src/modules/enrollments/enrollment.model.js';

const hasDb = await connect();
const base = '/api/v1/enrollments';

describe.runIf(hasDb)('enrollment routes', () => {
  let coord; let volunteer; let admin; let programme; let cohort; let session; let person;

  beforeEach(async () => {
    await resetDatabase();
    await Enrollment.syncIndexes();
    await Attendance.syncIndexes();

    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    volunteer = await makeUser(ROLES.VOLUNTEER);
    admin = await makeUser(ROLES.ADMIN_OFFICER);

    programme = await Programme.create({ name: 'Sewing Skills', pillar: 'SKILLS_ENTREPRENEURSHIP', status: 'ACTIVE' });
    coord.user.programmes = [programme._id];
    await coord.user.save();
    volunteer.user.programmes = [programme._id];
    await volunteer.user.save();

    cohort = await Cohort.create({
      programme: programme._id, name: '2026 Intake',
      startDate: new Date('2026-02-01'), endDate: new Date('2026-05-31'),
      capacity: 2, status: 'OPEN',
    });
    session = await ProgrammeSession.create({
      cohort: cohort._id, title: 'Week 1', scheduledAt: new Date('2026-02-03T09:00:00Z'),
    });

    person = await makeBeneficiary(coord.user, { programmes: [programme._id] });
  });
  afterAll(disconnect);

  const asCoord = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${coord.token}`);
  const enrol = (beneficiary = person, token = coord.token) =>
    request(app).post(base).set('Authorization', `Bearer ${token}`)
      .send({ beneficiary: String(beneficiary._id), cohort: String(cohort._id) });

  const newPerson = () => makeBeneficiary(coord.user, { programmes: [programme._id] });

  // --- access ---------------------------------------------------------------
  it('requires authentication', async () => {
    expectError(await request(app).get(base), 401);
  });

  it('lets a volunteer read and mark registers but not enrol', async () => {
    expectSuccess(await request(app).get(base).set('Authorization', `Bearer ${volunteer.token}`));
    expectError(await enrol(person, volunteer.token), 403);
  });

  // --- enrolment ------------------------------------------------------------
  it('enrols a beneficiary and copies the programme from the cohort', async () => {
    const data = expectSuccess(await enrol(), 201);
    expect(data.status).toBe('ENROLLED');
    expect(data.programme).toBe(String(programme._id));
    expect(data.isActive).toBe(true);
  });

  it('refuses a second live enrolment on the same cohort', async () => {
    expectSuccess(await enrol(), 201);
    expectError(await enrol(), 409);
  });

  it('refuses enrolment once consent is withdrawn', async () => {
    const { withdrawConsent } = await import('../src/modules/beneficiaries/beneficiary.service.js');
    await withdrawConsent(person._id, { reason: 'Requested' }, admin.user, {});
    const res = await enrol();
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/consent/i);
  });

  it('refuses enrolment into a cohort that is not accepting', async () => {
    await Cohort.updateOne({ _id: cohort._id }, { $set: { status: 'RUNNING' } });
    expectError(await enrol(), 409);
  });

  // --- capacity -------------------------------------------------------------
  it('enforces the cohort capacity and tracks the seat count', async () => {
    expectSuccess(await enrol(await newPerson()), 201);
    expectSuccess(await enrol(await newPerson()), 201);

    const full = await enrol(await newPerson());
    expectError(full, 409);
    expect(full.body.error.message).toMatch(/full \(2 places\)/);

    expect((await Cohort.findById(cohort._id)).enrolledCount).toBe(2);
  });

  it('claims seats atomically under concurrent enrolment', async () => {
    // Three officers enrolling the last two places at once. A read-then-write check would
    // let all three through; the guarded $inc cannot.
    const people = await Promise.all([newPerson(), newPerson(), newPerson()]);
    const results = await Promise.all(people.map((p) => enrol(p)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect((await Cohort.findById(cohort._id)).enrolledCount).toBe(2);
  });

  it('frees a seat on withdrawal but not on completion', async () => {
    const first = expectSuccess(await enrol(), 201);
    expect((await Cohort.findById(cohort._id)).enrolledCount).toBe(1);

    expectSuccess(await asCoord('patch', `${base}/${first._id}`)
      .send({ status: 'WITHDRAWN', exitReason: 'Moved to Johannesburg' }));
    expect((await Cohort.findById(cohort._id)).enrolledCount).toBe(0);

    const second = expectSuccess(await enrol(await newPerson()), 201);
    expectSuccess(await asCoord('patch', `${base}/${second._id}`).send({ status: 'COMPLETED' }));
    // A completed participant used that place for the whole run.
    expect((await Cohort.findById(cohort._id)).enrolledCount).toBe(1);
  });

  it('requires a reason when someone leaves', async () => {
    const created = expectSuccess(await enrol(), 201);
    expectError(await asCoord('patch', `${base}/${created._id}`).send({ status: 'DROPPED_OUT' }), 422);
  });

  it('refuses a status change once the enrolment has ended', async () => {
    const created = expectSuccess(await enrol(), 201);
    await asCoord('patch', `${base}/${created._id}`).send({ status: 'COMPLETED' });
    expectError(await asCoord('patch', `${base}/${created._id}`).send({ status: 'ATTENDING' }), 409);
  });

  it('rejects an empty PATCH', async () => {
    const created = expectSuccess(await enrol(), 201);
    expectError(await asCoord('patch', `${base}/${created._id}`).send({}), 422);
  });

  // --- attendance -----------------------------------------------------------
  const markUrl = () => `${base}/sessions/${session._id}/attendance`;

  it('marks a register and moves the session to HELD', async () => {
    await enrol();
    const data = expectSuccess(
      await request(app).post(markUrl()).set('Authorization', `Bearer ${volunteer.token}`)
        .send({ marks: [{ beneficiary: String(person._id), status: 'PRESENT' }] })
    );
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe('PRESENT');
    expect((await ProgrammeSession.findById(session._id)).status).toBe('HELD');
  });

  it('refuses to mark someone who is not enrolled', async () => {
    const stranger = await newPerson();
    const res = await asCoord('post', markUrl())
      .send({ marks: [{ beneficiary: String(stranger._id), status: 'PRESENT' }] });
    expectError(res, 400);
    expect(res.body.error.message).toMatch(/not enrolled/);
  });

  it('rejects the same person twice in one register', async () => {
    await enrol();
    expectError(
      await asCoord('post', markUrl()).send({
        marks: [
          { beneficiary: String(person._id), status: 'PRESENT' },
          { beneficiary: String(person._id), status: 'ABSENT' },
        ],
      }),
      422
    );
  });

  it('corrects a mark instead of adding a second row', async () => {
    await enrol();
    await asCoord('post', markUrl()).send({ marks: [{ beneficiary: String(person._id), status: 'ABSENT' }] });
    const corrected = expectSuccess(
      await asCoord('post', markUrl()).send({ marks: [{ beneficiary: String(person._id), status: 'PRESENT' }] })
    );

    expect(corrected).toHaveLength(1);
    expect(corrected[0].status).toBe('PRESENT');
    // A second row would inflate the denominator of every attendance rate.
    expect(await Attendance.countDocuments({ session: session._id })).toBe(1);
  });

  it('has no register for a cancelled session', async () => {
    await enrol();
    await ProgrammeSession.updateOne({ _id: session._id }, { $set: { status: 'CANCELLED' } });
    expectError(
      await asCoord('post', markUrl()).send({ marks: [{ beneficiary: String(person._id), status: 'PRESENT' }] }),
      409
    );
  });

  // --- attendance summary ---------------------------------------------------
  it('counts LATE as attended and reports the rate', async () => {
    const enrollment = expectSuccess(await enrol(), 201);
    const second = await ProgrammeSession.create({
      cohort: cohort._id, title: 'Week 2', scheduledAt: new Date('2026-02-10T09:00:00Z'),
    });

    await asCoord('post', markUrl()).send({ marks: [{ beneficiary: String(person._id), status: 'LATE' }] });
    await asCoord('post', `${base}/sessions/${second._id}/attendance`)
      .send({ marks: [{ beneficiary: String(person._id), status: 'ABSENT' }] });

    const summary = expectSuccess(await asCoord('get', `${base}/${enrollment._id}/attendance`));
    expect(summary.sessionsMarked).toBe(2);
    expect(summary.attended).toBe(1);
    expect(summary.attendanceRate).toBe(50);
    expect(summary.byStatus).toEqual({ LATE: 1, ABSENT: 1 });
  });

  it('reports no rate at all when nothing has been marked', async () => {
    const enrollment = expectSuccess(await enrol(), 201);
    const summary = expectSuccess(await asCoord('get', `${base}/${enrollment._id}/attendance`));
    // "No data" and "never attended" are different facts.
    expect(summary.attendanceRate).toBeNull();
    expect(summary.sessionsMarked).toBe(0);
  });
});
