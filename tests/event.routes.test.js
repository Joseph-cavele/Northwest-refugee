import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import { EventParticipant } from '../src/modules/events/event.model.js';

const hasDb = await connect();
const base = '/api/v1/events';

describe.runIf(hasDb)('event routes', () => {
  let comms; let coord; let ed; let volunteer; let event; let person;

  const draft = (over = {}) => ({
    title: 'Refugee Day Awareness',
    type: 'AWARENESS',
    startsAt: '2026-06-20T09:00:00.000Z',
    endsAt: '2026-06-20T15:00:00.000Z',
    expectedAttendance: 100,
    ...over,
  });

  beforeEach(async () => {
    await resetDatabase();
    await EventParticipant.syncIndexes();

    comms = await makeUser(ROLES.COMMS_OFFICER);
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    volunteer = await makeUser(ROLES.VOLUNTEER);

    person = await makeBeneficiary(coord.user);
    event = expectSuccess(
      await request(app).post(base).set('Authorization', `Bearer ${comms.token}`).send(draft()),
      201
    );
  });
  afterAll(disconnect);

  const asComms = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${comms.token}`);

  // --- access ---------------------------------------------------------------
  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(base), 401);
    expectError(await request(app).get(base).set('Authorization', `Bearer ${volunteer.token}`), 403);
  });

  it('lets the ED read but not create', async () => {
    expectSuccess(await request(app).get(base).set('Authorization', `Bearer ${ed.token}`));
    expectError(await request(app).post(base).set('Authorization', `Bearer ${ed.token}`).send(draft()), 403);
  });

  // --- events ---------------------------------------------------------------
  it('creates an event', async () => {
    expect(event.status).toBe('PLANNED');
    expect(event.recordedAttendance).toBe(0);
    expect(event.expectedAttendance).toBe(100);
  });

  it('rejects an event that ends before it starts', async () => {
    const res = await asComms('post', base).send(
      draft({ startsAt: '2026-06-20T15:00:00.000Z', endsAt: '2026-06-20T09:00:00.000Z' })
    );
    const err = expectError(res, 422);
    expect(err.details).toHaveProperty('endsAt');
  });

  it('requires a reason to cancel, and then refuses edits', async () => {
    expectError(await asComms('patch', `${base}/${event._id}`).send({ status: 'CANCELLED' }), 422);

    expectSuccess(
      await asComms('patch', `${base}/${event._id}`).send({ status: 'CANCELLED', cancellationReason: 'Venue lost' })
    );
    expectError(await asComms('patch', `${base}/${event._id}`).send({ venue: 'Elsewhere' }), 409);
  });

  it('will not let a headcount be typed in directly', async () => {
    const updated = expectSuccess(
      await asComms('patch', `${base}/${event._id}`).send({ recordedAttendance: 500, venue: 'Civic Hall' })
    );
    // Attendance is derived from the register, never asserted.
    expect(updated.recordedAttendance).toBe(0);
    expect(updated.venue).toBe('Civic Hall');
  });

  it('rejects an empty PATCH', async () => {
    expectError(await asComms('patch', `${base}/${event._id}`).send({}), 422);
  });

  // --- participants: the consent rule ---------------------------------------
  const participantsUrl = () => `${base}/${event._id}/participants`;

  it('records anonymous attendees with no identifying information', async () => {
    const updated = expectSuccess(
      await asComms('post', participantsUrl()).send({
        participants: [
          { gender: 'FEMALE', ageBand: '25-34' },
          { gender: 'MALE', ageBand: '18-24', isFirstTime: true },
        ],
      })
    );
    expect(updated.recordedAttendance).toBe(2);

    const rows = await EventParticipant.find({ event: event._id });
    // A walk-in has consented to nothing, so nothing that singles them out is stored.
    expect(rows.every((r) => r.contactName === null && r.contactPhone === null)).toBe(true);
    expect(rows.every((r) => r.beneficiary === null)).toBe(true);
  });

  it('refuses a name or number without recorded consent to be contacted', async () => {
    const res = await asComms('post', participantsUrl()).send({
      participants: [{ gender: 'FEMALE', contactName: 'Amina', contactPhone: '0821234567' }],
    });
    const err = expectError(res, 422);
    expect(err.details).toHaveProperty('participants.0.consentToContact');
  });

  it('accepts contact details when consent is recorded, and normalises the number', async () => {
    expectSuccess(
      await asComms('post', participantsUrl()).send({
        participants: [
          { gender: 'FEMALE', consentToContact: true, contactName: 'Amina', contactPhone: '082 123 4567' },
        ],
      })
    );
    const row = await EventParticipant.findOne({ event: event._id });
    expect(row.contactPhone).toBe('+27821234567');
  });

  it('never returns a contact number in a listing', async () => {
    await asComms('post', participantsUrl()).send({
      participants: [{ gender: 'FEMALE', consentToContact: true, contactName: 'Amina', contactPhone: '0821234567' }],
    });
    const listed = expectSuccess(await asComms('get', participantsUrl()));
    expect(JSON.stringify(listed)).not.toContain('27821234567');
    expect(listed[0].contactName).toBe('Amina');
  });

  it('does not re-record details for someone already on the register', async () => {
    const res = await asComms('post', participantsUrl()).send({
      participants: [
        { beneficiary: String(person._id), consentToContact: true, contactName: 'Duplicate' },
      ],
    });
    expectError(res, 422);
  });

  // --- known attendees ------------------------------------------------------
  it('counts a known beneficiary once, even if the register is re-submitted', async () => {
    const body = { participants: [{ beneficiary: String(person._id), gender: 'FEMALE' }] };
    expectSuccess(await asComms('post', participantsUrl()).send(body));
    const second = expectSuccess(await asComms('post', participantsUrl()).send(body));

    expect(second.recordedAttendance).toBe(1);
    expect(await EventParticipant.countDocuments({ event: event._id })).toBe(1);
  });

  it('rejects the same person twice in one register', async () => {
    expectError(
      await asComms('post', participantsUrl()).send({
        participants: [
          { beneficiary: String(person._id) },
          { beneficiary: String(person._id) },
        ],
      }),
      422
    );
  });

  it('allows many anonymous rows, which have nothing to deduplicate on', async () => {
    const updated = expectSuccess(
      await asComms('post', participantsUrl()).send({
        participants: [{ gender: 'FEMALE' }, { gender: 'FEMALE' }, { gender: 'FEMALE' }],
      })
    );
    expect(updated.recordedAttendance).toBe(3);
  });

  it('has no register for a cancelled event', async () => {
    await asComms('patch', `${base}/${event._id}`).send({ status: 'CANCELLED', cancellationReason: 'Venue lost' });
    expectError(await asComms('post', participantsUrl()).send({ participants: [{ gender: 'MALE' }] }), 409);
  });

  // --- reporting ------------------------------------------------------------
  it('reports an aggregated breakdown with no identities in it', async () => {
    await asComms('post', participantsUrl()).send({
      participants: [
        { beneficiary: String(person._id), gender: 'FEMALE', ageBand: '25-34' },
        { gender: 'FEMALE', ageBand: '25-34', isFirstTime: true },
        { gender: 'MALE', ageBand: '35-49' },
      ],
    });

    const summary = expectSuccess(await asComms('get', `${base}/${event._id}/attendance`));
    expect(summary.total).toBe(3);
    expect(summary.known).toBe(1);
    expect(summary.anonymous).toBe(2);
    expect(summary.firstTime).toBe(1);
    expect(summary.byGender).toEqual({ FEMALE: 2, MALE: 1 });
    expect(summary.byAgeBand).toEqual({ '25-34': 2, '35-49': 1 });
    // 3 recorded against 100 expected.
    expect(summary.variance).toBe(-97);
  });

  it('filters a register to known attendees', async () => {
    await asComms('post', participantsUrl()).send({
      participants: [{ beneficiary: String(person._id) }, { gender: 'MALE' }],
    });
    expect(expectSuccess(await asComms('get', `${participantsUrl()}?knownOnly=true`))).toHaveLength(1);
  });

  it('lists upcoming events only when asked', async () => {
    await asComms('post', base).send(draft({ title: 'Past Event', startsAt: '2020-01-01T09:00:00.000Z', endsAt: null }));
    const upcoming = expectSuccess(await asComms('get', `${base}?upcomingOnly=true`));
    expect(upcoming.every((e) => new Date(e.startsAt) >= new Date())).toBe(true);
  });
});
