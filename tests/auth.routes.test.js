import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import User from '../src/modules/users/user.model.js';
import { Token } from '../src/modules/auth/otp.model.js';

const hasDb = await connect();
const base = '/api/v1/auth';
const PASSWORD = 'correct-horse-9';

describe.runIf(hasDb)('auth routes', () => {
  let email;
  let seq = 0;

  beforeAll(async () => {
    await resetDatabase();
  });
  afterAll(disconnect);

  beforeEach(async () => {
    await resetDatabase();
    // authLimiter buckets by IP+email and its counter lives for the life of the process,
    // so a shared address would let one test exhaust the allowance for the next.
    seq += 1;
    email = `admin.${seq}@nwhr.org.za`;
    const user = new User({ name: 'Admin', email, role: ROLES.ADMIN_OFFICER, status: 'active' });
    await user.setPassword(PASSWORD);
    await user.save();
  });

  it('rejects a wrong password in the error envelope', async () => {
    const res = await request(app).post(`${base}/login`).send({ email: email, password: 'nope-nope-1' });
    expectError(res, 401, 'UNAUTHORIZED');
  });

  it('does not distinguish an unknown account from a wrong password', async () => {
    const unknown = await request(app).post(`${base}/login`).send({ email: 'ghost@nwhr.org.za', password: 'nope-nope-1' });
    const wrong = await request(app).post(`${base}/login`).send({ email: email, password: 'nope-nope-1' });
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('logs in and returns tokens under the success envelope', async () => {
    const res = await request(app).post(`${base}/login`).send({ email: email, password: PASSWORD });
    const data = expectSuccess(res);
    expect(typeof data.accessToken).toBe('string');
    expect(data.user.email).toBe(email);
  });

  it('never returns the password hash', async () => {
    const res = await request(app).post(`${base}/login`).send({ email: email, password: PASSWORD });
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('sets an httpOnly refresh cookie scoped to the auth mount', async () => {
    const res = await request(app).post(`${base}/login`).send({ email: email, password: PASSWORD });
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refresh_token='));
    expect(cookie).toContain('HttpOnly');
    // A mismatch here means the browser never sends it back and every refresh fails.
    expect(cookie).toContain('Path=/api/v1/auth');
  });

  it('rotates the refresh token and detects replay of the old one', async () => {
    const login = await request(app).post(`${base}/login`).send({ email: email, password: PASSWORD });
    const first = login.headers['set-cookie'].find((c) => c.startsWith('refresh_token=')).split(';')[0];

    const rotated = await request(app).post(`${base}/refresh`).set('Cookie', first);
    expectSuccess(rotated);
    const second = rotated.headers['set-cookie'].find((c) => c.startsWith('refresh_token=')).split(';')[0];
    expect(second).not.toBe(first);

    // Replaying the spent token burns the whole family, including the live one.
    expectError(await request(app).post(`${base}/refresh`).set('Cookie', first), 401);
    expectError(await request(app).post(`${base}/refresh`).set('Cookie', second), 401);
  });

  it('reports field errors for an empty login body', async () => {
    const res = await request(app).post(`${base}/login`).send({});
    const err = expectError(res, 422, 'VALIDATION_FAILED');
    expect(Object.keys(err.details)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('requires authentication for /me', async () => {
    expectError(await request(app).get(`${base}/me`), 401);
  });

  it('invites a user and reports whether the email went out', async () => {
    const login = await request(app).post(`${base}/login`).send({ email: email, password: PASSWORD });
    const res = await request(app)
      .post(`${base}/invite`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ name: 'New Officer', email: 'new@nwhr.org.za', role: ROLES.ME_OFFICER });

    const data = expectSuccess(res, 201);
    expect(data.user.email).toBe('new@nwhr.org.za');
    expect(typeof data.emailSent).toBe('boolean');
  });

  it('refuses an invite without a permission', async () => {
    const volunteer = await makeUser(ROLES.VOLUNTEER);
    const res = await request(app)
      .post(`${base}/invite`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .send({ name: 'X', email: 'x@nwhr.org.za', role: ROLES.VOLUNTEER });
    expectError(res, 403, 'FORBIDDEN');
  });

  it('answers forgot-password identically whether or not the account exists', async () => {
    const known = await request(app).post(`${base}/forgot-password`).send({ email: email });
    const unknown = await request(app).post(`${base}/forgot-password`).send({ email: 'ghost@nwhr.org.za' });
    expect(known.status).toBe(unknown.status);
    expect(known.body.data).toEqual(unknown.body.data);
  });

  describe('forgot-password for an account that was invited but never activated', () => {
    let invitedEmail;

    beforeEach(async () => {
      invitedEmail = `invited.${seq}@nwhr.org.za`;
      // No password, status 'invited' — exactly what approving an access request creates.
      await User.create({
        name: 'Invited Officer',
        email: invitedEmail,
        role: ROLES.ME_OFFICER,
        status: 'invited',
      });
    });

    /*
     * The behaviour this whole branch exists for. Such a user cannot sign in, and a
     * reset link would not help because accept-invite is what activates the account —
     * so forgot-password has to hand them a new invitation instead.
     */
    it('reissues an invite token rather than a reset token', async () => {
      const res = await request(app).post(`${base}/forgot-password`).send({ email: invitedEmail });
      expectSuccess(res);

      const user = await User.findOne({ email: invitedEmail });
      const live = await Token.find({ user: user._id, usedAt: null });
      expect(live).toHaveLength(1);
      expect(live[0].type).toBe('invite');
    });

    // A reissue must replace the lost link, not add a second live one: the previous
    // email is still in an inbox that may have been forwarded or lost with the device.
    it('supersedes the previous invite so only the newest link works', async () => {
      await request(app).post(`${base}/forgot-password`).send({ email: invitedEmail });
      await request(app).post(`${base}/forgot-password`).send({ email: invitedEmail });

      const user = await User.findOne({ email: invitedEmail });
      expect(await Token.countDocuments({ user: user._id, usedAt: null })).toBe(1);
      expect(await Token.countDocuments({ user: user._id, usedAt: { $ne: null } })).toBe(1);
    });

    it('answers identically to an active account, so the status does not leak', async () => {
      const invited = await request(app).post(`${base}/forgot-password`).send({ email: invitedEmail });
      const active = await request(app).post(`${base}/forgot-password`).send({ email: email });
      expect(invited.status).toBe(active.status);
      expect(invited.body.data).toEqual(active.body.data);
    });

    // A deactivated account must not be able to resurrect itself by asking for a link.
    it('issues nothing for a disabled account', async () => {
      await User.updateOne({ email: invitedEmail }, { $set: { status: 'disabled' } });
      const res = await request(app).post(`${base}/forgot-password`).send({ email: invitedEmail });
      expectSuccess(res);

      const user = await User.findOne({ email: invitedEmail });
      expect(await Token.countDocuments({ user: user._id })).toBe(0);
    });
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app).post(`${base}/login`).send({ email: email, password: 'nope-nope-1' });
    }
    const res = await request(app).post(`${base}/login`).send({ email: email, password: PASSWORD });
    expectError(res, 403);
    expect(res.body.error.message).toMatch(/locked/i);
  });
});
