import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, expectSuccess, expectError,
} from './helpers.js';
import User from '../src/modules/users/user.model.js';
import { Session } from '../src/modules/auth/otp.model.js';
import { DASHBOARD_BY_ROLE } from '../src/config/constants.js';

const hasDb = await connect();
const base = '/api/v1/auth';
const PASSWORD = 'correct-horse-9';
const NEW_PASSWORD = 'battery-staple-7';

describe.runIf(hasDb)('change password, profile and dashboard routing', () => {
  let email;
  let seq = 0;

  beforeAll(async () => {
    await resetDatabase();
  });
  afterAll(disconnect);

  async function makeSignedInUser(role = ROLES.ADMIN_OFFICER) {
    seq += 1;
    email = `staff.${seq}@nwhr.org.za`;
    const user = new User({ name: 'Thandi Mokoena', email, role, status: 'active' });
    await user.setPassword(PASSWORD);
    await user.save();

    const login = await request(app).post(`${base}/login`).send({ email, password: PASSWORD });
    const cookie = login.headers['set-cookie']
      .find((c) => c.startsWith('refresh_token='))
      .split(';')[0];
    return { user, token: login.body.data.accessToken, cookie, login };
  }

  beforeEach(async () => {
    await resetDatabase();
  });

  // --- dashboard routing ----------------------------------------------------------

  it('tells the client which dashboard to open, per role', async () => {
    const { login } = await makeSignedInUser(ROLES.FINANCE_OFFICER);
    expect(expectSuccess(login).dashboard).toBe(DASHBOARD_BY_ROLE[ROLES.FINANCE_OFFICER]);
  });

  it('returns the same dashboard from /me', async () => {
    const { token } = await makeSignedInUser(ROLES.ME_OFFICER);
    const res = await request(app).get(`${base}/me`).set('Authorization', `Bearer ${token}`);
    expect(expectSuccess(res).dashboard).toBe(DASHBOARD_BY_ROLE[ROLES.ME_OFFICER]);
  });

  // --- change password ------------------------------------------------------------

  it('refuses a wrong current password', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .post(`${base}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-my-password-1', newPassword: NEW_PASSWORD });

    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('refuses a new password identical to the current one', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .post(`${base}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });

    const err = expectError(res, 422, 'VALIDATION_FAILED');
    expect(err.details.newPassword).toMatch(/different/i);
  });

  it('enforces the password policy on the new password', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .post(`${base}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });

    expectError(res, 422, 'VALIDATION_FAILED');
  });

  it('changes the password and lets the new one sign in', async () => {
    const { token } = await makeSignedInUser();

    const res = await request(app)
      .post(`${base}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    const data = expectSuccess(res);
    expect(typeof data.accessToken).toBe('string');

    expectSuccess(await request(app).post(`${base}/login`).send({ email, password: NEW_PASSWORD }));
    expectError(await request(app).post(`${base}/login`).send({ email, password: PASSWORD }), 401);
  });

  it('invalidates the old access token but returns a working one', async () => {
    const { token } = await makeSignedInUser();

    const res = await request(app)
      .post(`${base}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    const { accessToken } = expectSuccess(res);

    // The token that made the request is dead — tokenVersion moved underneath it...
    expectError(await request(app).get(`${base}/me`).set('Authorization', `Bearer ${token}`), 401);
    // ...but the caller is not signed out of the tab they did it in.
    expectSuccess(await request(app).get(`${base}/me`).set('Authorization', `Bearer ${accessToken}`));
  });

  it('signs other devices out but keeps the caller signed in', async () => {
    const { user, token, cookie } = await makeSignedInUser();
    // A second device.
    await request(app).post(`${base}/login`).send({ email, password: PASSWORD });

    const res = await request(app)
      .post(`${base}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expectSuccess(res);

    // The other device's refresh token is revoked...
    expectError(await request(app).post(`${base}/refresh`).set('Cookie', cookie), 401);
    // ...and exactly one live session remains: the one issued to the caller.
    const live = await Session.countDocuments({ user: user._id, revokedAt: null });
    expect(live).toBe(1);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post(`${base}/change-password`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expectError(res, 401);
  });

  // --- update profile -------------------------------------------------------------

  it('updates the display name', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .patch(`${base}/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Thandi M. Mokoena' });

    expect(expectSuccess(res).user.name).toBe('Thandi M. Mokoena');
  });

  it('normalises a phone number to E.164', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .patch(`${base}/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '082 123 4567' });

    expect(expectSuccess(res).user.phone).toBe('+27821234567');
  });

  it('rejects a phone number that is not one', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .patch(`${base}/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '12' });
    expectError(res, 422, 'VALIDATION_FAILED');
  });

  it('ignores an attempt to change role, email or status', async () => {
    const { user, token } = await makeSignedInUser(ROLES.VOLUNTEER);

    const res = await request(app)
      .patch(`${base}/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Still A Volunteer',
        role: ROLES.EXECUTIVE_DIRECTOR,
        email: 'promoted@nwhr.org.za',
        status: 'active',
        tokenVersion: 99,
      });

    expectSuccess(res);
    const after = await User.findById(user._id);
    expect(after.role).toBe(ROLES.VOLUNTEER);
    expect(after.email).toBe(user.email);
    expect(after.name).toBe('Still A Volunteer');
  });

  it('refuses an empty update', async () => {
    const { token } = await makeSignedInUser();
    const res = await request(app)
      .patch(`${base}/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expectError(res, 422, 'VALIDATION_FAILED');
  });
});
