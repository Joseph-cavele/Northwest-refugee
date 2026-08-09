import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { ROLES } from '../src/config/constants.js';
import { signAccessToken } from '../src/utils/tokens.js';
import User from '../src/modules/users/user.model.js';
import Beneficiary from '../src/modules/beneficiaries/beneficiary.model.js';

export { app, request, ROLES, mongoose };

let connected = false;

/**
 * Connect once per process. Returns false when no database is reachable so a suite can
 * skip rather than fail — the router contracts are worth running locally even where CI
 * has no mongod yet.
 */
export async function connect() {
  if (connected) return true;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    connected = true;
    return true;
  } catch {
    return false;
  }
}

export async function disconnect() {
  if (!connected) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  connected = false;
}

/** Empty every collection between files so fixtures cannot leak across suites. */
export async function resetDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

let userSeq = 0;

/** A staff account plus a signed access token for it. */
export async function makeUser(role, overrides = {}) {
  userSeq += 1;
  const user = await User.create({
    name: `${role} ${userSeq}`,
    email: `${role.toLowerCase()}.${userSeq}@nwhr.org.za`,
    role,
    status: 'active',
    ...overrides,
  });
  return { user, token: signAccessToken(user), id: String(user._id) };
}

let phoneSeq = 0;

/** A consenting adult beneficiary, captured by `actor`. */
export async function makeBeneficiary(actor, overrides = {}) {
  phoneSeq += 1;
  const { createBeneficiary } = await import('../src/modules/beneficiaries/beneficiary.service.js');
  return createBeneficiary(
    {
      firstName: 'Test',
      lastName: `Person${phoneSeq}`,
      gender: 'FEMALE',
      dateOfBirth: new Date('1995-01-01'),
      nationality: 'Democratic Republic of the Congo',
      languages: ['fr'],
      immigration: { status: 'UNDOCUMENTED' },
      contact: { cellphone: `+27821${String(100000 + phoneSeq)}` },
      consent: { given: true, method: 'WHATSAPP', policyVersion: '1.0' },
      ...overrides,
    },
    actor,
    {}
  );
}

export { Beneficiary };

// --- envelope assertions ----------------------------------------------------------
// Every route in this API answers in one of exactly two shapes. Asserting on them here
// means a module that drifts back to a bare res.json() is caught by its own router test.

export function expectSuccess(res, status = 200) {
  if (res.status !== status) {
    throw new Error(`Expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  if (res.body?.success !== true || !('data' in res.body)) {
    throw new Error(`Not a success envelope: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

export function expectError(res, status, code) {
  if (res.status !== status) {
    throw new Error(`Expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  if (res.body?.success !== false || typeof res.body?.error?.code !== 'string') {
    throw new Error(`Not an error envelope: ${JSON.stringify(res.body)}`);
  }
  if (typeof res.body.requestId !== 'string') {
    throw new Error(`Error envelope is missing requestId: ${JSON.stringify(res.body)}`);
  }
  if (code && res.body.error.code !== code) {
    throw new Error(`Expected code ${code}, got ${res.body.error.code}`);
  }
  return res.body.error;
}
