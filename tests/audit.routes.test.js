import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import { ACTIONS } from '../src/modules/audit/audit.model.js';
import { readSensitive } from '../src/modules/beneficiaries/beneficiary.service.js';

const hasDb = await connect();
const base = '/api/v1/audit';
const PERMIT = 'ASY-2026-445566';

describe.runIf(hasDb)('audit routes', () => {
  let ed; let admin; let me; let coord; let volunteer; let beneficiary;

  beforeEach(async () => {
    await resetDatabase();
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    me = await makeUser(ROLES.ME_OFFICER);
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    volunteer = await makeUser(ROLES.VOLUNTEER);

    beneficiary = await makeBeneficiary(admin.user, {
      immigration: { status: 'ASYLUM_SEEKER', permitNumber: PERMIT },
    });
    await readSensitive(beneficiary._id, ed.user, { ip: '10.0.0.2' }, 'board review');
  });
  afterAll(disconnect);

  const list = (token, qs = '') => request(app).get(`${base}${qs}`).set('Authorization', `Bearer ${token}`);

  it('is readable only by the three office roles that hold audit:read', async () => {
    expectError(await request(app).get(base), 401);
    for (const u of [ed, admin, me]) expectSuccess(await list(u.token));
    for (const u of [coord, volunteer]) expectError(await list(u.token), 403);
  });

  it('populates the actor with name and role but not email', async () => {
    const [entry] = expectSuccess(await list(ed.token));
    expect(entry.actor.name).toBeTruthy();
    expect(entry.actor.role).toBeTruthy();
    expect(entry.actor.email).toBeUndefined();
  });

  it('never carries a permit number in the trail', async () => {
    const res = await list(ed.token, '?limit=100');
    expect(JSON.stringify(res.body)).not.toContain('445566');
  });

  it('records which sensitive fields were read, and why — never their values', async () => {
    const data = expectSuccess(await list(ed.token, `?action=${encodeURIComponent(ACTIONS.SENSITIVE_READ)}`));
    expect(data).toHaveLength(1);
    expect(data[0].meta.reason).toBe('board review');
    expect(data[0].meta.fields).toContain('immigration.permitNumber');
  });

  it('filters by target — the Mixed path needs an ObjectId, not a string', async () => {
    const data = expectSuccess(await list(ed.token, `?targetType=Beneficiary&targetId=${beneficiary._id}`));
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e) => String(e.targetId) === String(beneficiary._id))).toBe(true);
  });

  it('records denials as failures naming the refused permission', async () => {
    await list(volunteer.token); // writes a PERMISSION_DENIED entry
    const data = expectSuccess(await list(ed.token, '?status=failure'));
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].action).toBe(ACTIONS.PERMISSION_DENIED);
    expect(data[0].meta.permission).toBe('audit:read');
  });

  it('rejects an unknown action rather than returning a silently empty page', async () => {
    expectError(await list(ed.token, '?action=not.a.real.action'), 422);
  });

  it('validates ids, limits and date ranges', async () => {
    expectError(await list(ed.token, '?actor=nope'), 422);
    expectError(await list(ed.token, '?limit=100000'), 422);
    expectError(await list(ed.token, '?from=2026-07-01T00:00:00Z&to=2026-06-01T00:00:00Z'), 422);
  });

  it('exposes the action vocabulary from the same source the writers use', async () => {
    const data = expectSuccess(await request(app).get(`${base}/actions`).set('Authorization', `Bearer ${ed.token}`));
    expect(data).toHaveLength(Object.keys(ACTIONS).length);
    expect(data).toEqual([...data].sort());
  });

  it('is append-only through the API — nothing but GET is routed', async () => {
    for (const method of ['post', 'patch', 'put', 'delete']) {
      const res = await request(app)[method](base).set('Authorization', `Bearer ${ed.token}`);
      expect(res.status).toBe(404);
    }
  });

  it('does not audit reads of the audit trail', async () => {
    const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
    const before = await AuditLog.countDocuments({});
    await list(ed.token);
    await list(ed.token);
    expect(await AuditLog.countDocuments({})).toBe(before);
  });
});
