import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import {
  app, request, ROLES, connect, disconnect, resetDatabase, makeUser, expectSuccess, expectError,
} from './helpers.js';
import { Donor, Campaign, Pledge, Donation } from '../src/modules/fundraising/fundraising.model.js';
import Notification from '../src/modules/notifications/notification.model.js';
import { formatZAR } from '../src/utils/money.js';

const hasDb = await connect();
const base = '/api/v1/fundraising';

describe.runIf(hasDb)('fundraising routes', () => {
  let finance; let comms; let ed; let volunteer; let donor; let campaign;

  beforeEach(async () => {
    await resetDatabase();
    await Donation.syncIndexes();

    finance = await makeUser(ROLES.FINANCE_OFFICER);
    comms = await makeUser(ROLES.COMMS_OFFICER);
    ed = await makeUser(ROLES.EXECUTIVE_DIRECTOR);
    volunteer = await makeUser(ROLES.VOLUNTEER);

    donor = expectSuccess(
      await request(app).post(`${base}/donors`).set('Authorization', `Bearer ${finance.token}`)
        .send({ name: 'Acme Trust', type: 'TRUST', taxNumber: '9012345678' }),
      201
    );
    campaign = expectSuccess(
      await request(app).post(`${base}/campaigns`).set('Authorization', `Bearer ${comms.token}`)
        .send({ name: 'Winter Appeal 2026', target: '50000.00' }),
      201
    );
  });
  

  const asFinance = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${finance.token}`);

  const gift = (over = {}) => ({
    donor: donor._id, campaign: campaign._id, amount: '250.50', method: 'EFT', ...over,
  });

  // --- access ---------------------------------------------------------------
  it('requires authentication and a permission', async () => {
    expectError(await request(app).get(`${base}/donors`), 401);
    expectError(await request(app).get(`${base}/donors`).set('Authorization', `Bearer ${volunteer.token}`), 403);
  });

  it('lets the ED read but not record money', async () => {
    expectSuccess(await request(app).get(`${base}/donations`).set('Authorization', `Bearer ${ed.token}`));
    expectError(
      await request(app).post(`${base}/donations`).set('Authorization', `Bearer ${ed.token}`).send(gift()),
      403
    );
  });

  // --- money at the boundary ------------------------------------------------
  it('stores rands as integer cents', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    expect(created.amountCents).toBe(25050);

    const stored = await Donation.findById(created._id);
    expect(Number.isInteger(stored.amountCents)).toBe(true);
  });

  it('parses a South African formatted amount', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift({ amount: 'R1 234,56' })), 201);
    expect(created.amountCents).toBe(123456);
  });

  it('takes the exact value from a string a float would have lost', async () => {
    // 1.005 is already 1.00499999999999989 as a double; a string is exact.
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift({ amount: '1.005' })), 201);
    expect(created.amountCents).toBe(101);
  });

  it('rejects an unparseable or zero amount', async () => {
    expectError(await asFinance('post', `${base}/donations`).send(gift({ amount: 'lots' })), 422);
    expectError(await asFinance('post', `${base}/donations`).send(gift({ amount: '0' })), 422);
  });

  it('converts a campaign target too', async () => {
    expect(campaign.targetCents).toBe(5_000_000);
    expect(campaign.raisedCents).toBe(0);
    expect(campaign.progressPercent).toBe(0);
  });

  // --- donation type, donor message and campaign image ----------------------
  it('records the donation type and the donor’s own message', async () => {
    const created = expectSuccess(
      await asFinance('post', `${base}/donations`).send(
        gift({ donationType: 'RECURRING', message: 'In memory of my mother.' })
      ),
      201
    );
    expect(created.donationType).toBe('RECURRING');
    expect(created.message).toBe('In memory of my mother.');
  });

  it('defaults a donation to one-time', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    expect(created.donationType).toBe('ONE_TIME');
  });

  it('accepts an https campaign image and refuses a plaintext one', async () => {
    const asComms = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${comms.token}`);

    const ok = expectSuccess(
      await asComms('patch', `${base}/campaigns/${campaign._id}`).send({
        featuredImage: 'https://res.cloudinary.com/nwhr/image/upload/winter.jpg',
      })
    );
    expect(ok.featuredImage).toMatch(/^https:\/\//);

    expectError(
      await asComms('patch', `${base}/campaigns/${campaign._id}`).send({
        featuredImage: 'http://insecure.example/winter.jpg',
      }),
      422,
      'VALIDATION_FAILED'
    );
  });

  // --- notifications on settlement ------------------------------------------
  it('tells the people who watch income when a donation settles', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    const alerts = await Notification.find({ type: 'DONATION' });
    const recipients = alerts.map((n) => String(n.userId));
    expect(recipients).toContain(String(ed.user._id));
    expect(recipients).toContain(String(finance.user._id));
    // A volunteer holds no donation:read and must not see income move.
    expect(recipients).not.toContain(String(volunteer.user._id));

    expect(alerts[0].title).toBe('New Donation Received');
    // formatZAR renders the South African convention — 'R 250,50', not 'R250.50'.
    expect(alerts[0].message).toContain(formatZAR(25050, { plain: true }));
    expect(alerts[0].message).toContain('Acme Trust');
    expect(alerts[0].message).toContain('Winter Appeal 2026');
    expect(String(alerts[0].referenceId)).toBe(String(created._id));
  });

  it('does not re-alert when a gateway retries settlement', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    // One alert per recipient, not three.
    const perRecipient = await Notification.countDocuments({ type: 'DONATION', userId: ed.user._id });
    expect(perRecipient).toBe(1);
  });

  it('does not name a donor who asked to stay anonymous', async () => {
    const shy = expectSuccess(
      await asFinance('post', `${base}/donors`).send({
        name: 'Discreet Benefactor', type: 'INDIVIDUAL', isAnonymous: true,
      }),
      201
    );
    const created = expectSuccess(
      await asFinance('post', `${base}/donations`).send(gift({ donor: shy._id })),
      201
    );
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    const alert = await Notification.findOne({ type: 'DONATION' });
    expect(alert.message).toContain('an anonymous donor');
    expect(alert.message).not.toContain('Discreet Benefactor');
  });

  // --- settlement is idempotent ---------------------------------------------
  it('settles once and moves every total exactly once', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    expect(created.status).toBe('PENDING');

    const settled = expectSuccess(await asFinance('post', `${base}/donations/${created._id}/settle`).send({}));
    expect(settled.status).toBe('SETTLED');
    expect(settled.receiptNumber).toMatch(/^S18A-\d{4}-/);

    expect((await Campaign.findById(campaign._id)).raisedCents).toBe(25050);
    expect((await Donor.findById(donor._id)).totalGivenCents).toBe(25050);
  });

  it('does not double-count when a gateway retries settlement', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);

    // Paystack retries; this is the ordinary case, not an edge case.
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    expect((await Campaign.findById(campaign._id)).raisedCents).toBe(25050);
    expect((await Donor.findById(donor._id)).totalGivenCents).toBe(25050);
  });

  it('holds under concurrent settlement of the same donation', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    await Promise.all(
      Array.from({ length: 5 }, () => asFinance('post', `${base}/donations/${created._id}/settle`).send({}))
    );
    // The conditional update on status: PENDING is what makes only one caller apply totals.
    expect((await Campaign.findById(campaign._id)).raisedCents).toBe(25050);
  });

  it('refuses a second donation carrying the same provider reference', async () => {
    expectSuccess(await asFinance('post', `${base}/donations`).send(gift({ providerReference: 'PF-99887' })), 201);
    const res = await asFinance('post', `${base}/donations`).send(gift({ providerReference: 'PF-99887' }));
    expectError(res, 409);
    expect(res.body.error.message).toMatch(/provider reference/i);
  });

  it('allows many donations without a provider reference', async () => {
    expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    expect(await Donation.countDocuments({})).toBe(2);
  });

  // --- refund ---------------------------------------------------------------
  it('refunds by reversal, keeping the row and unwinding the totals', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    expectError(await asFinance('post', `${base}/donations/${created._id}/refund`).send({}), 422);

    const refunded = expectSuccess(
      await asFinance('post', `${base}/donations/${created._id}/refund`).send({ reason: 'Donor requested' })
    );
    expect(refunded.status).toBe('REFUNDED');
    // Deleting money that was once reported would leave a total nobody could reconcile.
    expect(await Donation.countDocuments({ _id: created._id })).toBe(1);
    expect((await Campaign.findById(campaign._id)).raisedCents).toBe(0);
    expect((await Donor.findById(donor._id)).totalGivenCents).toBe(0);
  });

  it('will not settle a refunded donation or refund a pending one', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    expectError(await asFinance('post', `${base}/donations/${created._id}/refund`).send({ reason: 'x' }), 409);

    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    await asFinance('post', `${base}/donations/${created._id}/refund`).send({ reason: 'x' });
    expectError(await asFinance('post', `${base}/donations/${created._id}/settle`).send({}), 409);
  });

  // --- pledges --------------------------------------------------------------
  it('tracks fulfilment against a pledge', async () => {
    const pledge = expectSuccess(
      await asFinance('post', `${base}/pledges`).send({ donor: donor._id, campaign: campaign._id, amount: '500.00' }),
      201
    );
    expect(pledge.amountCents).toBe(50000);
    expect(pledge.outstandingCents).toBe(50000);

    const part = expectSuccess(
      await asFinance('post', `${base}/donations`).send(gift({ amount: '200.00', pledge: pledge._id })),
      201
    );
    await asFinance('post', `${base}/donations/${part._id}/settle`).send({});

    let stored = await Pledge.findById(pledge._id);
    expect(stored.fulfilledCents).toBe(20000);
    expect(stored.status).toBe('PARTIALLY_FULFILLED');

    const rest = expectSuccess(
      await asFinance('post', `${base}/donations`).send(gift({ amount: '300.00', pledge: pledge._id })),
      201
    );
    await asFinance('post', `${base}/donations/${rest._id}/settle`).send({});

    stored = await Pledge.findById(pledge._id);
    expect(stored.fulfilledCents).toBe(50000);
    expect(stored.status).toBe('FULFILLED');
    expect(stored.outstandingCents).toBe(0);
  });

  // --- derived fields cannot be asserted ------------------------------------
  it('will not let raised or given totals be written directly', async () => {
    await request(app).patch(`${base}/campaigns/${campaign._id}`).set('Authorization', `Bearer ${comms.token}`)
      .send({ raisedCents: 999_999, description: 'Updated' });
    expect((await Campaign.findById(campaign._id)).raisedCents).toBe(0);

    await asFinance('patch', `${base}/donors/${donor._id}`).send({ totalGivenCents: 999_999, notes: 'x' });
    expect((await Donor.findById(donor._id)).totalGivenCents).toBe(0);
  });

  it('reconciles a campaign total against its donations', async () => {
    const created = expectSuccess(await asFinance('post', `${base}/donations`).send(gift()), 201);
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    const totals = expectSuccess(await asFinance('get', `${base}/campaigns/${campaign._id}/totals`));
    expect(totals.raisedCents).toBe(25050);
    expect(totals.actualCents).toBe(25050);
    expect(totals.reconciled).toBe(true);
    expect(totals.donationCount).toBe(1);
  });

  it('counts only settled money towards a campaign', async () => {
    await asFinance('post', `${base}/donations`).send(gift());
    const totals = expectSuccess(await asFinance('get', `${base}/campaigns/${campaign._id}/totals`));
    expect(totals.actualCents).toBe(0);
  });

  // --- donor privacy --------------------------------------------------------
  it('never returns a tax number', async () => {
    const listed = expectSuccess(await asFinance('get', `${base}/donors`));
    expect(JSON.stringify(listed)).not.toContain('9012345678');

    const one = expectSuccess(await asFinance('get', `${base}/donors/${donor._id}`));
    expect(one.taxNumber).toBeUndefined();
  });

  it('records an anonymous gift with no donor at all', async () => {
    const created = expectSuccess(
      await asFinance('post', `${base}/donations`).send({ amount: '50.00', method: 'CASH' }),
      201
    );
    expect(created.donor).toBeNull();
    expect(created.amountCents).toBe(5000);
  });

  it('rejects a duplicate campaign name', async () => {
    expectError(
      await request(app).post(`${base}/campaigns`).set('Authorization', `Bearer ${comms.token}`)
        .send({ name: 'Winter Appeal 2026' }),
      409
    );
  });
});

describe.runIf(hasDb)('donation receipts', () => {
  let finance; let donorWithEmail; let anonDonor;

  beforeEach(async () => {
    await resetDatabase();
    await Donation.syncIndexes();
    finance = await makeUser(ROLES.FINANCE_OFFICER);

    donorWithEmail = expectSuccess(
      await request(app).post(`${base}/donors`).set('Authorization', `Bearer ${finance.token}`)
        .send({ name: 'Thandi Nkosi', type: 'INDIVIDUAL', email: 'thandi@example.co.za', taxNumber: '9012345678' }),
      201
    );
    anonDonor = expectSuccess(
      await request(app).post(`${base}/donors`).set('Authorization', `Bearer ${finance.token}`)
        .send({ name: 'No Address Trust', type: 'TRUST' }),
      201
    );
  });
  afterAll(disconnect);

  const asFinance = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${finance.token}`);
  const give = (over = {}) =>
    asFinance('post', `${base}/donations`).send({ amount: '750.00', method: 'EFT', ...over });

  it('issues a receipt number and emails it once the donation settles', async () => {
    const created = expectSuccess(await give({ donor: donorWithEmail._id }), 201);
    expect(created.receiptNumber).toBeNull();
    expect(created.receiptEmailedAt).toBeNull();

    const settled = expectSuccess(await asFinance('post', `${base}/donations/${created._id}/settle`).send({}));
    expect(settled.receiptNumber).toMatch(/^S18A-\d{4}-/);
    expect(settled.receiptEmailedAt).not.toBeNull();
  });

  it('records the receipt in the audit trail without the donor address', async () => {
    const created = expectSuccess(await give({ donor: donorWithEmail._id }), 201);
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
    const entry = await AuditLog.findOne({ action: 'donation.receipt_sent' });
    expect(entry).not.toBeNull();
    expect(entry.meta.receiptNumber).toMatch(/^S18A-/);
    expect(JSON.stringify(entry)).not.toContain('thandi@example.co.za');
  });

  it('does not email again when a gateway retries settlement', async () => {
    const created = expectSuccess(await give({ donor: donorWithEmail._id }), 201);
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    const first = (await Donation.findById(created._id)).receiptEmailedAt;

    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});
    await asFinance('post', `${base}/donations/${created._id}/settle`).send({});

    const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
    expect(await AuditLog.countDocuments({ action: 'donation.receipt_sent' })).toBe(1);
    expect((await Donation.findById(created._id)).receiptEmailedAt).toEqual(first);
  });

  it('settles an anonymous gift without a receipt, and does not invent one', async () => {
    const created = expectSuccess(await give(), 201);
    const settled = expectSuccess(await asFinance('post', `${base}/donations/${created._id}/settle`).send({}));
    // A cash tin at an event has nobody to write to — that is not a failure.
    expect(settled.status).toBe('SETTLED');
    expect(settled.receiptEmailedAt).toBeNull();
  });

  it('settles even when the donor has no email address', async () => {
    const created = expectSuccess(await give({ donor: anonDonor._id }), 201);
    const settled = expectSuccess(await asFinance('post', `${base}/donations/${created._id}/settle`).send({}));
    // The money is banked whether or not the receipt could be delivered.
    expect(settled.status).toBe('SETTLED');
    expect(settled.receiptEmailedAt).toBeNull();
  });

  it('re-sends a receipt without issuing a new number', async () => {
    const created = expectSuccess(await give({ donor: donorWithEmail._id }), 201);
    const settled = expectSuccess(await asFinance('post', `${base}/donations/${created._id}/settle`).send({}));

    const resent = expectSuccess(await asFinance('post', `${base}/donations/${created._id}/receipt/resend`).send({}));
    // A second certificate with a new number is one a donor could claim against twice.
    expect(resent.receiptNumber).toBe(settled.receiptNumber);
    expect(new Date(resent.receiptEmailedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(settled.receiptEmailedAt).getTime()
    );
  });

  it('refuses to send a receipt before settlement or for an anonymous gift', async () => {
    const pending = expectSuccess(await give({ donor: donorWithEmail._id }), 201);
    expectError(await asFinance('post', `${base}/donations/${pending._id}/receipt/resend`).send({}), 409);

    const anon = expectSuccess(await give(), 201);
    await asFinance('post', `${base}/donations/${anon._id}/settle`).send({});
    expectError(await asFinance('post', `${base}/donations/${anon._id}/receipt/resend`).send({}), 409);
  });
});
