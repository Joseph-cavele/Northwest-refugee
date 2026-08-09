import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { toCents, addCents, formatZAR } from '../../utils/money.js';
import { reference } from '../../utils/reference.js';
import logger from '../../config/logger.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { sendDonationReceiptEmail } from '../notifications/email.service.js';
import * as notifications from '../notifications/notification.service.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import {
  Donor, Campaign, Pledge, Donation, COUNTS_TOWARDS_TOTALS,
} from './fundraising.model.js';

// Fundraising is not scoped to a caseload — a donor belongs to the organisation, not to a
// programme — so access here is settled entirely by the permission on the route.
//
// Rands arrive from the schema; every value is converted with toCents() before it touches
// a model, and nothing below stores a fractional amount.

const live = (filter = {}, includeDeleted = false) =>
  includeDeleted ? filter : { ...filter, deletedAt: null };

// --- donors ---------------------------------------------------------------------------

export async function createDonor(data, actor, ctx = {}) {
  const doc = await Donor.create({ ...data, capturedBy: actor._id });

  await audit.record({
    actor,
    action: ACTIONS.DONOR_CREATED,
    targetType: 'Donor',
    targetId: doc._id,
    ctx,
    // Type and reference only. A donor's name and tax number are personal information and
    // the trail is read by more people than the record is.
    meta: { reference: doc.reference, type: doc.type, isAnonymous: doc.isAnonymous },
  });

  return doc;
}

export async function listDonors(query = {}, actor) {
  const { page, limit, sort, type, search, includeDeleted } = query;
  void actor;

  const filter = {};
  if (type) filter.type = type;
  if (search) filter.$text = { $search: search };

  return paginateQuery(Donor, live(filter, includeDeleted), { page, limit, sort });
}

export async function getDonorById(id, { withTaxNumber = false } = {}) {
  const query = Donor.findOne(live({ _id: id }));
  // Needed only when a s18A certificate is actually being produced.
  if (withTaxNumber) query.select('+taxNumber');

  const doc = await query.exec();
  if (!doc) throw AppError.notFound('Donor');
  return doc;
}

export async function updateDonor(id, patch, actor, ctx = {}) {
  const doc = await getDonorById(id);

  const { totalGivenCents, lastGiftAt, capturedBy, ...safe } = patch;
  // Derived from settled donations — a giving history that can be typed in is not one.
  void totalGivenCents;
  void lastGiftAt;
  void capturedBy;

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.DONOR_UPDATED,
    targetType: 'Donor',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(safe) },
  });

  return doc;
}

// --- campaigns ------------------------------------------------------------------------

export async function createCampaign(data, actor, ctx = {}) {
  const { target, ...rest } = data;

  let doc;
  try {
    doc = await Campaign.create({
      ...rest,
      targetCents: target === undefined ? 0 : toCents(target),
      capturedBy: actor._id,
    });
  } catch (err) {
    if (err?.code === 11000) throw AppError.conflict('A campaign with that name already exists');
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.CAMPAIGN_CREATED,
    targetType: 'Campaign',
    targetId: doc._id,
    ctx,
    meta: { name: doc.name, targetCents: doc.targetCents },
  });

  return doc;
}

export async function listCampaigns(query = {}) {
  const { page, limit, sort, status, pillar, openOnly } = query;

  const filter = {};
  if (status) filter.status = status;
  if (pillar) filter.pillar = pillar;
  if (openOnly) {
    filter.status = status ?? 'ACTIVE';
    filter.$or = [{ endsAt: null }, { endsAt: { $gte: new Date() } }];
  }

  return paginateQuery(Campaign, live(filter), { page, limit, sort });
}

export async function getCampaignById(id) {
  const doc = await Campaign.findOne(live({ _id: id })).exec();
  if (!doc) throw AppError.notFound('Campaign');
  return doc;
}

export async function updateCampaign(id, patch, actor, ctx = {}) {
  const doc = await getCampaignById(id);

  const { target, raisedCents, capturedBy, ...safe } = patch;
  // Raised is the sum of settled donations. Writing it directly would let a campaign
  // report money that never arrived.
  void raisedCents;
  void capturedBy;
  if (target !== undefined) safe.targetCents = toCents(target);

  doc.set(safe);
  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) throw AppError.conflict('A campaign with that name already exists');
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.CAMPAIGN_UPDATED,
    targetType: 'Campaign',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(safe), status: doc.status },
  });

  return doc;
}

// --- pledges --------------------------------------------------------------------------

export async function createPledge(data, actor, ctx = {}) {
  const { amount, campaign, ...rest } = data;

  const donor = await getDonorById(data.donor);
  if (campaign) await getCampaignById(campaign);

  const doc = await Pledge.create({
    ...rest,
    donor: donor._id,
    campaign: campaign ?? null,
    amountCents: toCents(amount),
    capturedBy: actor._id,
  });

  await audit.record({
    actor,
    action: ACTIONS.PLEDGE_CREATED,
    targetType: 'Pledge',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, donor: String(donor._id), amountCents: doc.amountCents },
  });

  return doc;
}

export async function listPledges(query = {}) {
  const { page, limit, sort, donor, campaign, status, overdue } = query;

  const filter = {};
  if (donor) filter.donor = donor;
  if (campaign) filter.campaign = campaign;
  if (status) filter.status = status;
  if (overdue) {
    filter.dueAt = { $lt: new Date() };
    filter.status = status ?? { $in: ['PROMISED', 'PARTIALLY_FULFILLED'] };
  }

  return paginateQuery(Pledge, live(filter), {
    page,
    limit,
    sort,
    populate: { path: 'donor', select: 'reference name type isAnonymous' },
  });
}

export async function getPledgeById(id) {
  const doc = await Pledge.findOne(live({ _id: id })).exec();
  if (!doc) throw AppError.notFound('Pledge');
  return doc;
}

export async function updatePledge(id, patch, actor, ctx = {}) {
  const doc = await getPledgeById(id);
  if (['FULFILLED', 'CANCELLED'].includes(doc.status) && patch.status) {
    throw AppError.conflict(`A ${doc.status.toLowerCase()} pledge can no longer change status`);
  }

  const { amountCents, fulfilledCents, donor, ...safe } = patch;
  // The promised amount is the promise; fulfilment is derived from donations.
  void amountCents;
  void fulfilledCents;
  void donor;

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.PLEDGE_UPDATED,
    targetType: 'Pledge',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(safe), status: doc.status },
  });

  return doc;
}

// --- donations ------------------------------------------------------------------------

export async function recordDonation(data, actor, ctx = {}) {
  const { amount, donor, campaign, pledge, ...rest } = data;

  if (donor) await getDonorById(donor);
  if (campaign) await getCampaignById(campaign);
  if (pledge) await getPledgeById(pledge);

  let doc;
  try {
    doc = await Donation.create({
      ...rest,
      donor: donor ?? null,
      campaign: campaign ?? null,
      pledge: pledge ?? null,
      amountCents: toCents(amount),
      capturedBy: actor._id,
    });
  } catch (err) {
    if (err?.code === 11000) {
      // The unique index on providerReference caught a gift the gateway already told us
      // about. Not an error worth failing loudly over — it is the protection working.
      throw AppError.conflict('A donation with that provider reference has already been recorded');
    }
    throw err;
  }

  await audit.record({
    actor,
    action: ACTIONS.DONATION_RECORDED,
    targetType: 'Donation',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, amountCents: doc.amountCents, method: doc.method, status: doc.status },
  });

  return doc;
}

/**
 * Mark a donation as settled and roll it into every total that depends on it.
 *
 * IDEMPOTENT. Paystack retries its notifications, so this is called more
 * than once for the same money as a matter of course. The guard is a conditional update
 * on `status: 'PENDING'` — only the caller whose update actually matched goes on to move
 * any totals, so a replay changes nothing rather than double-counting.
 */
export async function settleDonation(id, { providerReference, settledAt } = {}, actor, ctx = {}) {
  const donation = await Donation.findOne(live({ _id: id })).exec();
  if (!donation) throw AppError.notFound('Donation');
  if (donation.status === 'REFUNDED') throw AppError.conflict('A refunded donation cannot be settled');
  if (donation.status === 'FAILED') throw AppError.conflict('A failed donation cannot be settled');

  const claimed = await Donation.findOneAndUpdate(
    { _id: donation._id, status: 'PENDING' },
    {
      $set: {
        status: 'SETTLED',
        settledAt: settledAt ?? new Date(),
        receiptNumber: donation.receiptNumber ?? reference('S18A'),
        ...(providerReference ? { providerReference } : {}),
      },
    },
    { returnDocument: 'after' }
  ).exec();

  // Someone else settled it first — return the record unchanged rather than adding the
  // amount to the campaign a second time. The receipt was already sent by that caller,
  // so a retry must not email the donor again either.
  if (!claimed) return Donation.findById(donation._id).exec();

  await applySettlementTotals(claimed);

  await audit.record({
    actor,
    action: ACTIONS.DONATION_SETTLED,
    targetType: 'Donation',
    targetId: claimed._id,
    ctx,
    meta: { reference: claimed.reference, amountCents: claimed.amountCents, receiptNumber: claimed.receiptNumber },
  });

  // Inside the `claimed` branch, so a gateway retry never re-alerts anyone. Best-effort,
  // like the receipt below.
  await notifyDonationSettled(claimed);

  // The money is banked and the totals are moved. A mail provider outage must not undo
  // any of that, so the send is best-effort and its outcome is recorded on the donation
  // rather than thrown — receiptEmailedAt is what answers "did they get their receipt?".
  await issueReceipt(claimed, actor, ctx);

  return Donation.findById(claimed._id).exec();
}

/**
 * Tell the people who watch income that money has arrived.
 *
 * Addressed by `donation:read` rather than to the Executive Director by name — that
 * permission IS the definition of "may see donations", and hard-coding a role here would
 * leave the alert pointing at the wrong people the moment the matrix is re-tuned. Today it
 * reaches the ED, the Finance Officer and the Comms Officer.
 *
 * The donor gets the receipt email instead of an in-app notification: donors have no login
 * in this system, by design — see the note at the top of users/user.model.js.
 *
 * An anonymous donor is described as "an anonymous donor", never named. `isAnonymous` is a
 * promise the organisation made about how the gift would be reported, and a notification
 * naming them would break it on the one screen the whole office reads.
 */
async function notifyDonationSettled(donation) {
  try {
    const [donor, campaign] = await Promise.all([
      donation.donor ? Donor.findById(donation.donor).select('name isAnonymous').lean() : null,
      donation.campaign ? Campaign.findById(donation.campaign).select('name').lean() : null,
    ]);

    const amount = formatZAR(donation.amountCents, { plain: true });
    const from = !donor || donor.isAnonymous ? 'an anonymous donor' : donor.name;
    const towards = campaign ? ` for the ${campaign.name}` : '';

    await notifications.notifyPermission(PERMISSIONS.DONATION_READ, {
      title: 'New Donation Received',
      message:
        `A donation of ${amount} has been received from ${from}${towards}. ` +
        'Review the donation details in the dashboard.',
      type: 'DONATION',
      referenceId: donation._id,
      priority: 'MEDIUM',
    });
  } catch (err) {
    // Never rethrow: the money is already banked and the totals already moved.
    logger.error({ err, donation: String(donation._id) }, 'donation notification failed');
  }
}

/**
 * Email the receipt for a settled donation and record whether it went.
 *
 * Anonymous gifts have no donor and no address, which is not a failure — a cash tin at an
 * event has nobody to write to.
 */
async function issueReceipt(donation, actor, ctx = {}) {
  if (!donation.donor) return { sent: false, reason: 'anonymous' };

  try {
    // The tax number is select:false and is required on a s18A certificate.
    const donor = await getDonorById(donation.donor, { withTaxNumber: true });
    const result = await sendDonationReceiptEmail(donation, donor);

    if (result.sent) {
      await Donation.updateOne({ _id: donation._id }, { $set: { receiptEmailedAt: new Date() } }).exec();
      await audit.record({
        actor,
        action: ACTIONS.DONATION_RECEIPT_SENT,
        targetType: 'Donation',
        targetId: donation._id,
        ctx,
        // No address in the trail — the fact of sending is the audit fact.
        meta: {
          reference: donation.reference,
          receiptNumber: donation.receiptNumber,
          isTaxCertificate: result.isTaxCertificate,
        },
      });
    }
    return result;
  } catch (err) {
    logger.error(
      { err, donation: String(donation._id), receipt: donation.receiptNumber },
      'failed to send donation receipt — donation is settled and can be resent'
    );
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * Re-send a receipt a donor never received or has lost. Deliberately does not re-issue
 * the receipt number: a second certificate with a new number for the same donation is a
 * duplicate a donor could claim against twice.
 */
export async function resendReceipt(id, actor, ctx = {}) {
  const donation = await Donation.findOne(live({ _id: id })).exec();
  if (!donation) throw AppError.notFound('Donation');
  if (donation.status !== 'SETTLED') {
    throw AppError.conflict('A receipt is only issued once a donation has settled');
  }
  if (!donation.donor) {
    throw AppError.conflict('This donation is anonymous — there is nobody to send a receipt to');
  }

  const result = await issueReceipt(donation, actor, ctx);
  if (!result.sent) {
    throw AppError.internal('The receipt could not be sent — check the donor has an email address');
  }

  return Donation.findById(donation._id).exec();
}

/** Roll a settled donation into the donor, campaign and pledge totals. */
async function applySettlementTotals(donation) {
  const { amountCents } = donation;

  if (donation.donor) {
    await Donor.updateOne(
      { _id: donation.donor },
      { $inc: { totalGivenCents: amountCents }, $max: { lastGiftAt: donation.settledAt } }
    ).exec();
  }

  if (donation.campaign) {
    await Campaign.updateOne({ _id: donation.campaign }, { $inc: { raisedCents: amountCents } }).exec();
  }

  if (donation.pledge) {
    const pledge = await Pledge.findById(donation.pledge).exec();
    if (pledge) {
      pledge.fulfilledCents = addCents(pledge.fulfilledCents, amountCents);
      // A pledge is fulfilled once the promise is met — over-payment still counts as met,
      // not as more than met.
      pledge.status = pledge.fulfilledCents >= pledge.amountCents ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      await pledge.save().catch((err) =>
        logger.error({ err, pledge: String(pledge._id) }, 'failed to update pledge fulfilment')
      );
    }
  }
}

/**
 * Reverse a settled donation. The row is kept and marked REFUNDED — deleting money that
 * was once reported would leave a campaign total nobody could reconcile.
 */
export async function refundDonation(id, { reason }, actor, ctx = {}) {
  const donation = await Donation.findOne(live({ _id: id })).exec();
  if (!donation) throw AppError.notFound('Donation');
  if (donation.status !== 'SETTLED') {
    throw AppError.conflict('Only a settled donation can be refunded');
  }

  const claimed = await Donation.findOneAndUpdate(
    { _id: donation._id, status: 'SETTLED' },
    { $set: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason } },
    { returnDocument: 'after' }
  ).exec();
  if (!claimed) throw AppError.conflict('Donation is no longer settled');

  // Unwind exactly what settlement added.
  if (claimed.donor) {
    await Donor.updateOne({ _id: claimed.donor }, { $inc: { totalGivenCents: -claimed.amountCents } }).exec();
  }
  if (claimed.campaign) {
    await Campaign.updateOne({ _id: claimed.campaign }, { $inc: { raisedCents: -claimed.amountCents } }).exec();
  }
  if (claimed.pledge) {
    const pledge = await Pledge.findById(claimed.pledge).exec();
    if (pledge) {
      pledge.fulfilledCents = Math.max(0, pledge.fulfilledCents - claimed.amountCents);
      pledge.status = pledge.fulfilledCents === 0
        ? 'PROMISED'
        : pledge.fulfilledCents >= pledge.amountCents ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      await pledge.save();
    }
  }

  await audit.record({
    actor,
    action: ACTIONS.DONATION_REFUNDED,
    targetType: 'Donation',
    targetId: claimed._id,
    ctx,
    meta: { reference: claimed.reference, amountCents: claimed.amountCents, reason },
  });

  return claimed;
}

export async function listDonations(query = {}) {
  const { page, limit, sort, donor, campaign, status, method, from, to, includeDeleted } = query;

  const filter = {};
  if (donor) filter.donor = donor;
  if (campaign) filter.campaign = campaign;
  if (status) filter.status = status;
  if (method) filter.method = method;
  if (from || to) {
    filter.receivedAt = {};
    if (from) filter.receivedAt.$gte = from;
    if (to) filter.receivedAt.$lte = to;
  }

  return paginateQuery(Donation, live(filter, includeDeleted), {
    page,
    limit,
    sort,
    populate: { path: 'donor', select: 'reference name type isAnonymous' },
  });
}

export async function getDonationById(id) {
  const doc = await Donation.findOne(live({ _id: id })).exec();
  if (!doc) throw AppError.notFound('Donation');
  return doc;
}

/**
 * Look a donation up by OUR reference — the one handed to the gateway when the payment
 * was started, and the one it quotes back in its webhook.
 *
 * Returns null rather than throwing: a webhook naming an unknown reference is a normal
 * event (another integration on the same Paystack account, or a replay of something long
 * deleted) and must be acknowledged, not turned into a 500 that triggers endless retries.
 */
export function findDonationByReference(reference) {
  return Donation.findOne(live({ reference })).exec();
}

/** Campaign totals from the donations themselves, for reconciling the denormalised field. */
export async function getCampaignTotals(id) {
  const campaign = await getCampaignById(id);

  const settled = await Donation.find({
    campaign: campaign._id,
    status: { $in: COUNTS_TOWARDS_TOTALS },
    deletedAt: null,
  })
    .select('amountCents')
    .exec();

  const actualCents = settled.reduce((total, d) => addCents(total, d.amountCents), 0);

  return {
    campaign: campaign._id,
    targetCents: campaign.targetCents,
    raisedCents: campaign.raisedCents,
    // If these disagree, the denormalised counter has drifted and needs investigating —
    // surfacing it is the point.
    actualCents,
    reconciled: actualCents === campaign.raisedCents,
    donationCount: settled.length,
    progressPercent: campaign.progressPercent,
  };
}
