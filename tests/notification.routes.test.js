import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import Notification from '../src/modules/notifications/notification.model.js';
import * as notifications from '../src/modules/notifications/notification.service.js';
import { PERMISSIONS } from '../src/config/permissions.js';

const hasDb = await connect();
const base = '/api/v1/notifications';

describe.runIf(hasDb)('notifications', () => {
  let owner;
  let other;

  beforeAll(async () => {
    await resetDatabase();
  });
  afterAll(disconnect);

  beforeEach(async () => {
    await resetDatabase();
    owner = await makeUser(ROLES.PROJECT_COORDINATOR);
    other = await makeUser(ROLES.FINANCE_OFFICER);
  });

  const seed = (user, overrides = {}) =>
    Notification.create({
      userId: user._id,
      title: 'Donation Received',
      message: 'A donation has been received for the Food Relief Campaign.',
      type: 'DONATION',
      ...overrides,
    });

  it('requires authentication', async () => {
    expectError(await request(app).get(base), 401);
  });

  it('returns only the caller’s own notifications', async () => {
    await seed(owner.user, { title: 'Mine' });
    await seed(other.user, { title: 'Not mine' });

    const res = await request(app).get(base).set('Authorization', `Bearer ${owner.token}`);
    const data = expectSuccess(res);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Mine');
  });

  it('counts only unread ones', async () => {
    await seed(owner.user);
    await seed(owner.user, { isRead: true, readAt: new Date() });
    await seed(other.user);

    const res = await request(app)
      .get(`${base}/unread-count`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(expectSuccess(res).unread).toBe(1);
  });

  it('filters to unread only', async () => {
    await seed(owner.user, { title: 'Unread' });
    await seed(owner.user, { title: 'Read', isRead: true, readAt: new Date() });

    const res = await request(app)
      .get(`${base}?unreadOnly=true`)
      .set('Authorization', `Bearer ${owner.token}`);
    const data = expectSuccess(res);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Unread');
  });

  it('marks one read and stamps when', async () => {
    const doc = await seed(owner.user);

    const res = await request(app)
      .patch(`${base}/${doc._id}/read`)
      .set('Authorization', `Bearer ${owner.token}`);

    const data = expectSuccess(res);
    expect(data.isRead).toBe(true);
    expect(data.readAt).toBeTruthy();
  });

  it('does not move readAt on a second click', async () => {
    const doc = await seed(owner.user);
    const first = expectSuccess(
      await request(app).patch(`${base}/${doc._id}/read`).set('Authorization', `Bearer ${owner.token}`)
    );
    const second = expectSuccess(
      await request(app).patch(`${base}/${doc._id}/read`).set('Authorization', `Bearer ${owner.token}`)
    );
    expect(second.readAt).toBe(first.readAt);
  });

  it('will not mark someone else’s notification read', async () => {
    const doc = await seed(other.user);
    const res = await request(app)
      .patch(`${base}/${doc._id}/read`)
      .set('Authorization', `Bearer ${owner.token}`);

    // 404, not 403 — confirming it exists would be its own small leak.
    expectError(res, 404, 'NOT_FOUND');
    expect((await Notification.findById(doc._id)).isRead).toBe(false);
  });

  it('marks all read without touching another user’s', async () => {
    await seed(owner.user);
    await seed(owner.user);
    const theirs = await seed(other.user);

    const res = await request(app).post(`${base}/read-all`).set('Authorization', `Bearer ${owner.token}`);
    expect(expectSuccess(res).updated).toBe(2);
    expect((await Notification.findById(theirs._id)).isRead).toBe(false);
  });

  // --- the write side, used by other modules ---------------------------------------

  it('addresses a notification by permission rather than by role name', async () => {
    const admin = await makeUser(ROLES.ADMIN_OFFICER);
    const ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);

    await notifications.notifyPermission(PERMISSIONS.ACCESS_REQUEST_REVIEW, {
      title: 'New Staff Access Request',
      message: 'Someone has requested access.',
      type: 'ACCESS_REQUEST',
      priority: 'HIGH',
    });

    const recipients = (await Notification.find({ type: 'ACCESS_REQUEST' })).map((n) => String(n.userId));
    expect(recipients).toContain(String(admin.user._id));
    expect(recipients).toContain(String(ed.user._id));
    expect(recipients).not.toContain(String(owner.user._id));
  });

  it('skips accounts that cannot sign in to read it', async () => {
    await makeUser(ROLES.ADMIN_OFFICER, { status: 'invited' });

    await notifications.notifyPermission(PERMISSIONS.ACCESS_REQUEST_REVIEW, {
      title: 'New Staff Access Request',
      message: 'Someone has requested access.',
      type: 'ACCESS_REQUEST',
    });

    expect(await Notification.countDocuments({ type: 'ACCESS_REQUEST' })).toBe(0);
  });

  it('never throws when a notification cannot be written', async () => {
    // An invalid type fails the enum. The caller — an approval, a settled donation — must
    // still succeed, so this resolves rather than rejecting.
    const result = await notifications.notify({
      userId: owner.user._id,
      title: 'Bad',
      message: 'Bad',
      type: 'NOT_A_REAL_TYPE',
    });
    expect(result).toBeNull();
  });
});
