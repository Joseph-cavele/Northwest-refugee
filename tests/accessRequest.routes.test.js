import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import User from '../src/modules/users/user.model.js';
import Department from '../src/modules/departments/department.model.js';
import AccessRequest from '../src/modules/auth/accessRequest.model.js';
import Notification from '../src/modules/notifications/notification.model.js';
import { Token } from '../src/modules/auth/otp.model.js';

const hasDb = await connect();
const base = '/api/v1/auth/access-requests';

describe.runIf(hasDb)('staff access requests', () => {
  let department;
  let admin;
  let seq = 0;

  beforeAll(async () => {
    await resetDatabase();
  });
  afterAll(disconnect);

  beforeEach(async () => {
    await resetDatabase();
    department = await Department.create({ name: 'Programmes', slug: 'programmes' });
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    // passwordResetLimiter buckets by IP+email and its counter outlives a single test, so
    // every submission below needs its own address.
    seq += 1;
  });

  const submission = (overrides = {}) => ({
    firstName: 'Thandi',
    lastName: 'Mokoena',
    email: `applicant.${seq}@example.org`,
    phone: '0821234567',
    requestedRole: ROLES.PROJECT_COORDINATOR,
    departmentId: String(department._id),
    motivation: 'I coordinate the literacy programme at a partner NGO.',
    ...overrides,
  });

  // --- submit (public) ------------------------------------------------------------

  it('accepts a request from someone with no account', async () => {
    const res = await request(app).post(base).send(submission());
    const data = expectSuccess(res);
    expect(data.message).toMatch(/received/i);

    const stored = await AccessRequest.findOne({ email: `applicant.${seq}@example.org` });
    expect(stored.status).toBe('PENDING');
    // What they asked for is recorded; what they were granted is not, until someone decides.
    expect(stored.requestedRole).toBe(ROLES.PROJECT_COORDINATOR);
    expect(stored.grantedRole).toBeNull();
  });

  it('normalises the phone number to E.164', async () => {
    await request(app).post(base).send(submission({ phone: '082 123 4567' }));
    const stored = await AccessRequest.findOne({ email: `applicant.${seq}@example.org` });
    expect(stored.phone).toBe('+27821234567');
  });

  it('answers identically whether or not the email is already a staff account', async () => {
    const staffEmail = `already.${seq}@nwhr.org.za`;
    await User.create({ name: 'Existing', email: staffEmail, role: ROLES.VOLUNTEER, status: 'active' });

    const known = await request(app).post(base).send(submission({ email: staffEmail }));
    const unknown = await request(app).post(base).send(submission());

    expect(known.status).toBe(unknown.status);
    expect(known.body.data).toEqual(unknown.body.data);
    // ...and nothing was written for the address that already belongs to someone.
    expect(await AccessRequest.countDocuments({ email: staffEmail })).toBe(0);
  });

  it('does not let one applicant flood the queue', async () => {
    await request(app).post(base).send(submission());
    const second = await request(app).post(base).send(submission());

    expectSuccess(second);
    expect(await AccessRequest.countDocuments({ email: `applicant.${seq}@example.org` })).toBe(1);
  });

  it('notifies everyone who can review the request', async () => {
    const reviewer = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    const bystander = await makeUser(ROLES.VOLUNTEER);

    await request(app).post(base).send(submission());

    const forReviewers = await Notification.find({ type: 'ACCESS_REQUEST' });
    const recipients = forReviewers.map((n) => String(n.userId));
    expect(recipients).toContain(String(admin.user._id));
    expect(recipients).toContain(String(reviewer.user._id));
    expect(recipients).not.toContain(String(bystander.user._id));
    expect(forReviewers[0].title).toBe('New Staff Access Request');
  });

  it('rejects an unknown department', async () => {
    const res = await request(app)
      .post(base)
      .send(submission({ departmentId: '507f1f77bcf86cd799439011' }));
    expectError(res, 404, 'NOT_FOUND');
  });

  it('serves the public form its department and role options', async () => {
    const res = await request(app).get(`${base}/options`);
    const data = expectSuccess(res);
    expect(data.departments.map((d) => d.name)).toContain('Programmes');
    // Nobody applies for the ED role through a public form.
    expect(data.roles.map((r) => r.value)).not.toContain(ROLES.EXECUTIVE_DIRECTOR);
  });

  // --- review ---------------------------------------------------------------------

  async function submitOne(overrides) {
    await request(app).post(base).send(submission(overrides));
    return AccessRequest.findOne({ status: 'PENDING' });
  }

  it('refuses the queue to someone without the permission', async () => {
    const volunteer = await makeUser(ROLES.VOLUNTEER);
    const res = await request(app).get(base).set('Authorization', `Bearer ${volunteer.token}`);
    expectError(res, 403, 'FORBIDDEN');
  });

  it('lists pending requests for a reviewer', async () => {
    await submitOne();
    const res = await request(app).get(`${base}?status=PENDING`).set('Authorization', `Bearer ${admin.token}`);
    const data = expectSuccess(res);
    expect(data).toHaveLength(1);
    expect(data[0].fullName).toBe('Thandi Mokoena');
  });

  it('approves a request into an invited account with an activation token', async () => {
    const pending = await submitOne();

    const res = await request(app)
      .post(`${base}/${pending._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    const data = expectSuccess(res, 201);
    expect(data.user.status).toBe('invited');
    expect(data.user.name).toBe('Thandi Mokoena');
    expect(data.user.role).toBe(ROLES.PROJECT_COORDINATOR);

    // The account cannot be signed in to until the token is redeemed.
    const created = await User.findById(data.user._id).select('+passwordHash');
    expect(created.passwordHash).toBeUndefined();
    expect(await Token.countDocuments({ user: created._id, type: 'invite' })).toBe(1);

    const closed = await AccessRequest.findById(pending._id);
    expect(closed.status).toBe('APPROVED');
    expect(String(closed.createdUser)).toBe(String(created._id));
    expect(String(closed.reviewedBy)).toBe(String(admin.user._id));
  });

  it('lets the approver grant a different role from the one requested', async () => {
    const pending = await submitOne();

    const res = await request(app)
      .post(`${base}/${pending._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: ROLES.VOLUNTEER });

    expect(expectSuccess(res, 201).user.role).toBe(ROLES.VOLUNTEER);
    const closed = await AccessRequest.findById(pending._id);
    expect(closed.requestedRole).toBe(ROLES.PROJECT_COORDINATOR);
    expect(closed.grantedRole).toBe(ROLES.VOLUNTEER);
  });

  it('stops an Admin Officer from minting an Executive Director', async () => {
    const pending = await submitOne();

    const res = await request(app)
      .post(`${base}/${pending._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: ROLES.EXECUTIVE_DIRECTOR });

    expectError(res, 403, 'FORBIDDEN');
    expect(await User.countDocuments({ role: ROLES.EXECUTIVE_DIRECTOR })).toBe(0);
    expect((await AccessRequest.findById(pending._id)).status).toBe('PENDING');
  });

  it('lets an Executive Director grant the Executive Director role', async () => {
    const ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    const pending = await submitOne();

    const res = await request(app)
      .post(`${base}/${pending._id}/approve`)
      .set('Authorization', `Bearer ${ed.token}`)
      .send({ role: ROLES.EXECUTIVE_DIRECTOR });

    expect(expectSuccess(res, 201).user.role).toBe(ROLES.EXECUTIVE_DIRECTOR);
  });

  it('refuses to decide the same request twice', async () => {
    const pending = await submitOne();
    await request(app)
      .post(`${base}/${pending._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    const again = await request(app)
      .post(`${base}/${pending._id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    expectError(again, 409, 'CONFLICT');
    expect(await User.countDocuments({ email: `applicant.${seq}@example.org` })).toBe(1);
  });

  it('rejects a request with a reason and creates no account', async () => {
    const pending = await submitOne();

    const res = await request(app)
      .post(`${base}/${pending._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'We are not recruiting coordinators at present.' });

    expectSuccess(res);
    const closed = await AccessRequest.findById(pending._id);
    expect(closed.status).toBe('REJECTED');
    expect(closed.decisionNote).toMatch(/not recruiting/);
    expect(await User.countDocuments({ email: `applicant.${seq}@example.org` })).toBe(0);
  });

  it('requires a reason to reject', async () => {
    const pending = await submitOne();
    const res = await request(app)
      .post(`${base}/${pending._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expectError(res, 422, 'VALIDATION_FAILED');
  });

  it('lets a rejected applicant reapply', async () => {
    const pending = await submitOne();
    await request(app)
      .post(`${base}/${pending._id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Not at this time.' });

    await request(app).post(base).send(submission());
    expect(await AccessRequest.countDocuments({ email: `applicant.${seq}@example.org` })).toBe(2);
  });
});
