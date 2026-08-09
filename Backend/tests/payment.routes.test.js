import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess } from './helpers.js';
import { Donation } from '../src/modules/fundraising/fundraising.model.js';
import * as paystack from '../src/modules/payments/paystack.provider.js';

const hasDb = await connect();
const url = '/api/v1/payments/webhooks/paystack';
const SECRET = process.env.PAYSTACK_SECRET_KEY;

/** Sign exactly as Paystack does: HMAC-SHA512 over the raw body, keyed by the secret key. */
const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex');

const post = (payload, signature) => {
  const raw = JSON.stringify(payload);
  const req = request(app).post(url).set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('x-paystack-signature', signature);
  return req.send(raw);
};

const chargeSuccess = (reference) => ({ event: 'charge.success', data: { reference } });

/** The webhook answers 200 before processing, so a test must wait for the work to land. */
const settled = async (id, expected = 'SETTLED') => {
  for (let i = 0; i < 40; i += 1) {
    const doc = await Donation.findById(id);
    if (doc.status === expected) return doc;
    await new Promise((r) => setTimeout(r, 50));
  }
  return Donation.findById(id);
};

describe.runIf(hasDb)('paystack webhook', () => {
  let finance;
  let donation;

  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
    finance = await makeUser(ROLES.FINANCE_OFFICER);

    const donor = expectSuccess(
      await request(app).post('/api/v1/fundraising/donors')
        .set('Authorization', `Bearer ${finance.token}`)
        .send({ name: 'Acme Trust', type: 'TRUST' }),
      201
    );
    donation = expectSuccess(
      await request(app).post('/api/v1/fundraising/donations')
        .set('Authorization', `Bearer ${finance.token}`)
        .send({ donor: donor._id, amount: '250.00', method: 'PAYSTACK' }),
      201
    );
  });

  afterAll(disconnect);

  // --- gate 1: signature ----------------------------------------------------------
  it('refuses an unsigned notification', async () => {
    expect((await post(chargeSuccess(donation.reference))).status).toBe(401);
  });

  it('refuses a forged signature', async () => {
    expect((await post(chargeSuccess(donation.reference), 'deadbeef')).status).toBe(401);
  });

  it('refuses a signature computed over different bytes', async () => {
    // A genuine digest for a DIFFERENT payload must not pass for this one.
    const other = sign(JSON.stringify(chargeSuccess('GFT-SOMETHING-ELSE')));
    expect((await post(chargeSuccess(donation.reference), other)).status).toBe(401);
  });

  it('refuses a SHA256 digest — Paystack signs with SHA512', async () => {
    const raw = JSON.stringify(chargeSuccess(donation.reference));
    const wrongAlgo = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect((await post(chargeSuccess(donation.reference), wrongAlgo)).status).toBe(401);
  });

  it('leaves the donation pending when the signature fails', async () => {
    await post(chargeSuccess(donation.reference), 'deadbeef');
    expect((await Donation.findById(donation._id)).status).toBe('PENDING');
  });

  // --- gates 2-4 ------------------------------------------------------------------
  it('settles a donation on a genuine charge.success', async () => {
    const spy = vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
      status: 'success',
      amountCents: 25000,
      currency: 'ZAR',
      reference: donation.reference,
      paidAt: new Date(),
      channel: 'card',
    });

    const raw = JSON.stringify(chargeSuccess(donation.reference));
    const res = await request(app).post(url)
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw))
      .send(raw);

    // 200 before the work, so Paystack does not time out and retry.
    expect(res.status).toBe(200);

    const doc = await settled(donation._id);
    expect(doc.status).toBe('SETTLED');
    expect(doc.receiptNumber).toMatch(/^S18A-/);
    expect(spy).toHaveBeenCalledWith(donation.reference);
  });

  it('does NOT settle when Paystack says the payment did not succeed', async () => {
    // The body claims charge.success; the gateway itself says otherwise. The gateway wins
    // — this is the whole reason for the server-to-server call.
    vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
      status: 'failed', amountCents: 25000, currency: 'ZAR', reference: donation.reference, paidAt: null, channel: null,
    });

    const raw = JSON.stringify(chargeSuccess(donation.reference));
    await request(app).post(url).set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw)).send(raw);

    await new Promise((r) => setTimeout(r, 400));
    expect((await Donation.findById(donation._id)).status).toBe('PENDING');
  });

  it('does NOT settle when the amount does not match', async () => {
    // R5 arriving against a R250 donation must not settle it in full.
    vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
      status: 'success', amountCents: 500, currency: 'ZAR', reference: donation.reference, paidAt: new Date(), channel: 'card',
    });

    const raw = JSON.stringify(chargeSuccess(donation.reference));
    await request(app).post(url).set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw)).send(raw);

    await new Promise((r) => setTimeout(r, 400));
    expect((await Donation.findById(donation._id)).status).toBe('PENDING');
  });

  it('does NOT settle when the currency does not match', async () => {
    vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
      status: 'success', amountCents: 25000, currency: 'NGN', reference: donation.reference, paidAt: new Date(), channel: 'card',
    });

    const raw = JSON.stringify(chargeSuccess(donation.reference));
    await request(app).post(url).set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw)).send(raw);

    await new Promise((r) => setTimeout(r, 400));
    expect((await Donation.findById(donation._id)).status).toBe('PENDING');
  });

  it('acknowledges an unknown reference without erroring', async () => {
    const raw = JSON.stringify(chargeSuccess('GFT-NOT-OURS'));
    const res = await request(app).post(url).set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw)).send(raw);
    // Another integration on the same account, or a replay. Acknowledged, not retried.
    expect(res.status).toBe(200);
  });

  it('ignores events it does not handle', async () => {
    const payload = { event: 'transfer.success', data: { reference: donation.reference } };
    const raw = JSON.stringify(payload);
    const res = await request(app).post(url).set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw)).send(raw);

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect((await Donation.findById(donation._id)).status).toBe('PENDING');
  });

  // --- idempotency ----------------------------------------------------------------
  it('does not double-count when Paystack retries', async () => {
    vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
      status: 'success', amountCents: 25000, currency: 'ZAR', reference: donation.reference, paidAt: new Date(), channel: 'card',
    });

    const raw = JSON.stringify(chargeSuccess(donation.reference));
    const send = () => request(app).post(url).set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(raw)).send(raw);

    await send();
    await settled(donation._id);
    const first = await Donation.findById(donation._id);

    await send();
    await send();
    await new Promise((r) => setTimeout(r, 500));

    const after = await Donation.findById(donation._id);
    // Same receipt, same settlement time — a retry changed nothing.
    expect(after.receiptNumber).toBe(first.receiptNumber);
    expect(after.settledAt.getTime()).toBe(first.settledAt.getTime());
  });
});
