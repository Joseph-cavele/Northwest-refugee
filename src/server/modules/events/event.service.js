import AppError from '../../utils/AppError.js';
import { paginateQuery } from '../../utils/paginate.js';
import { scopeToProgrammes } from '../../config/permissions.js';
import { normalisePhone } from '../../utils/phone.js';
import * as audit from '../audit/audit.service.js';
import { ACTIONS } from '../audit/audit.model.js';
import { getBeneficiaryById } from '../beneficiaries/beneficiary.service.js';
import { destroyAsset } from '../../config/cloudinary.js';
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
    upcomingOnly, from, to, search, includeDeleted, publication,
  } = query;

  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (pillar) filter.pillar = pillar;
  if (programme) filter.programme = programme;
  if (search) filter.title = { $regex: search, $options: 'i' };
  if (publication) filter['publication.status'] = publication;

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

// --- publication ---------------------------------------------------------------------

/**
 * Put an event on the public site, or take it off.
 *
 * WHAT MUST BE TRUE BEFORE ANYTHING IS PUBLISHED. A public notice with no summary renders as
 * an empty card; one for an in-person event with no venue tells somebody to come without
 * saying where; one with no audience invites people it was never meant for. So the refusal
 * lives here, at the moment of publishing, rather than on the create form — an officer must
 * be able to save a half-finished draft and come back to it, which is the point of drafts.
 *
 * UNPUBLISHING IS NOT A DELETE and clears nothing. The event keeps its image, its summary
 * and its publishedAt so it can go back up unchanged; the public query stops matching it.
 */
export async function setPublication(id, publish, actor, ctx = {}) {
  const doc = await findEventOrFail(id, actor);
  const pub = doc.publication ?? {};

  if (publish) {
    const missing = [];
    if (!pub.summary) missing.push('a short summary for the listing card');
    if (!pub.audience) missing.push('who the event is for');
    if (pub.mode !== 'ONLINE' && !doc.venue) missing.push('a venue');
    if (pub.mode !== 'IN_PERSON' && !pub.onlineUrl) missing.push('a joining link');
    if (missing.length > 0) {
      throw AppError.badRequest(
        `This event cannot be published yet - it still needs ${missing.join(', ')}.`
      );
    }

    doc.publication.status = 'PUBLISHED';
    // First publication only. Something taken down and put back up keeps the date it first
    // went up, which is what "published on" means to a reader.
    doc.publication.publishedAt = doc.publication.publishedAt ?? new Date();
    doc.publication.publishedBy = actor._id;
  } else {
    doc.publication.status = 'DRAFT';
  }

  await doc.save();

  await audit.record({
    actor,
    action: publish ? ACTIONS.EVENT_PUBLISHED : ACTIONS.EVENT_UNPUBLISHED,
    targetType: 'Event',
    targetId: doc._id,
    ctx,
    meta: { title: doc.title, startsAt: doc.startsAt },
  });

  return doc;
}

/**
 * Attach an uploaded image to an event's publication block.
 *
 * The previous Cloudinary asset is destroyed AFTER the new one is saved, never before: an
 * upload that fails halfway must not leave the event with no picture and the old file gone.
 * A failure to destroy is swallowed - an orphaned asset costs storage, a thrown error costs
 * the officer their upload.
 */
export async function setEventImage(id, { url, publicId }, actor, ctx = {}) {
  const doc = await findEventOrFail(id, actor);
  const previousId = doc.publication?.imagePublicId ?? null;

  doc.publication.imageUrl = url;
  doc.publication.imagePublicId = publicId ?? null;
  await doc.save();

  if (previousId && previousId !== publicId) {
    try {
      await destroyAsset(previousId);
    } catch {
      /* orphaned, not fatal */
    }
  }

  await audit.record({
    actor,
    action: ACTIONS.EVENT_UPDATED,
    targetType: 'Event',
    targetId: doc._id,
    ctx,
    meta: { fields: ['publication.imageUrl'] },
  });

  return doc;
}

/**
 * Soft delete.
 *
 * `deletedAt` rather than a real removal, because an event is the parent of an attendance
 * register, and those rows are what the organisation shows a funder when asked what it did
 * with the money. Deleting the parent of an evidence trail is not a thing this system does.
 *
 * It is also taken off the public site in the same write rather than left PUBLISHED and
 * merely excluded by the query - two conditions guarding one rule is one condition too many
 * to remember when the next person edits that query.
 */
export async function deleteEvent(id, actor, ctx = {}) {
  const doc = await findEventOrFail(id, actor);

  doc.deletedAt = new Date();
  doc.publication.status = 'DRAFT';
  await doc.save();

  await audit.record({
    actor,
    action: ACTIONS.EVENT_DELETED,
    targetType: 'Event',
    targetId: doc._id,
    ctx,
    meta: { title: doc.title, startsAt: doc.startsAt, recordedAttendance: doc.recordedAttendance },
  });

  return doc;
}

// --- the public site -------------------------------------------------------------------

/*
 * EVERYTHING BELOW IS SERVED WITHOUT AUTHENTICATION, and is written as though the caller is
 * hostile - on an unauthenticated endpoint that is the only safe assumption.
 *
 * TWO RULES HOLD THE WHOLE THING UP:
 *
 *   1. THE QUERY IS A HARD CONDITION, NOT A FILTER. `publication.status: PUBLISHED` and
 *      `deletedAt: null` are written here and cannot be influenced by anything the caller
 *      sends. There is no status parameter to override, and no includeDeleted to flip.
 *
 *   2. THE RESPONSE IS A WHITELIST. `toPublicEvent` names every field that leaves, so a
 *      field added to the model later is invisible out here until somebody decides
 *      otherwise. The Event document carries expected and recorded attendance, the
 *      capturing officer, the programme and the pillar, and it is the parent of a register
 *      holding gender and age bands. A `.select()` or a `delete` would be a blacklist, and a
 *      blacklist fails open the day somebody adds a field.
 */

const PUBLIC_CONDITION = Object.freeze({ 'publication.status': 'PUBLISHED', deletedAt: null });

function toPublicEvent(doc) {
  const pub = doc.publication ?? {};
  return {
    id: String(doc._id),
    title: doc.title,
    /*
     * The KIND of event — "Community dialogue", "Training", "Awareness day".
     *
     * It crosses over even though `type` is otherwise an internal reporting dimension,
     * because it is the label a visitor scans a noticeboard by and it says nothing about
     * anybody: the vocabulary is eight fixed words about the occasion, not about a person.
     * It is the one field on this shape that is not part of the publication block, and it
     * is here deliberately rather than by omission.
     */
    type: doc.type,
    description: doc.description ?? '',
    summary: pub.summary ?? '',
    imageUrl: pub.imageUrl ?? '',
    startsAt: doc.startsAt,
    endsAt: doc.endsAt ?? null,
    venue: doc.venue ?? '',
    address: doc.address ?? '',
    mode: pub.mode ?? 'IN_PERSON',
    onlineUrl: pub.onlineUrl ?? '',
    audience: pub.audience ?? '',
    registrationInfo: pub.registrationInfo ?? '',
    registrationUrl: pub.registrationUrl ?? '',
    contact: pub.contact ?? '',
    /*
     * The one piece of operational status that crosses over, and it has to. A cancelled
     * event STAYS on the site, marked, so somebody who read the notice finds out before
     * they travel - see the note on PUBLICATION_STATUS in the model.
     */
    isCancelled: doc.status === 'CANCELLED',
    publishedAt: pub.publishedAt ?? null,
  };
}

export async function listPublicEvents(query = {}) {
  const { page, limit, mode, past } = query;

  const filter = { ...PUBLIC_CONDITION };
  if (mode) filter['publication.mode'] = mode;

  // "Upcoming" counts from the START of today, so an event running this afternoon does not
  // drop off the page at the moment it begins.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  filter.startsAt = past ? { $lt: startOfToday } : { $gte: startOfToday };

  const result = await paginateQuery(Event, filter, {
    page,
    limit,
    // Soonest first for what is coming; most recent first for the archive.
    sort: past ? '-startsAt' : 'startsAt',
  });

  return { ...result, data: result.data.map(toPublicEvent) };
}

export async function getPublicEvent(id) {
  const doc = await Event.findOne({ ...PUBLIC_CONDITION, _id: id }).exec();
  // 404 rather than 403, as everywhere else in this system: a 403 would confirm that an
  // unpublished event with this id exists.
  if (!doc) throw AppError.notFound('Event');
  return toPublicEvent(doc);
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
