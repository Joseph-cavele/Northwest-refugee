import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import Department from '../src/modules/departments/department.model.js';

const hasDb = await connect();
const base = '/api/v1/departments';

describe.runIf(hasDb)('departments', () => {
  let admin;

  beforeAll(async () => {
    await resetDatabase();
  });
  afterAll(disconnect);

  beforeEach(async () => {
    await resetDatabase();
    admin = await makeUser(ROLES.ADMIN_OFFICER);
  });

  const create = (body) =>
    request(app).post(base).set('Authorization', `Bearer ${admin.token}`).send(body);

  it('requires authentication', async () => {
    expectError(await request(app).get(base), 401);
  });

  it('creates a department and derives its slug', async () => {
    const res = await create({ name: 'Communications & Marketing' });
    const data = expectSuccess(res, 201);
    expect(data.slug).toBe('communications-marketing');
    expect(data.isActive).toBe(true);
  });

  it('refuses a duplicate name regardless of case', async () => {
    await create({ name: 'Finance' });
    expectError(await create({ name: 'finance' }), 409, 'CONFLICT');
  });

  it('refuses a name with nothing to slugify', async () => {
    expectError(await create({ name: '&&&' }), 400, 'BAD_REQUEST');
  });

  it('refuses creation without the permission', async () => {
    const volunteer = await makeUser(ROLES.VOLUNTEER);
    const res = await request(app)
      .post(base)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .send({ name: 'Rogue Department' });
    expectError(res, 403, 'FORBIDDEN');
  });

  it('hides deactivated departments by default but can include them', async () => {
    await Department.create({ name: 'Active One', slug: 'active-one' });
    await Department.create({ name: 'Closed One', slug: 'closed-one', isActive: false });

    const listed = expectSuccess(
      await request(app).get(base).set('Authorization', `Bearer ${admin.token}`)
    );
    expect(listed.map((d) => d.name)).toEqual(['Active One']);

    const all = expectSuccess(
      await request(app).get(`${base}?includeInactive=true`).set('Authorization', `Bearer ${admin.token}`)
    );
    expect(all).toHaveLength(2);
  });

  it('keeps the slug stable across a rename', async () => {
    const created = expectSuccess(await create({ name: 'Programmes' }), 201);

    const res = await request(app)
      .patch(`${base}/${created._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Programme Delivery' });

    const updated = expectSuccess(res);
    expect(updated.name).toBe('Programme Delivery');
    // A saved filter or a bookmarked link must not break for a cosmetic edit.
    expect(updated.slug).toBe('programmes');
  });

  it('deactivates rather than deleting', async () => {
    const created = expectSuccess(await create({ name: 'Old Unit' }), 201);

    const res = await request(app)
      .patch(`${base}/${created._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: false });

    expect(expectSuccess(res).isActive).toBe(false);
    // Still there, so staff and past requests pointing at it still render.
    expect(await Department.findById(created._id)).not.toBeNull();
  });

  it('refuses an empty update', async () => {
    const created = expectSuccess(await create({ name: 'Something' }), 201);
    const res = await request(app)
      .patch(`${base}/${created._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expectError(res, 422, 'VALIDATION_FAILED');
  });

  it('404s an unknown department', async () => {
    const res = await request(app)
      .get(`${base}/507f1f77bcf86cd799439011`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 404, 'NOT_FOUND');
  });
});
