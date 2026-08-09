import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';

const hasDb = await connect();
const base = '/api/v1/chatboard';

describe.runIf(hasDb)('chatboard routes', () => {
  let coord; let peer; let volunteer; let finance; let channel;

  beforeEach(async () => {
    await resetDatabase();
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    peer = await makeUser(ROLES.PEER_LEADER);
    volunteer = await makeUser(ROLES.VOLUNTEER);
    finance = await makeUser(ROLES.FINANCE_OFFICER);

    channel = expectSuccess(
      await request(app).post(`${base}/channels`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'General Updates' }),
      201
    );
  });
  afterAll(disconnect);

  const post = (token, body) =>
    request(app).post(`${base}/channels/${channel._id}/messages`).set('Authorization', `Bearer ${token}`).send(body);

  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(`${base}/channels`), 401);
    expectError(await request(app).get(`${base}/channels`).set('Authorization', `Bearer ${finance.token}`), 403);
  });

  it('derives a slug and makes the creator a member', async () => {
    expect(channel.slug).toBe('general-updates');
    expect(channel.members).toContain(coord.id);
  });

  it('suffixes a colliding slug rather than failing', async () => {
    const dupe = expectSuccess(
      await request(app).post(`${base}/channels`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'General   Updates!' }),
      201
    );
    expect(dupe.slug).toBe('general-updates-2');
  });

  it('hides a private channel from non-members, as a 404', async () => {
    const priv = expectSuccess(
      await request(app).post(`${base}/channels`).set('Authorization', `Bearer ${coord.token}`)
        .send({ name: 'Safeguarding', isPrivate: true }),
      201
    );
    // The existence of a channel named "Safeguarding" is itself information.
    expectError(await request(app).get(`${base}/channels/${priv._id}`).set('Authorization', `Bearer ${peer.token}`), 404);

    const list = await request(app).get(`${base}/channels`).set('Authorization', `Bearer ${peer.token}`);
    expect(expectSuccess(list).some((c) => c._id === priv._id)).toBe(false);
  });

  it('posts a message with the author populated but no email', async () => {
    const data = expectSuccess(await post(peer.token, { body: 'Food parcels arrive Thursday' }), 201);
    expect(data.author.name).toBeTruthy();
    expect(data.author.email).toBeUndefined();
  });

  it('refuses a South African ID number and says what to do instead', async () => {
    const res = await post(peer.token, { body: 'Her ID is 9202204720082' });
    const err = expectError(res, 422);
    expect(err.details.body).toMatch(/NWHR code/);
  });

  it('does not false-positive on phone numbers or reference codes', async () => {
    expectSuccess(await post(peer.token, { body: 'Call her on 0821234567' }), 201);
    expectSuccess(await post(peer.token, { body: 'Re NWHR-2026-K7M3QP' }), 201);
  });

  it('lets only the author edit, with no manager override', async () => {
    const msg = expectSuccess(await post(peer.token, { body: 'original' }), 201);

    expectError(
      await request(app).patch(`${base}/messages/${msg._id}`).set('Authorization', `Bearer ${coord.token}`)
        .send({ body: 'rewritten' }),
      403
    );

    const edited = expectSuccess(
      await request(app).patch(`${base}/messages/${msg._id}`).set('Authorization', `Bearer ${peer.token}`)
        .send({ body: 'corrected' })
    );
    expect(edited.isEdited).toBe(true);
  });

  it('applies the ID guard to edits too', async () => {
    const msg = expectSuccess(await post(peer.token, { body: 'fine' }), 201);
    expectError(
      await request(app).patch(`${base}/messages/${msg._id}`).set('Authorization', `Bearer ${peer.token}`)
        .send({ body: 'id 9202204720082' }),
      422
    );
  });

  it('soft-deletes: the slot stays, the words go', async () => {
    const msg = expectSuccess(await post(peer.token, { body: 'Food parcels arrive Thursday' }), 201);

    expectError(
      await request(app).delete(`${base}/messages/${msg._id}`).set('Authorization', `Bearer ${volunteer.token}`),
      403
    );

    const deleted = expectSuccess(
      await request(app).delete(`${base}/messages/${msg._id}`).set('Authorization', `Bearer ${coord.token}`)
    );
    expect(deleted.body).toBeNull();
    expect(deleted.deletedBy).toBe(coord.id);

    const thread = await request(app).get(`${base}/channels/${channel._id}/messages`)
      .set('Authorization', `Bearer ${peer.token}`);
    const data = expectSuccess(thread);
    expect(data).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain('Food parcels');
  });

  it('keeps an archived channel readable but closed to new messages', async () => {
    await post(peer.token, { body: 'before' });
    expectSuccess(await request(app).post(`${base}/channels/${channel._id}/archive`).set('Authorization', `Bearer ${coord.token}`));

    expectError(await post(peer.token, { body: 'after' }), 409);
    expect(expectSuccess(
      await request(app).get(`${base}/channels/${channel._id}/messages`).set('Authorization', `Bearer ${peer.token}`)
    )).toHaveLength(1);
  });
});
