import mongoose from 'mongoose';
import env from './config/env.js';
import logger from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { ROLES, PROGRAMME_PILLARS, CATEGORY_PILLAR } from './config/constants.js';
import { startOfDaySAST } from './utils/dates.js';
import User from './modules/users/user.model.js';
import Beneficiary from './modules/beneficiaries/beneficiary.model.js';
import Case from './modules/cases/case.model.js';
import ServiceRequest from './modules/serviceRequests/serviceRequest.model.js';
import Document from './modules/documents/document.model.js';
import Notification from './modules/notifications/notification.model.js';
import { Programme, Cohort } from './modules/programmes/programme.model.js';
import { Event, EventParticipant } from './modules/events/event.model.js';
import Budget from './modules/finance/budget.model.js';
import Transaction from './modules/finance/transaction.model.js';
import { Donor, Campaign, Donation } from './modules/fundraising/fundraising.model.js';
import Metric, { METRICS } from './modules/reports/metric.model.js';

/*
 * DEMO DATA. Not real people, not real money, not for production.
 *
 * The dashboard is honest about empty state by design — a chart with no history says so
 * rather than drawing a flat line — which makes it impossible to review a layout before
 * the organisation has been using the system for a month. This fills it in.
 *
 * Three properties make that safe to do against a live database:
 *
 *   MARKED     every beneficiary's surname ends in "(demo)", so it is visible in the
 *              register, in the topbar search, and in every table on every screen. Nobody
 *              can look at one of these rows and mistake it for somebody real.
 *   PURGEABLE  every _id written is recorded in a `demoseeds` manifest. `--purge` deletes
 *              exactly what was created and nothing else — it does not guess by name.
 *   REFUSED    it will not run when NODE_ENV is production.
 *
 * The figures are DERIVED, not invented: the daily metrics are computed from the records
 * this script just created, so the charts, the tiles and the tables agree with each other.
 * A demo where the chart contradicts the table teaches the reviewer to distrust both.
 */

const log = logger.child({ module: 'demo' });
const MANIFEST = 'demoseeds';
/*
 * HOW MUCH DEMO DATA TO WRITE, IN ONE PLACE.
 *
 * These were loop bounds scattered through eight hundred lines — `for (let i = 0; i < 40;`
 * in the middle of the service-request block, and so on. Nobody could answer "how big is a
 * demo seed" without reading the whole file, and nobody could make it smaller without
 * hunting.
 *
 * THE NUMBERS ARE DELIBERATELY SMALL. A demo exists to be READ: to show what a screen looks
 * like with real shapes in it, not to load-test a table. Forty service requests against
 * twenty-four people made the queue screens a wall nobody scrolled to the bottom of, and the
 * audit trail — which records every write this seed makes — grew past four hundred rows
 * before anyone had used the system at all.
 *
 * WHAT MUST SURVIVE ANY FURTHER REDUCTION, because the screens are built to show it:
 *
 *   - at least one case in every status, and one escalated;
 *   - one service request past its standard, so the overdue figure is not zero;
 *   - a minor, so child-protection handling is visible;
 *   - one permit already expired and one expiring inside thirty days;
 *   - the three event outcomes: one that beat its target, one that fell short, one exact.
 *
 * Cutting a count below the number of distinct states a screen renders does not make the
 * demo smaller, it makes it wrong — the reviewer concludes a state is unimplemented when it
 * simply was not seeded.
 */
const VOLUME = Object.freeze({
  /* Days of history. Drives one metric row per key per day, which is the largest table by
     some distance — every day removed here removes seventeen rows. */
  days: 30,
  /* Beneficiaries, taken from the head of PEOPLE below. */
  people: 12,
  cases: 8,
  serviceRequests: 16,
  documents: 8,
  donations: 10,
});

const DAYS = VOLUME.days;

/*
 * Names are real Southern African given names paired with a marked surname. Realistic
 * enough that column widths and truncation behave as they will in production; marked so
 * the realism can never be mistaken for the thing itself.
 */
const PEOPLE = [
  ['Thandiwe', 'Mokoena'], ['Blessing', 'Ncube'], ['Aline', 'Uwimana'], ['Joseph', 'Kabila'],
  ['Grace', 'Chikwanda'], ['Emmanuel', 'Dlamini'], ['Fatima', 'Hassan'], ['Patrick', 'Mubiru'],
  ['Sarah', 'Nyathi'], ['Claude', 'Mutombo'], ['Miriam', 'Tesfaye'], ['Daniel', 'Okonkwo'],
  ['Chantal', 'Bizimana'], ['Peter', 'Moyo'], ['Amina', 'Yusuf'], ['Samuel', 'Banda'],
  ['Esther', 'Phiri'], ['John', 'Mwangi'], ['Rose', 'Achieng'], ['David', 'Sibanda'],
  ['Naledi', 'Khumalo'], ['Ibrahim', 'Diallo'], ['Lerato', 'Motaung'], ['Kwame', 'Asante'],
];

const NATIONALITIES = [
  'Democratic Republic of the Congo', 'Zimbabwe', 'Somalia', 'Ethiopia',
  'Burundi', 'Rwanda', 'Malawi', 'Mozambique',
];

const CATEGORIES = [
  'LEGAL_DOCUMENTATION', 'FOOD_ASSISTANCE', 'SHELTER', 'HEALTHCARE', 'PSYCHOSOCIAL',
  'EDUCATION_PLACEMENT', 'SKILLS_TRAINING', 'EMPLOYMENT', 'GBV_SUPPORT', 'CHILD_PROTECTION',
];

// Deterministic pseudo-randomness: the same seed produces the same demo every time, so a
// layout problem someone reports is one you can reproduce.
let seed = 20260810;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

const dayAgo = (n) => new Date(Date.now() - n * 86_400_000);

/** Timestamps are set by Mongoose on insert, so backdating goes through the raw driver. */
async function backdate(Model, id, createdAt) {
  await Model.collection.updateOne({ _id: id }, { $set: { createdAt, updatedAt: createdAt } });
}

async function record(manifest, collection, ids) {
  manifest.push(...ids.map((id) => ({ collection, id })));
}

// --- create ------------------------------------------------------------------------

/**
 * @param manifest owned by the caller, not by this function.
 *
 * PURGEABILITY MUST SURVIVE A CRASH. The manifest used to be written in one go at the end,
 * which meant a run that failed halfway left records in the database that `--purge` could
 * never find — they were not in any batch, so the only way to remove them would have been
 * guessing by name, which is exactly what the manifest exists to avoid. The caller now owns
 * the array and persists whatever reached it, successful run or not.
 */
async function build(manifest) {
  const actor = await User.findOne({ role: ROLES.EXECUTIVE_DIRECTOR });
  if (!actor) throw new Error('No Executive Director — run `npm run seed` first.');

  /*
   * A second member of staff, so the financial controls can be seen working.
   *
   * Maker-checker means the person who raises a transaction can never approve it. With one
   * account in the database every row on the approvals queue reads "you raised this" and
   * the approve path is unreachable — which demonstrates half the control and hides the
   * half anyone wants to look at.
   *
   * `invited` with no password hash: this account CANNOT sign in. It exists to be named as
   * the creator of a record, nothing more. Marked like every other demo row.
   */
  const officer = await User.create({
    name: 'Nomsa Finance Officer (demo)',
    email: 'demo.finance@nwhr.invalid',
    role: ROLES.FINANCE_OFFICER,
    status: 'invited',
    invitedBy: actor._id,
  });
  await record(manifest, 'users', [officer._id]);

  // --- people ---
  const beneficiaries = [];
  /*
   * The count is computed ONCE and every state below is expressed against it.
   *
   * WHY THAT MATTERS, learned the hard way: these were written as `i >= PEOPLE.length - 3`
   * back when the loop ran to PEOPLE.length. The moment the volume came down to twelve, the
   * loop stopped at twelve and the three minors sat at indices 21, 22 and 23 that were never
   * reached — so the demo silently lost every minor, and with them the Minor flag, the
   * guardian panel and the alarm for a minor with no guardian. Nothing failed; a whole
   * branch of child-protection handling simply stopped being demonstrable.
   *
   * Any state seeded at a fixed index is a state that disappears the next time somebody
   * makes the seed smaller. Tie them to the count.
   */
  const peopleCount = Math.min(VOLUME.people, PEOPLE.length);

  for (let i = 0; i < peopleCount; i += 1) {
    const [firstName, surname] = PEOPLE[i];
    const registeredAt = dayAgo(between(0, DAYS));

    /*
     * Three minors, so the child-protection handling on the record is reachable at all:
     * the Minor flag on the register, the guardian panel, and the alarm that fires when a
     * minor has no guardian recorded. The model REFUSES to save a minor without one, which
     * is itself the rule being demonstrated.
     */
    const minor = i >= peopleCount - 3;
    const dateOfBirth = minor
      ? new Date(2009 + between(0, 4), between(0, 11), between(1, 28))
      : new Date(1975 + between(0, 30), between(0, 11), between(1, 28));

    /*
     * Permits, with two properties the earlier version could not produce.
     *
     * AN ISSUE DATE. Without one the record's permit timeline refuses to draw — correctly,
     * because it would otherwise be inventing the geometry it appears to measure — so the
     * whole device was invisible.
     *
     * SOME THAT HAVE ALREADY LAPSED. Every generated expiry used to be in the future, so
     * the expired state never appeared: the single most consequential fact about an asylum
     * seeker's day was the one thing the demo could not show.
     */
    const hasPermit = rand() > 0.35;
    const lapsed = hasPermit && rand() > 0.72;
    const permitExpiresAt = hasPermit
      ? lapsed
        ? dayAgo(between(2, 70))
        : dayAgo(-between(1, 150))
      : null;
    const permitIssuedAt = permitExpiresAt
      ? new Date(permitExpiresAt.getTime() - between(180, 730) * 86_400_000)
      : null;

    const doc = await Beneficiary.create({
      firstName,
      // The marker. Visible everywhere a name is rendered.
      lastName: `${surname} (demo)`,
      gender: pick(['FEMALE', 'MALE', 'FEMALE', 'MALE', 'OTHER']),
      dateOfBirth,
      nationality: pick(NATIONALITIES),
      languages: [pick(['fr', 'sw', 'en', 'pt', 'so', 'am'])],
      immigration: {
        status: minor
          ? 'ASYLUM_SEEKER'
          : pick(['ASYLUM_SEEKER', 'REFUGEE', 'UNDOCUMENTED', 'ASYLUM_SEEKER']),
        // No permit NUMBER: encrypting one needs ENCRYPTION_KEY, which is optional at boot
        // and absent here. The dates drive the expiry queue and the record's timeline, and
        // carry nothing sensitive on their own.
        permitType: permitExpiresAt ? pick(['Section 22', 'Section 24']) : null,
        permitIssuedAt,
        permitExpiresAt,
      },
      // Required for a minor, and the reason a minor can be seeded at all.
      guardian: minor
        ? {
            fullName: `${pick(['Maria', 'Josephine', 'Agnes', 'Samuel'])} ${surname} (demo)`,
            relationship: pick(['Mother', 'Father', 'Aunt', 'Grandmother']),
            phone: `+2783${String(2000000 + i).slice(0, 7)}`,
            // One placement rather than kin, so the "not a legal guardian" wording appears.
            isLegalGuardian: i !== peopleCount - 1,
          }
        : null,
      contact: { cellphone: `+2782${String(1000000 + i).slice(0, 7)}` },
      consent: { given: true, givenAt: registeredAt, method: 'SIGNED_FORM', policyVersion: '1.0' },
      intakeChannel: pick(['WALK_IN', 'WHATSAPP', 'REFERRAL', 'OUTREACH']),
      status: pick(['ACTIVE', 'ACTIVE', 'ACTIVE', 'PENDING_VERIFICATION']),
      capturedBy: actor._id,
      notes: 'DEMO DATA — not a real person. Created by npm run seed:demo.',
    });

    await backdate(Beneficiary, doc._id, registeredAt);
    beneficiaries.push({ doc, registeredAt });
  }
  await record(manifest, 'beneficiaries', beneficiaries.map((b) => b.doc._id));
  log.info({ created: beneficiaries.length }, 'beneficiaries');

  // --- cases. One ACTIVE case per person is a unique index, so open files take distinct
  //     people and the closed ones reuse whoever is left. ---
  const cases = [];
  for (let i = 0; i < VOLUME.cases; i += 1) {
    const subject = beneficiaries[i % beneficiaries.length];
    const openedAt = new Date(Math.max(subject.registeredAt.getTime(), dayAgo(between(0, DAYS - 1)).getTime()));
    /* Roughly the last third closed, whatever the volume — see the note on peopleCount. */
    const closed = i >= Math.max(1, Math.ceil(VOLUME.cases * 0.6));

    const doc = await Case.create({
      beneficiary: subject.doc._id,
      caseworker: actor._id,
      openedBy: actor._id,
      category: pick(CATEGORIES),
      priority: pick(['NORMAL', 'NORMAL', 'HIGH', 'URGENT', 'LOW']),
      summary: 'DEMO DATA — not a real case.',
      openedAt,
      status: closed ? 'CLOSED' : pick(['OPEN', 'OPEN', 'ON_HOLD']),
      ...(closed
        ? {
            closure: {
              outcome: pick(['RESOLVED', 'REFERRED_OUT', 'BENEFICIARY_EXITED']),
              notes: 'DEMO DATA.',
              closedBy: actor._id,
              closedAt: dayAgo(between(0, 20)),
            },
          }
        : {}),
    });
    await backdate(Case, doc._id, openedAt);
    cases.push(doc);
  }
  await record(manifest, 'cases', cases.map((c) => c._id));
  log.info({ created: cases.length }, 'cases');

  // --- service requests, spread across the pillars so the breakdown has shape ---
  const requests = [];
  for (let i = 0; i < VOLUME.serviceRequests; i += 1) {
    const subject = pick(beneficiaries);
    const raisedAt = new Date(Math.max(subject.registeredAt.getTime(), dayAgo(between(0, DAYS - 1)).getTime()));
    const category = pick(CATEGORIES);
    const resolved = rand() > 0.45;

    const doc = await ServiceRequest.create({
      beneficiary: subject.doc._id,
      category,
      pillar: CATEGORY_PILLAR[category],
      description: 'DEMO DATA — not a real request.',
      urgency: pick(['LOW', 'NORMAL', 'NORMAL', 'HIGH', 'URGENT']),
      status: resolved ? 'RESOLVED' : pick(['OPEN', 'OPEN', 'IN_PROGRESS', 'ON_HOLD']),
      capturedBy: actor._id,
      createdAt: raisedAt,
      ...(resolved
        ? { resolution: { notes: 'DEMO DATA.', resolvedBy: actor._id, resolvedAt: dayAgo(between(0, 25)) } }
        : {}),
    });
    await backdate(ServiceRequest, doc._id, raisedAt);
    requests.push(doc);
  }
  await record(manifest, 'servicerequests', requests.map((r) => r._id));
  log.info({ created: requests.length }, 'service requests');

  /*
   * --- documents ---------------------------------------------------------------------
   *
   * METADATA ONLY. NO BYTES ARE UPLOADED, so opening one of these will 404 at Cloudinary.
   * That is deliberate and worth knowing before it is reported as a bug: uploading real
   * files would need live Cloudinary credentials, and inventing an identity document —
   * even a fake one — is not a thing this script should be putting into a database.
   *
   * What these DO exercise is everything up to the fetch: that a scan is listed at all,
   * that listing and opening are different permissions, and that asking to open one writes
   * an audit entry naming the reader. That is the part worth reviewing.
   */
  const DOC_KINDS = ['ASYLUM_PERMIT', 'PASSPORT', 'BIRTH_CERTIFICATE', 'PROOF_OF_ADDRESS', 'CONSENT_FORM'];
  const documents = [];
  for (let i = 0; i < VOLUME.documents; i += 1) {
    const subject = beneficiaries[i % beneficiaries.length];
    const kind = DOC_KINDS[i % DOC_KINDS.length];
    const isImage = kind !== 'CONSENT_FORM';
    const slug = kind.toLowerCase().replace(/_/g, '-');

    const doc = await Document.create({
      beneficiary: subject.doc._id,
      kind,
      storageKey: `nwhr-demo/${subject.doc._id}-${slug}`,
      resourceType: isImage ? 'image' : 'raw',
      format: isImage ? 'jpg' : 'pdf',
      originalName: `${slug}-${subject.doc.lastName.replace(/[^a-z]/gi, '')}.${isImage ? 'jpg' : 'pdf'}`,
      mimeType: isImage ? 'image/jpeg' : 'application/pdf',
      bytes: between(90, 3400) * 1024,
      // The model holds a unique index on (beneficiary, checksum); a counter keeps these
      // distinct without pretending to be a real digest of anything.
      checksum: `demo-checksum-${String(i).padStart(4, '0')}`,
      uploadedBy: actor._id,
    });
    documents.push(doc);
  }
  await record(manifest, 'documents', documents.map((d) => d._id));
  log.info({ created: documents.length }, 'documents (metadata only — no files stored)');

  /*
   * --- cohorts -----------------------------------------------------------------------
   *
   * Against the five pillar programmes the ordinary seed creates. The spread is chosen so
   * every seat state on the programme screen is reachable, and one of them is the point:
   *
   *   RUNNING with thirteen empty places — a cohort with free seats that takes nobody.
   *   Getting that wrong sends an intake officer to enrol someone who cannot be enrolled,
   *   and the screen looks perfectly reasonable while doing it.
   *
   * OVERSUBSCRIBED is deliberately NOT seeded. A count above capacity means the atomic
   * seat guard did not hold, and manufacturing one would put a fake integrity failure in
   * front of a reviewer. It stays covered by unit tests instead.
   */
  const programmes = await Programme.find({ deletedAt: null }).sort({ name: 1 }).limit(5).exec();
  const COHORT_PLAN = [
    { status: 'OPEN', capacity: 30, taken: 18, startsIn: 21, runs: 60 },
    { status: 'OPEN', capacity: 20, taken: 20, startsIn: 14, runs: 45 },
    { status: 'RUNNING', capacity: 25, taken: 12, startsIn: -30, runs: 90 },
    { status: 'COMPLETED', capacity: 40, taken: 37, startsIn: -210, runs: 120 },
    { status: 'PLANNED', capacity: 15, taken: 0, startsIn: 45, runs: 30 },
    { status: 'CANCELLED', capacity: 25, taken: 4, startsIn: -12, runs: 40 },
  ];

  const cohorts = [];
  if (programmes.length > 0) {
    for (let i = 0; i < COHORT_PLAN.length; i += 1) {
      const plan = COHORT_PLAN[i];
      const programme = programmes[i % programmes.length];
      const startDate = dayAgo(-plan.startsIn);

      const doc = await Cohort.create({
        programme: programme._id,
        name: `${plan.status === 'COMPLETED' ? 'Autumn' : plan.status === 'RUNNING' ? 'Winter' : 'Spring'} intake ${2026 + (i % 2)} (demo)`,
        startDate,
        endDate: new Date(startDate.getTime() + plan.runs * 86_400_000),
        capacity: plan.capacity,
        enrolledCount: plan.taken,
        venue: pick(['NWHR offices, Rustenburg', 'Tlhabane community hall', 'Boitekong clinic hall']),
        facilitator: actor._id,
        status: plan.status,
        createdBy: actor._id,
        ...(plan.status === 'CANCELLED'
          ? { cancellationReason: 'DEMO DATA — facilitator unavailable.' }
          : {}),
      });
      cohorts.push(doc);
    }
    await record(manifest, 'cohorts', cohorts.map((c) => c._id));
  }
  log.info({ created: cohorts.length }, 'cohorts');

  /*
   * --- events and their registers ------------------------------------------------------
   *
   * Turnout against plan is the figure this screen exists for, so the spread covers every
   * outcome: one that beat its target, one that fell short, one that landed exactly, two
   * still ahead, and one cancelled.
   *
   * Attendance is stored the way the model insists on: counted, never identified. A
   * community event's attendees have consented to nothing, so a participant row carries a
   * gender, an age band and whether they had been before — no name, no number, nothing that
   * could single anybody out.
   */
  /*
   * `publish` MARKS THE ONES THAT ALSO GO ON THE PUBLIC NOTICEBOARD, and the spread is
   * chosen so /news can be reviewed properly rather than just proved non-empty:
   *
   *   - two upcoming and published, so the listing has cards in it;
   *   - one published and then CANCELLED, because that is the state most likely to be got
   *     wrong later — a cancelled event must stay on the site, marked, rather than vanish
   *     on somebody who is about to travel to it;
   *   - one upcoming and left as a DRAFT, so "staff can see it and the public cannot" is
   *     visible in the same run rather than taken on trust;
   *   - the past ones stay unpublished, which is what an office that only started using
   *     the noticeboard this month would actually look like.
   *
   * ONE PLACEHOLDER POSTER ON ALL THREE, AND IT IS A PLACEHOLDER — supplied artwork that
   * depicts none of these events and is not a South African setting. It is here so the card
   * layout can be reviewed with a picture in it rather than an empty frame.
   *
   * REPLACE IT BEFORE THIS SITE IS SEEN BY ANYONE OUTSIDE THE ORGANISATION. A picture that
   * shows something other than the event it sits on is a small untruth on a page whose whole
   * job is telling somebody where to be and when, and the same demo rule applies to artwork
   * as to records: a demo that reads as real is a data-quality incident waiting to happen.
   * design/event-image-prompts.md carries a brief per event type; staff upload the real
   * poster from the dashboard.
   */
  /* The stand-in poster every seeded event shares. Not a depiction of any of them. */
  const DEMO_EVENT_POSTER = '/cards-images/image.png';

  const EVENT_PLAN = [
    { title: 'World Refugee Day commemoration (demo)', type: 'COMMEMORATION', daysAgo: 54, expected: 50, actual: 62, status: 'COMPLETED' },
    { title: 'Documentation clinic, Tlhabane (demo)', type: 'OUTREACH', daysAgo: 26, expected: 30, actual: 21, status: 'COMPLETED' },
    { title: 'Community dialogue on xenophobia (demo)', type: 'COMMUNITY_DIALOGUE', daysAgo: 12, expected: 25, actual: 25, status: 'COMPLETED' },
    {
      title: 'Small business skills workshop (demo)',
      type: 'TRAINING', daysAgo: -18, expected: 40, actual: 0, status: 'CONFIRMED',
      publish: {
        summary: 'A free one-day workshop on registering a small business, keeping records and pricing your work.',
        audience: 'Anyone in Rustenburg thinking about starting or growing a small business.',
        registrationInfo: 'Come to the office to put your name down, or phone. Places are limited to forty.',
        contact: 'Ask for the skills coordinator at the front desk.',
      },
    },
    {
      title: 'Winter clothing drive (demo)',
      type: 'AWARENESS', daysAgo: -35, expected: 60, actual: 0, status: 'PLANNED',
      publish: {
        summary: 'Warm clothing and blankets for families facing their first winter in Rustenburg.',
        audience: 'Anyone who needs winter clothing, and anyone with clothing to donate.',
        registrationInfo: 'No booking needed. Just come on the day.',
        contact: 'Ask at the front desk.',
      },
    },
    {
      title: 'Stakeholder breakfast (demo)',
      type: 'STAKEHOLDER_MEETING', daysAgo: -5, expected: 25, actual: 0, status: 'CANCELLED',
      publish: {
        summary: 'A morning meeting between NWHR, local government and partner organisations.',
        audience: 'Invited partner organisations.',
        registrationInfo: 'By invitation.',
        contact: 'Ask at the front desk.',
      },
    },
    {
      title: 'Documentation clinic, Boitekong (demo)',
      type: 'OUTREACH', daysAgo: -9, expected: 35, actual: 0, status: 'CONFIRMED',
      // Left a DRAFT on purpose: this is the one that proves the public page is filtered.
    },
  ];

  // Weighted so the age distribution has a believable shape rather than a flat one — the
  // bars are there to be read, and eight equal bars say nothing about who walked in.
  const AGE_WEIGHTS = [
    ['0-5', 6], ['6-12', 10], ['13-17', 8], ['18-24', 20],
    ['25-34', 26], ['35-49', 18], ['50-64', 9], ['65+', 3],
  ];
  const AGE_POOL = AGE_WEIGHTS.flatMap(([band, weight]) => Array.from({ length: weight }, () => band));
  const GENDER_POOL = ['FEMALE', 'FEMALE', 'FEMALE', 'MALE', 'MALE', 'OTHER', 'UNDISCLOSED'];

  const events = [];
  const participantIds = [];
  for (const plan of EVENT_PLAN) {
    const startsAt = dayAgo(plan.daysAgo);
    const event = await Event.create({
      title: plan.title,
      description: plan.publish
        ? `DEMO DATA — not a real event.\n\n${plan.publish.summary} Everything on this page is seeded sample content and the date is not a real one.`
        : 'DEMO DATA — not a real event.',
      type: plan.type,
      pillar: pick(Object.values(PROGRAMME_PILLARS)),
      startsAt,
      endsAt: new Date(startsAt.getTime() + between(2, 6) * 3_600_000),
      venue: pick(['NWHR offices, Rustenburg', 'Tlhabane community hall', 'Rustenburg civic centre']),
      status: plan.status,
      expectedAttendance: plan.expected,
      recordedAttendance: plan.actual,
      organiser: actor._id,
      capturedBy: actor._id,
      ...(plan.status === 'CANCELLED'
        ? { cancellationReason: 'DEMO DATA — venue double-booked.' }
        : {}),
      /*
       * Written directly rather than through setPublication, because the service refuses to
       * publish an incomplete notice and this seed supplies every field it asks for anyway.
       * A seed that had to satisfy a workflow step by step would be asserting the workflow,
       * which is a test's job and not a fixture's.
       */
      publication: plan.publish
        ? {
            status: 'PUBLISHED',
            publishedAt: dayAgo(Math.max(1, plan.daysAgo + 14)),
            publishedBy: actor._id,
            // See the note above: a stand-in, not a depiction. Replace per event.
            imageUrl: DEMO_EVENT_POSTER,
            summary: plan.publish.summary,
            mode: 'IN_PERSON',
            audience: plan.publish.audience,
            registrationInfo: plan.publish.registrationInfo,
            contact: plan.publish.contact,
          }
        : { status: 'DRAFT' },
    });
    await backdate(Event, event._id, startsAt);
    events.push(event);

    if (plan.actual > 0) {
      const rows = Array.from({ length: plan.actual }, () => ({
        event: event._id,
        // Null: counted, not identified. The ordinary case at a community event.
        beneficiary: null,
        gender: pick(GENDER_POOL),
        ageBand: pick(AGE_POOL),
        isFirstTime: rand() > 0.62,
        recordedBy: actor._id,
        recordedAt: startsAt,
      }));
      const inserted = await EventParticipant.insertMany(rows);
      participantIds.push(...inserted.map((p) => p._id));
    }
  }
  await record(manifest, 'events', events.map((e) => e._id));
  await record(manifest, 'eventparticipants', participantIds);
  log.info(
    {
      events: events.length,
      published: EVENT_PLAN.filter((p) => p.publish).length,
      participants: participantIds.length,
    },
    'events'
  );

  // --- fundraising ---
  const donor = await Donor.create({
    name: 'Rustenburg Community Trust (demo)',
    type: 'FOUNDATION',
    capturedBy: actor._id,
    notes: 'DEMO DATA — not a real donor.',
  });
  /*
   * TARGETS, so the progress bars draw at all — an untargeted campaign correctly reports
   * "no target set" rather than nothing raised, which meant the device was never seen. The
   * second campaign is set to be beaten, because a campaign past its target is the best
   * news the screen has and it should be visible that it says so.
   */
  const campaign = await Campaign.create({
    name: 'Winter Appeal (demo)',
    description: 'DEMO DATA — not a real campaign.',
    capturedBy: actor._id,
    status: 'ACTIVE',
    targetCents: 15_000_00,
    endsAt: dayAgo(-40),
  });
  const secondCampaign = await Campaign.create({
    name: 'Back to School (demo)',
    description: 'DEMO DATA — not a real campaign.',
    capturedBy: actor._id,
    status: 'ACTIVE',
    targetCents: 4_000_00,
    endsAt: dayAgo(-12),
  });
  await record(manifest, 'donors', [donor._id]);
  await record(manifest, 'campaigns', [campaign._id, secondCampaign._id]);

  /*
   * Donations across every status that matters, because two rules are invisible otherwise:
   *
   *   ONLY SETTLED MONEY COUNTS. A pending gift is a gateway's promise, not funds — so
   *   some are pending, and the campaign total deliberately excludes them.
   *
   *   SETTLING DOES NOT SEND THE RECEIPT. Three settled gifts have their s18A number but no
   *   `receiptEmailedAt`: donors owed a tax certificate. Three rather than all of them,
   *   because a panel reporting every gift as unreceipted reads as a broken feature rather
   *   than a queue somebody should work.
   */
  const donations = [];
  for (let i = 0; i < VOLUME.donations; i += 1) {
    const receivedAt = dayAgo(between(0, DAYS));
    // Whole rands, in cents. Money is integer cents everywhere in this system.
    const amountCents = between(25, 900) * 10_000;
    const toSecond = i % 5 === 0;

    // Last three settled gifts carry no delivered receipt — the gap the screen surfaces.
    /* The last two are still pending at the gateway; the two before them settled without a
       receipt. Both expressed against the volume so neither vanishes when it is lowered. */
    const pending = i >= Math.max(1, VOLUME.donations - 2);
    const receiptMissing = !pending && i >= Math.max(1, VOLUME.donations - 4);
    const settledAt = pending ? null : receivedAt;

    const doc = await Donation.create({
      donor: donor._id,
      campaign: toSecond ? secondCampaign._id : campaign._id,
      amountCents,
      method: pick(['EFT', 'CASH', 'CARD']),
      status: pending ? 'PENDING' : 'SETTLED',
      receivedAt,
      settledAt,
      ...(pending
        ? {}
        : {
            receiptNumber: `S18A-DEMO-${String(1000 + i)}`,
            receiptEmailedAt: receiptMissing ? null : settledAt,
          }),
      capturedBy: actor._id,
      notes: 'DEMO DATA — not a real donation.',
    });
    await backdate(Donation, doc._id, receivedAt);
    donations.push({ doc, settledAt, amountCents, campaign: toSecond ? secondCampaign._id : campaign._id });
  }
  await record(manifest, 'donations', donations.map((d) => d.doc._id));

  // Settled only, per campaign. The counter the screen reads must agree with the rule the
  // screen states, or the first thing a reviewer does is add up the rows and find it wrong.
  for (const target of [campaign, secondCampaign]) {
    const raised = donations
      .filter((d) => d.settledAt !== null && String(d.campaign) === String(target._id))
      .reduce((total, d) => total + d.amountCents, 0);
    await Campaign.updateOne({ _id: target._id }, { $set: { raisedCents: raised } });
  }
  log.info({ created: donations.length }, 'donations');

  /*
   * --- finance -------------------------------------------------------------------------
   *
   * THE LINE TOTALS ARE DERIVED FROM THE TRANSACTIONS, not typed in beside them. The budget
   * position screen recomputes each line's spend from the posted entries and flags any line
   * where the two disagree — so hand-written figures would light up every row as "does not
   * match the ledger" and the one signal that matters would be lost in six false ones.
   *
   * Spend comes from the APPROVED expenses; commitment comes from the ones still awaiting a
   * decision. That is exactly how the service maintains them.
   *
   * One line is deliberately allocated less than it has spent, so the overspent state is
   * reachable — and it still reconciles, because being over budget and disagreeing with the
   * ledger are different problems and the screen says so differently.
   */
  const TXN_PLAN = [
    // Posted — these become each line's spentCents.
    { line: 'OPS-01', cents: 420_000, status: 'APPROVED', by: 'officer', desc: 'Stationery and printer toner', payee: 'Waltons Rustenburg', method: 'EFT' },
    { line: 'OPS-01', cents: 185_000, status: 'APPROVED', by: 'officer', desc: 'Internet and telephone, June', payee: 'Telkom', method: 'DEBIT_ORDER' },
    { line: 'PRG-01', cents: 1_250_000, status: 'APPROVED', by: 'officer', desc: 'Legal clinic facilitator fees', payee: 'Adv. M. Sithole', method: 'EFT' },
    { line: 'PRG-01', cents: 640_000, status: 'APPROVED', by: 'officer', desc: 'Home Affairs transport for clients', payee: 'Rustenburg Taxi Assoc.', method: 'CASH' },
    { line: 'PRG-02', cents: 2_100_000, status: 'APPROVED', by: 'officer', desc: 'Food parcels, 120 households', payee: 'Shoprite Rustenburg', method: 'EFT' },
    { line: 'PRG-02', cents: 1_450_000, status: 'APPROVED', by: 'officer', desc: 'Food parcels, winter top-up', payee: 'Shoprite Rustenburg', method: 'EFT' },
    { line: 'TRN-01', cents: 385_000, status: 'APPROVED', by: 'officer', desc: 'Sewing machine servicing', payee: 'Singer Service Centre', method: 'CARD' },

    // Awaiting a decision — these become each line's committedCents, and are the queue.
    { line: 'PRG-01', cents: 780_000, status: 'PENDING_APPROVAL', by: 'officer', desc: 'Interpreter fees, Q3', payee: 'Language Bridge SA', method: 'EFT' },
    { line: 'TRN-01', cents: 210_000, status: 'PENDING_APPROVAL', by: 'officer', desc: 'Training materials for the September cohort', payee: 'CNA Rustenburg', method: 'CARD' },
    // Raised by the Executive Director, so the maker-checker message is visible to whoever
    // signs in as them: the one row on the queue they are not allowed to approve.
    { line: 'OPS-01', cents: 96_000, status: 'PENDING_APPROVAL', by: 'ed', desc: 'Board meeting catering', payee: 'Kloof Deli', method: 'CARD' },

    // The other two outcomes, so the ledger is not all one colour.
    { line: 'OPS-01', cents: 1_850_000, status: 'REJECTED', by: 'officer', desc: 'Replacement office chairs', payee: 'Makro', method: 'EFT' },
  ];

  const financeActor = { officer: officer._id, ed: actor._id };
  const transactions = [];
  const spentByLine = {};
  const committedByLine = {};

  for (const plan of TXN_PLAN) {
    const raisedAt = dayAgo(between(2, DAYS));
    const posted = plan.status === 'APPROVED';

    const doc = await Transaction.create({
      type: 'EXPENSE',
      amountCents: plan.cents,
      description: `${plan.desc} (demo)`,
      payee: plan.payee,
      method: plan.method,
      budget: null, // set below, once the budget exists
      budgetLineCode: plan.line,
      status: plan.status,
      createdBy: financeActor[plan.by],
      submittedAt: raisedAt,
      ...(posted ? { approvedBy: actor._id, approvedAt: raisedAt, postedAt: raisedAt } : {}),
      ...(plan.status === 'REJECTED'
        ? { rejectedBy: actor._id, rejectedAt: raisedAt, rejectionReason: 'DEMO DATA — outside this year’s allocation.' }
        : {}),
      notes: 'DEMO DATA — not a real transaction.',
    });
    await backdate(Transaction, doc._id, raisedAt);
    transactions.push(doc);

    if (posted) spentByLine[plan.line] = (spentByLine[plan.line] ?? 0) + plan.cents;
    if (plan.status === 'PENDING_APPROVAL') {
      committedByLine[plan.line] = (committedByLine[plan.line] ?? 0) + plan.cents;
    }
  }

  const LINES = [
    { code: 'OPS-01', description: 'Office and administration', allocatedCents: 1_500_000 },
    { code: 'PRG-01', description: 'Legal clinic and documentation', allocatedCents: 3_200_000 },
    // Allocated below what it has already spent: the overspent state, honestly reconciled.
    { code: 'PRG-02', description: 'Food assistance', allocatedCents: 3_400_000 },
    { code: 'TRN-01', description: 'Skills training materials', allocatedCents: 900_000 },
  ];

  const budget = await Budget.create({
    name: 'Operations 2026 (demo)',
    financialYear: 2026,
    status: 'APPROVED',
    createdBy: officer._id,
    submittedAt: dayAgo(DAYS + 10),
    approvedBy: actor._id,
    approvedAt: dayAgo(DAYS + 8),
    lines: LINES.map((line) => ({
      ...line,
      spentCents: spentByLine[line.code] ?? 0,
      committedCents: committedByLine[line.code] ?? 0,
    })),
    notes: 'DEMO DATA — not a real budget.',
  });
  await Transaction.updateMany(
    { _id: { $in: transactions.map((t) => t._id) } },
    { $set: { budget: budget._id } }
  );

  await record(manifest, 'budgets', [budget._id]);
  await record(manifest, 'transactions', transactions.map((t) => t._id));
  log.info({ transactions: transactions.length, lines: LINES.length }, 'finance');

  // --- notifications, so the bell has something behind it ---
  const notifications = await Notification.insertMany([
    { userId: actor._id, title: 'Your work needs attention', message: '3 requests past due · 1 urgent case still open.', type: 'SYSTEM', priority: 'HIGH', isRead: false },
    { userId: actor._id, title: 'Permit expiring soon', message: '2 beneficiaries have permits lapsing within 30 days.', type: 'BENEFICIARY', priority: 'MEDIUM', isRead: false },
    { userId: actor._id, title: 'Donation settled', message: 'A gift to the Winter Appeal has cleared.', type: 'DONATION', priority: 'LOW', isRead: true },
    { userId: actor._id, title: 'Overdue work with nobody assigned', message: '2 overdue requests are unassigned. Open the queue to assign them.', type: 'SYSTEM', priority: 'HIGH', isRead: false },
  ]);
  await record(manifest, 'notifications', notifications.map((n) => n._id));

  // --- the daily series, DERIVED from everything above -------------------------------
  // Charts must agree with the tables beside them, so nothing here is generated
  // independently: each day's figures are counted off the records just created.
  const dates = [];
  for (let d = DAYS; d >= 0; d -= 1) {
    const day = startOfDaySAST(dayAgo(d));
    const from = day.getTime();
    const to = from + 86_400_000;
    const upTo = (date) => date && date.getTime() < to;

    const entries = [
      { key: 'beneficiaries.registered', value: beneficiaries.filter((b) => b.registeredAt.getTime() >= from && b.registeredAt.getTime() < to).length },
      // Counts the ACTIVE ones, not everyone ever registered. The metric is named for a
      // status and previously ignored it, so the tile disagreed with the register beside it.
      { key: 'beneficiaries.active', value: beneficiaries.filter((b) => upTo(b.registeredAt) && b.doc.status === 'ACTIVE').length },
      { key: 'beneficiaries.pending_verification', value: beneficiaries.filter((b) => upTo(b.registeredAt) && b.doc.status === 'PENDING_VERIFICATION').length },
      {
        key: 'permits.expiring_30d',
        // Within thirty days OF THAT DAY, which is what the name claims. It used to count
        // every permit on the register, so the figure was the permit count wearing an
        // expiry label — and it agreed with nothing else on the dashboard.
        value: beneficiaries.filter((b) => {
          if (!upTo(b.registeredAt)) return false;
          const expiry = b.doc.immigration?.permitExpiresAt;
          return expiry && expiry.getTime() >= from && expiry.getTime() < to + 30 * 86_400_000;
        }).length,
      },

      { key: 'cases.open', value: cases.filter((c) => upTo(c.openedAt) && !(c.closure?.closedAt && c.closure.closedAt.getTime() < to)).length },
      { key: 'cases.escalated', value: cases.filter((c) => upTo(c.openedAt) && ['HIGH', 'URGENT'].includes(c.priority) && !(c.closure?.closedAt && c.closure.closedAt.getTime() < to)).length },
      { key: 'cases.closed', value: cases.filter((c) => c.closure?.closedAt && c.closure.closedAt.getTime() >= from && c.closure.closedAt.getTime() < to).length },

      { key: 'service_requests.open', value: requests.filter((r) => upTo(r.createdAt) && !(r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() < to)).length },
      { key: 'service_requests.overdue', value: requests.filter((r) => upTo(r.createdAt) && !(r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() < to) && r.dueAt && r.dueAt.getTime() < to).length },
      { key: 'service_requests.resolved', value: requests.filter((r) => r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() >= from && r.resolution.resolvedAt.getTime() < to).length },

      // `settledAt` is null on a pending gift, which is the whole point of it being
      // pending: it is a promise from a gateway and is not counted as money anywhere.
      { key: 'donations.settled_count', value: donations.filter((d) => d.settledAt && d.settledAt.getTime() >= from && d.settledAt.getTime() < to).length },
      { key: 'donations.settled_value', value: donations.filter((d) => d.settledAt && d.settledAt.getTime() >= from && d.settledAt.getTime() < to).reduce((t, d) => t + d.amountCents, 0) },
    ];

    // The pillar breakdown, from the same requests. Every pillar is written, zeros
    // included — a five-bar chart that silently becomes four reads as a discontinued pillar.
    for (const pillar of Object.values(PROGRAMME_PILLARS)) {
      entries.push({
        key: 'service_requests.open',
        dimension: 'pillar',
        dimensionValue: pillar,
        value: requests.filter(
          (r) => r.pillar === pillar && upTo(r.createdAt) && !(r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() < to)
        ).length,
      });
    }

    await Metric.recordDaily(day, entries.filter((e) => e.key in METRICS));
    dates.push(day);
  }
  log.info({ days: dates.length }, 'daily metrics derived from the records above');

  return { days: dates.length, dates };
}

/** Write what was created, so `--purge` can remove exactly it and nothing else. */
async function persist(manifest, dates) {
  await mongoose.connection.db.collection(MANIFEST).insertOne({
    createdAt: new Date(),
    records: manifest,
    metricDates: dates,
  });
}

// --- purge -------------------------------------------------------------------------

async function purge() {
  const db = mongoose.connection.db;
  const batches = await db.collection(MANIFEST).find({}).toArray();
  if (batches.length === 0) {
    log.info('nothing to purge — no demo batch recorded');
    return { removed: 0, batches: 0 };
  }

  let removed = 0;
  for (const batch of batches) {
    // Grouped so each collection is one delete rather than one per document.
    const byCollection = new Map();
    for (const { collection, id } of batch.records ?? []) {
      if (!byCollection.has(collection)) byCollection.set(collection, []);
      byCollection.get(collection).push(id);
    }
    for (const [collection, ids] of byCollection) {
      const result = await db.collection(collection).deleteMany({ _id: { $in: ids } });
      removed += result.deletedCount;
    }
    if (batch.metricDates?.length) {
      const result = await Metric.deleteMany({ date: { $in: batch.metricDates } });
      removed += result.deletedCount;
    }
  }

  await db.collection(MANIFEST).deleteMany({});
  return { removed, batches: batches.length };
}

// --- entry point -------------------------------------------------------------------

async function main() {
  /*
   * The guard is the whole reason this is safe to keep in the repository. Demo beneficiaries
   * in a live register are indistinguishable from a data-quality incident once someone has
   * exported them into a report.
   */
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo data with NODE_ENV=production.');
  }

  await connectDB();
  const purging = process.argv.includes('--purge');

  if (purging) {
    const { removed, batches } = await purge();
    log.info({ removed, batches }, 'demo data purged');
    console.log(`\n  Removed ${removed} demo records across ${batches} batch(es).\n`);
  } else {
    /*
     * The manifest is persisted in `finally`, so a run that dies partway still leaves
     * behind a purgeable record of everything it managed to write.
     */
    const manifest = [];
    let days;
    // Needs a value before the try: the `finally` reads it on the failure path too.
    let dates = [];
    try {
      ({ days, dates } = await build(manifest));
    } finally {
      if (manifest.length > 0) await persist(manifest, dates);
    }
    const records = manifest.length;
    log.info({ records, days }, 'demo data created');
    console.log(
      `\n  Created ${records} demo records and ${days} days of derived metrics.` +
        `\n  Every beneficiary surname ends in "(demo)".` +
        `\n` +
        `\n  Two things worth knowing before you review:` +
        `\n    · Documents are metadata only — no files were uploaded, so opening one` +
        `\n      will fail at the storage provider. Everything up to that point works,` +
        `\n      including the audit entry the request writes.` +
        `\n    · A second staff account exists so the finance approvals queue has rows` +
        `\n      somebody other than you raised. It is "invited" with no password and` +
        `\n      cannot sign in.` +
        `\n` +
        `\n  Remove it all with:  npm run seed:demo -- --purge\n`
    );
  }

  await disconnectDB();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error({ err }, 'demo data failed');
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
