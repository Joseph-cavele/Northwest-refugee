import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import { normalisePhone } from '../../utils/phone.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import { Event, EventParticipant } from './event.model.js';

const SCOPE_FIELDS = { programmeField: 'programme', capturedByField: 'capturedBy' };

/** Programme/own-records scope, OR-ed with "you captured it" — as in cases and education. */
function scopedFilter(actor, filter = {}, { includeDeleted = false } = {}) {
  const base = includeDeleted ? { ...filter } : { ...filter, deletedAt: null };
  const scope = scopeToProgrammes(actor, {}, SCOPE_FIELDS);
  if (Object.keys(scope).length === 0) return base;
  return { ...base, $and: [{ $or: [scope, { capturedBy: actor._id }] }] };
}

async function findEventOrFail(id, actor) {
  const doc = await Event.findOne(scopedFilter(actor, { _id: id })).exec();
  if (!doc) throw AppError.notFound('Event');
  return doc;
}

// --- events -------------------------------------------------------------------------

export async function createEvent(data, actor, ctx = {}) {
  const doc = await Event.create({ ...data, capturedBy: actor._id });

  await audit.record({
    actor,
    action: ACTIONS.EVENT_CREATED,
    targetType: 'Event',
    targetId: doc._id,
    ctx,
    meta: { title: doc.title, type: doc.type, startsAt: doc.startsAt },
  });

  return doc;
}

export async function listEvents(query = {}, actor) {
  const {
    page, limit, sort, type, status, pillar, programme,
    upcomingOnly, from, to, search, includeDeleted,
  } = query;

  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (pillar) filter.pillar = pillar;
  if (programme) filter.programme = programme;
  if (search) filter.title = { $regex: search, $options: 'i' };

  if (upcomingOnly) {
    filter.startsAt = { $gte: new Date() };
    filter.status = status ?? { $in: ['PLANNED', 'CONFIRMED'] };
  } else if (from || to) {
    filter.startsAt = {};
    if (from) filter.startsAt.$gte = from;
    if (to) filter.startsAt.$lte = to;
  }

  return paginateQuery(Event, scopedFilter(actor, filter, { includeDeleted }), {
    page,
    limit,
    sort,
    populate: { path: 'organiser', select: 'name role' },
  });
}

export async function getEventById(id, actor) {
  return findEventOrFail(id, actor);
}

export async function updateEvent(id, patch, actor, ctx = {}) {
  const doc = await findEventOrFail(id, actor);
  if (doc.status === 'CANCELLED') throw AppError.conflict('A cancelled event cannot be edited');

  const { capturedBy, recordedAttendance, ...safe } = patch;
  void capturedBy;
  // Derived from the register, never set by a caller — otherwise a reported headcount
  // could be typed in without anyone actually being recorded.
  void recordedAttendance;

  doc.set(safe);
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.EVENT_UPDATED,
    targetType: 'Event',
    targetId: doc._id,
    ctx,
    meta: { fields: Object.keys(safe), status: doc.status },
  });

  return doc;
}

// --- participants -------------------------------------------------------------------

/**
 * Record a register.
 *
 * Two kinds of row, and the distinction is the point:
 *   - a known beneficiary, whose consent is already on their own record;
 *   - an anonymous count, which stores gender and age band and nothing else.
 *
 * A name or number is accepted only alongside an explicit consentToContact. Someone who
 * walked into a community hall has agreed to nothing, and an attendance register is not
 * a lawful basis for keeping their details.
 */
export async function recordParticipants(id, participants, actor, ctx = {}) {
  const event = await findEventOrFail(id, actor);
  if (event.status === 'CANCELLED') throw AppError.conflict('A cancelled event has no register');

  const rows = [];
  for (const row of participants) {
    const { beneficiary, contactName, contactPhone, consentToContact, ...rest } = row;

    // Belt and braces — the schema refuses this too, but the model layer is what makes it
    // impossible to reach by any other path.
    if ((contactName || contactPhone) && !consentToContact) {
      throw AppError.badRequest('Contact details require recorded consent to be contacted');
    }

    let beneficiaryId = null;
    if (beneficiary) {
      // Only against someone the actor is allowed to see.
      const person = await getBeneficiaryById(beneficiary, actor);
      beneficiaryId = person._id;
    }

    rows.push({
      ...rest,
      event: event._id,
      beneficiary: beneficiaryId,
      consentToContact: Boolean(consentToContact),
      contactName: consentToContact ? (contactName ?? null) : null,
      contactPhone: consentToContact && contactPhone ? normalisePhone(contactPhone) : null,
      recordedBy: actor._id,
      recordedAt: new Date(),
    });
  }

  // Known attendees upsert so a corrected register does not double-count them; anonymous
  // rows are plain inserts, because there is nothing to match them on.
  const known = rows.filter((r) => r.beneficiary !== null);
  const anonymous = rows.filter((r) => r.beneficiary === null);

  if (known.length > 0) {
    await EventParticipant.bulkWrite(
      known.map((r) => ({
        updateOne: { filter: { event: event._id, beneficiary: r.beneficiary }, update: { $set: r }, upsert: true },
      })),
      { ordered: false }
    );
  }
  if (anonymous.length > 0) await EventParticipant.insertMany(anonymous);

  // Recount rather than increment: a re-submitted register would otherwise inflate it.
  event.recordedAttendance = await EventParticipant.countDocuments({ event: event._id });
  if (event.status === 'PLANNED' || event.status === 'CONFIRMED') {
    if (event.isPast) event.status = 'COMPLETED';
  }
  await event.save();

  await audit.record({
    actor,
    action: ACTIONS.EVENT_PARTICIPANTS_RECORDED,
    targetType: 'Event',
    targetId: event._id,
    ctx,
    // Counts only — an event register must not become a list of names in the audit trail.
    meta: {
      recorded: rows.length,
      known: known.length,
      anonymous: anonymous.length,
      total: event.recordedAttendance,
    },
  });

  return event;
}

export async function listParticipants(id, query = {}, actor) {
  const event = await findEventOrFail(id, actor);

  const filter = { event: event._id };
  if (query.gender) filter.gender = query.gender;
  if (query.knownOnly) filter.beneficiary = { $ne: null };

  return paginateQuery(EventParticipant, filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    populate: { path: 'beneficiary', select: 'referenceCode firstName lastName' },
  });
}

/**
 * Demographic breakdown for reporting. Aggregated, never itemised — this is the shape a
 * funder is shown, and it needs no identities to be useful.
 */
export async function getAttendanceBreakdown(id, actor) {
  const event = await findEventOrFail(id, actor);

  const rows = await EventParticipant.find({ event: event._id })
    .select('gender ageBand beneficiary isFirstTime')
    .exec();

  const tally = (key) =>
    rows.reduce((acc, r) => {
      const value = r[key] ?? 'UNKNOWN';
      return { ...acc, [value]: (acc[value] ?? 0) + 1 };
    }, {});

  return {
    event: event._id,
    total: rows.length,
    expected: event.expectedAttendance,
    variance: event.attendanceVariance,
    known: rows.filter((r) => r.beneficiary !== null).length,
    anonymous: rows.filter((r) => r.beneficiary === null).length,
    firstTime: rows.filter((r) => r.isFirstTime).length,
    byGender: tally('gender'),
    byAgeBand: tally('ageBand'),
  };
}
