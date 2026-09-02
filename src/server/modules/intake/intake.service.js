import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { normalisePhone } from '../../utils/phone.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import Beneficiary from '../beneficiaries/beneficiary.model.js';
import { attachSelfScreening } from '../screening/screening.service.js';
import logger from '../../config/logger.js';
import { Intake, OPEN_INTAKE_STATUS } from './intake.model.js';

const log = logger.child({ module: 'intake.service' });

/*
 * Applications, before anybody has decided anything about them.
 *
 * The rule this module exists to keep: nothing in here writes to the register. An intake is
 * created, screened, and either linked to a Beneficiary by the screening service or left as
 * a record of somebody NWHR did not take on. `createBeneficiary` is not imported here on
 * purpose — the approval path lives in one place, next to the decision that authorises it.
 */

function openFilter() {
  return { status: { $in: OPEN_INTAKE_STATUS }, deletedAt: null };
}

async function findIntakeOrFail(id) {
  const doc = await Intake.findOne({ _id: id, deletedAt: null }).exec();
  if (!doc) throw AppError.notFound('Intake');
  return doc;
}

// --- duplicate detection ---------------------------------------------------------------

/**
 * People on the register who might already be this applicant.
 *
 * CANDIDATES, NOT ANSWERS. Every strategy below produces false positives — two cousins share
 * a surname and a birthday, a household shares one phone, an internet café shares an email —
 * so this returns a ranked list for a human to look at and never merges anything itself. The
 * officer confirms, and `linkToBeneficiary` records that they did.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. A duplicate register record is not an untidy database:
 * it is a person whose case history is split in half, so the caseworker reading one half
 * makes a decision without the other. It is also two rows in the count a funder is shown.
 *
 * THE STRATEGIES ARE ORDERED BY HOW MUCH THEY PROVE:
 *
 *   phone            strong. A cellphone number is the closest thing this population has to
 *                    a stable identifier, and it is what the WhatsApp bot keys on.
 *   email            strong where present, which is a minority of records.
 *   name + birthday  weaker, and the one that needs a human. Common surnames are common.
 *   name alone       weakest, offered only when there is nothing else to go on, because an
 *                    applicant with no phone and no birthday is exactly the person most
 *                    likely to be re-registered by accident.
 *
 * NOT SEARCHED: the permit number. It is encrypted with a blind index and reachable only
 * behind `beneficiary:read_sensitive` plus an audit entry — a duplicate check at the front
 * desk is not a lawful reason to touch it, and doing so would write an audit trail implying
 * somebody read a document they never saw.
 */
export async function findPossibleDuplicates({ firstName, lastName, dateOfBirth, contact } = {}) {
  const or = [];
  const phone = contact?.cellphone ? normalisePhone(contact.cellphone) : null;
  const email = contact?.email ? String(contact.email).trim().toLowerCase() : null;

  if (phone) or.push({ 'contact.cellphone': phone });
  if (email) or.push({ 'contact.email': email });

  const nameFilter = {};
  if (firstName) nameFilter.firstName = new RegExp(`^${escapeRegex(firstName.trim())}$`, 'i');
  if (lastName) nameFilter.lastName = new RegExp(`^${escapeRegex(lastName.trim())}$`, 'i');

  if (dateOfBirth && (nameFilter.firstName || nameFilter.lastName)) {
    const day = new Date(dateOfBirth);
    if (!Number.isNaN(day.getTime())) {
      // The whole day, because a date stored at midnight local and one at midnight UTC are
      // the same birthday to a person and two different instants to Mongo.
      const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
      const end = new Date(start.getTime() + 86_400_000);
      or.push({ ...nameFilter, dateOfBirth: { $gte: start, $lt: end } });
    }
  } else if (nameFilter.firstName && nameFilter.lastName) {
    or.push(nameFilter);
  }

  if (or.length === 0) return [];

  /*
   * `.select()` names what a duplicate check needs to show and nothing else. The register
   * carries vulnerability flags and permit details that are `select: false` anyway, but an
   * explicit list is what stops a later field being included by accident on a screen that
   * exists to be looked at quickly by whoever is at the desk.
   */
  const matches = await Beneficiary.find({ $or: or, deletedAt: null })
    .select('referenceCode firstName lastName dateOfBirth nationality status contact.cellphone createdAt')
    .limit(10)
    .lean()
    .exec();

  // Strongest evidence first, so the row an officer should look at hardest is at the top.
  return matches.map((match) => ({
    ...match,
    matchedOn: [
      phone && match.contact?.cellphone === phone ? 'phone' : null,
      email ? 'email' : null,
      dateOfBirth ? 'name and date of birth' : 'name',
    ].filter(Boolean),
  }));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- creating ----------------------------------------------------------------------------

export async function createWalkInIntake(data, actor, ctx = {}) {
  const doc = await Intake.create({
    ...data,
    contact: {
      ...data.contact,
      ...(data.contact?.cellphone ? { cellphone: normalisePhone(data.contact.cellphone) } : {}),
    },
    channel: data.source === 'REFERRAL' ? 'REFERRAL' : 'WALK_IN',
    capturedBy: actor._id,
    status: 'PENDING_SCREENING',
    consent: { ...data.consent, givenAt: new Date() },
  });

  await audit.record({
    actor,
    action: ACTIONS.INTAKE_CREATED,
    targetType: 'Intake',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, source: doc.source },
  });

  return doc;
}

/**
 * The public form at /get-help.
 *
 * NO ACTOR, because there is nobody signed in — the applicant is capturing their own
 * details. The service decides source, channel and status rather than believing the caller
 * about any of them, and the response carries the reference code and nothing else: anything
 * more would echo a person's own submission back over an unauthenticated channel to whoever
 * is holding the connection.
 */
export async function submitPublicIntake(data, ctx = {}) {
  const { arrivingBy, referredBy, notes, answers, ...fields } = data;

  /*
   * What the applicant said about how they are coming is kept as a note rather than trusted
   * as the source. Somebody who ticks "I will walk in" has still applied online — the source
   * is how the record reached NWHR, and mixing the two would put web applications in the
   * walk-in count.
   */
  const arrival =
    arrivingBy === 'REFERRAL'
      ? `Says they were referred${referredBy ? ` by ${referredBy}` : ''}.`
      : arrivingBy === 'WALK_IN'
        ? 'Says they will come in to the office.'
        : null;

  const doc = await Intake.create({
    ...fields,
    contact: {
      ...fields.contact,
      ...(fields.contact?.cellphone ? { cellphone: normalisePhone(fields.contact.cellphone) } : {}),
    },
    source: arrivingBy === 'REFERRAL' ? 'REFERRAL' : 'ONLINE',
    channel: 'WEB',
    referredBy: referredBy ?? '',
    notes: [arrival, notes].filter(Boolean).join('\n\n'),
    capturedBy: null,
    status: 'PENDING_SCREENING',
    // ONLINE_FORM, always. A visitor cannot assert how they consented; they ticked a box.
    consent: { ...data.consent, method: 'ONLINE_FORM', givenAt: new Date() },
  });

  await audit.record({
    actor: null,
    action: ACTIONS.INTAKE_CREATED,
    targetType: 'Intake',
    targetId: doc._id,
    ctx,
    meta: { reference: doc.reference, source: 'ONLINE' },
  });

  /*
   * THE APPLICANT'S OWN ANSWERS, ATTACHED AS A SCREENING THEY COMPLETED THEMSELVES.
   *
   * This is what makes /get-help a screening page rather than only an intake form: somebody
   * who names a programme answers that programme's questions once, at home, instead of
   * repeating them across a desk. A member of staff still decides — the screening arrives
   * populated and undecided.
   *
   * Deliberately best-effort. If the programme has no published form, or the attach fails,
   * the APPLICATION still stands: losing somebody's request for help because a form could
   * not be built is the worst outcome available here.
   */
  if (fields.requestedProgramme) {
    try {
      await attachSelfScreening({
        intake: doc._id,
        programme: fields.requestedProgramme,
        answers: answers ?? [],
      });
    } catch (error) {
      log.warn({ err: error, intake: String(doc._id) }, 'could not attach the self-screening');
    }
  }

  /*
   * `referenceCode`, not `reference`, and the mismatch with the field name is deliberate.
   * This is the public wire contract — the string a person writes on a slip of paper and
   * reads back at the desk — and /get-help has been returning it under that name since the
   * form existed. Renaming a field somebody has written down buys nothing.
   */
  return { referenceCode: doc.reference };
}

// --- reading -----------------------------------------------------------------------------

export async function listIntakes(query = {}) {
  const { page, limit, sort, status, source, openOnly, search, from, to } = query;

  const filter = openOnly ? openFilter() : { deletedAt: null };
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (search) {
    const term = escapeRegex(search);
    filter.$or = [
      { firstName: new RegExp(term, 'i') },
      { lastName: new RegExp(term, 'i') },
      { reference: new RegExp(`^${term}`, 'i') },
    ];
  }
  if (from || to) {
    filter.receivedAt = {};
    if (from) filter.receivedAt.$gte = new Date(from);
    if (to) filter.receivedAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }

  return paginateQuery(Intake, filter, {
    page,
    limit,
    sort: sort ?? '-receivedAt',
    populate: [
      { path: 'requestedProgramme', select: 'name pillar' },
      { path: 'linkedBeneficiary', select: 'referenceCode firstName lastName status' },
    ],
  });
}

export async function getIntakeById(id) {
  return findIntakeOrFail(id);
}

export async function updateIntake(id, patch, actor, ctx = {}) {
  const doc = await findIntakeOrFail(id);
  if (doc.linkedBeneficiary) {
    /*
     * Once linked, the register is the source of truth for this person's details. Editing
     * the intake afterwards produces two versions of a phone number with no rule about which
     * one is current — so corrections go to the beneficiary record, where they are audited
     * as changes to a real person's file.
     */
    throw AppError.conflict(
      'This intake is linked to a beneficiary — edit their register record instead'
    );
  }

  doc.set(patch);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.INTAKE_UPDATED,
    targetType: 'Intake',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(patch) },
  });

  return doc;
}

/**
 * Attach an intake to somebody already on the register, without screening them again.
 *
 * The path for a returning beneficiary: they are known, their record exists, and this
 * application is another chapter of it rather than a new person. Linking does NOT approve
 * anything — a returning beneficiary applying for a programme still gets screened for it.
 */
export async function linkToBeneficiary(id, beneficiaryId, actor, ctx = {}) {
  const doc = await findIntakeOrFail(id);
  if (doc.linkedBeneficiary) throw AppError.conflict('This intake is already linked');

  const beneficiary = await Beneficiary.findOne({ _id: beneficiaryId, deletedAt: null })
    .select('_id referenceCode')
    .lean()
    .exec();
  if (!beneficiary) throw AppError.notFound('Beneficiary');

  doc.linkedBeneficiary = beneficiary._id;
  doc.linkedAt = new Date();
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.INTAKE_LINKED,
    targetType: 'Intake',
    targetId: doc._id,
    ctx,
    // Who decided these were the same person, and which record they chose. This is the entry
    // somebody reads when a merge later turns out to have been wrong.
    meta: { beneficiary: String(beneficiary._id), referenceCode: beneficiary.referenceCode },
  });

  return doc;
}

/** The dashboard's intake counters, in one pass rather than four. */
export async function intakeCounts() {
  const [byStatus, bySource] = await Promise.all([
    Intake.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Intake.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$source', n: { $sum: 1 } } }]),
  ]);

  const tally = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return { byStatus: tally(byStatus), bySource: tally(bySource) };
}
