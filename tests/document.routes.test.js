import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, makeBeneficiary,
  expectSuccess, expectError,
} from './helpers.js';
import * as cloudinary from '../src/config/cloudinary.js';

const hasDb = await connect();
const base = '/api/v1/documents';

// Real bytes, so the content sniffer is actually exercised.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 9)]);

describe.runIf(hasDb)('document routes', () => {
  let admin; let peer; let coord; let beneficiary; let uploads;

  beforeEach(async () => {
    await resetDatabase();
    admin = await makeUser(ROLES.ADMIN_OFFICER);
    peer = await makeUser(ROLES.PEER_LEADER);
    coord = await makeUser(ROLES.PROJECT_COORDINATOR);
    beneficiary = await makeBeneficiary(peer.user);

    // Cloudinary has no credentials in tests, so the two network calls are stubbed. The
    // URL signing itself is NOT stubbed — that is the part worth asserting on.
    uploads = 0;
    vi.spyOn(cloudinary, 'uploadBuffer').mockImplementation(async (buf) => {
      uploads += 1;
      return { public_id: `nwhr/test/asset_${uploads}`, resource_type: 'image', format: 'jpg', bytes: buf.length };
    });
    vi.spyOn(cloudinary, 'destroyAsset').mockResolvedValue({ result: 'ok' });
    vi.spyOn(cloudinary, 'signedDownloadUrl').mockImplementation(
      (id, fmt) => `https://api.cloudinary.test/download?public_id=${id}&format=${fmt}&expires_at=${Math.floor(Date.now() / 1000) + 300}&signature=abc`
    );
  });
  afterAll(disconnect);

  const upload = (token, { buffer = JPEG, type = 'image/jpeg', name = 'permit.jpg', kind = 'ASYLUM_PERMIT', ben = beneficiary } = {}) =>
    request(app)
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .field('beneficiary', String(ben._id))
      .field('kind', kind)
      .attach('file', buffer, { filename: name, contentType: type });

  it('requires authentication', async () => {
    expectError(await request(app).get(`${base}?beneficiary=${beneficiary._id}`), 401);
  });

  it('enforces document:create', async () => {
    const volunteer = await makeUser(ROLES.VOLUNTEER);
    expectError(await upload(volunteer.token), 403);
  });

  it('uploads and never returns the storage key', async () => {
    const data = expectSuccess(await upload(admin.token), 201);
    expect(data.storageKey).toBeUndefined();
    expect(data.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(uploads).toBe(1);
  });

  it('rejects an executable renamed as an image, before it reaches storage', async () => {
    const res = await upload(admin.token, { buffer: EXE, name: 'evil.jpg' });
    expectError(res, 400);
    expect(uploads).toBe(0);
  });

  it('rejects a declared type that disagrees with the actual bytes', async () => {
    expectError(await upload(admin.token, { buffer: PNG, type: 'image/jpeg' }), 400);
    expect(uploads).toBe(0);
  });

  it('treats the same file uploaded twice for one person as a duplicate', async () => {
    expectSuccess(await upload(admin.token), 201);
    expectError(await upload(admin.token, { name: 'again.jpg' }), 409);
  });

  it('requires a beneficiary on the list, so access can be checked exactly', async () => {
    expectError(await request(app).get(base).set('Authorization', `Bearer ${admin.token}`), 422);
  });

  it('inherits beneficiary scoping', async () => {
    expectSuccess(await upload(admin.token), 201);

    const own = await request(app).get(`${base}?beneficiary=${beneficiary._id}`).set('Authorization', `Bearer ${peer.token}`);
    expect(expectSuccess(own)).toHaveLength(1);

    const other = await makeBeneficiary(admin.user);
    const denied = await request(app).get(`${base}?beneficiary=${other._id}`).set('Authorization', `Bearer ${peer.token}`);
    expectError(denied, 404);
  });

  it('separates reading a document from downloading it', async () => {
    const doc = expectSuccess(await upload(admin.token), 201);
    // The peer leader may list it but holds no document:download.
    expectError(
      await request(app).get(`${base}/${doc._id}/download`).set('Authorization', `Bearer ${peer.token}`),
      403
    );
  });

  it('returns a signed, expiring URL and audits the fetch', async () => {
    const doc = expectSuccess(await upload(admin.token), 201);
    const res = await request(app)
      .get(`${base}/${doc._id}/download?reason=Home Affairs renewal`)
      .set('Authorization', `Bearer ${admin.token}`);

    const data = expectSuccess(res);
    expect(data.url).toContain('signature=');
    expect(data.url).toContain('expires_at=');
    expect(data.expiresInSeconds).toBe(300);

    const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
    const entry = await AuditLog.findOne({ action: 'document.downloaded' });
    expect(String(entry.actor)).toBe(admin.id);
    expect(entry.meta.reason).toBe('Home Affairs renewal');
  });

  it('soft-deletes and leaves the stored asset in place', async () => {
    const doc = expectSuccess(await upload(admin.token), 201);
    expectError(await request(app).delete(`${base}/${doc._id}`).set('Authorization', `Bearer ${coord.token}`), 403);

    const deleted = expectSuccess(await request(app).delete(`${base}/${doc._id}`).set('Authorization', `Bearer ${admin.token}`));
    expect(deleted.deletedAt).not.toBeNull();
    // A case history that loses its evidence cannot be audited.
    expect(cloudinary.destroyAsset).not.toHaveBeenCalled();
  });

  it('links a permit upload to the beneficiary case file', async () => {
    const doc = expectSuccess(await upload(admin.token), 201);
    const { default: Beneficiary } = await import('../src/modules/beneficiaries/beneficiary.model.js');
    const refreshed = await Beneficiary.findById(beneficiary._id).select('+immigration.documentId');
    expect(String(refreshed.immigration.documentId)).toBe(doc._id);
  });
});
