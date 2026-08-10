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
import Notification from './modules/notifications/notification.model.js';
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
const DAYS = 45;

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

async function build() {
  const actor = await User.findOne({ role: ROLES.EXECUTIVE_DIRECTOR });
  if (!actor) throw new Error('No Executive Director — run `npm run seed` first.');

  const manifest = [];

  // --- people ---
  const beneficiaries = [];
  for (let i = 0; i < PEOPLE.length; i += 1) {
    const [firstName, surname] = PEOPLE[i];
    const registeredAt = dayAgo(between(0, DAYS));

    const doc = await Beneficiary.create({
      firstName,
      // The marker. Visible everywhere a name is rendered.
      lastName: `${surname} (demo)`,
      gender: pick(['FEMALE', 'MALE', 'FEMALE', 'MALE', 'OTHER']),
      dateOfBirth: new Date(1975 + between(0, 30), between(0, 11), between(1, 28)),
      nationality: pick(NATIONALITIES),
      languages: [pick(['fr', 'sw', 'en', 'pt', 'so', 'am'])],
      immigration: {
        status: pick(['ASYLUM_SEEKER', 'REFUGEE', 'UNDOCUMENTED', 'ASYLUM_SEEKER']),
        // No permit NUMBER: encrypting one needs ENCRYPTION_KEY, which is optional at boot
        // and absent here. The expiry date drives the permits-expiring figure and carries
        // nothing sensitive on its own.
        permitExpiresAt: rand() > 0.6 ? dayAgo(-between(1, 90)) : null,
      },
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
  for (let i = 0; i < 16; i += 1) {
    const subject = beneficiaries[i % beneficiaries.length];
    const openedAt = new Date(Math.max(subject.registeredAt.getTime(), dayAgo(between(0, DAYS - 1)).getTime()));
    const closed = i >= 10;

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
  for (let i = 0; i < 40; i += 1) {
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

  // --- fundraising ---
  const donor = await Donor.create({
    name: 'Rustenburg Community Trust (demo)',
    type: 'FOUNDATION',
    capturedBy: actor._id,
    notes: 'DEMO DATA — not a real donor.',
  });
  const campaign = await Campaign.create({
    name: 'Winter Appeal (demo)',
    description: 'DEMO DATA — not a real campaign.',
    capturedBy: actor._id,
    status: 'ACTIVE',
  });
  await record(manifest, 'donors', [donor._id]);
  await record(manifest, 'campaigns', [campaign._id]);

  const donations = [];
  for (let i = 0; i < 18; i += 1) {
    const settledAt = dayAgo(between(0, DAYS));
    // Whole rands, in cents. Money is integer cents everywhere in this system.
    const amountCents = between(25, 900) * 10_000;

    const doc = await Donation.create({
      donor: donor._id,
      campaign: campaign._id,
      amountCents,
      method: pick(['EFT', 'CASH', 'CARD']),
      status: 'SETTLED',
      receivedAt: settledAt,
      settledAt,
      capturedBy: actor._id,
      notes: 'DEMO DATA — not a real donation.',
    });
    await backdate(Donation, doc._id, settledAt);
    donations.push({ doc, settledAt, amountCents });
  }
  await record(manifest, 'donations', donations.map((d) => d.doc._id));
  await Campaign.updateOne(
    { _id: campaign._id },
    { $inc: { raisedCents: donations.reduce((t, d) => t + d.amountCents, 0) } }
  );
  log.info({ created: donations.length }, 'donations');

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
      { key: 'beneficiaries.active', value: beneficiaries.filter((b) => upTo(b.registeredAt)).length },
      { key: 'beneficiaries.pending_verification', value: beneficiaries.filter((b) => upTo(b.registeredAt) && b.doc.status === 'PENDING_VERIFICATION').length },
      { key: 'permits.expiring_30d', value: beneficiaries.filter((b) => upTo(b.registeredAt) && b.doc.immigration?.permitExpiresAt).length },

      { key: 'cases.open', value: cases.filter((c) => upTo(c.openedAt) && !(c.closure?.closedAt && c.closure.closedAt.getTime() < to)).length },
      { key: 'cases.escalated', value: cases.filter((c) => upTo(c.openedAt) && ['HIGH', 'URGENT'].includes(c.priority) && !(c.closure?.closedAt && c.closure.closedAt.getTime() < to)).length },
      { key: 'cases.closed', value: cases.filter((c) => c.closure?.closedAt && c.closure.closedAt.getTime() >= from && c.closure.closedAt.getTime() < to).length },

      { key: 'service_requests.open', value: requests.filter((r) => upTo(r.createdAt) && !(r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() < to)).length },
      { key: 'service_requests.overdue', value: requests.filter((r) => upTo(r.createdAt) && !(r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() < to) && r.dueAt && r.dueAt.getTime() < to).length },
      { key: 'service_requests.resolved', value: requests.filter((r) => r.resolution?.resolvedAt && r.resolution.resolvedAt.getTime() >= from && r.resolution.resolvedAt.getTime() < to).length },

      { key: 'donations.settled_count', value: donations.filter((d) => d.settledAt.getTime() >= from && d.settledAt.getTime() < to).length },
      { key: 'donations.settled_value', value: donations.filter((d) => d.settledAt.getTime() >= from && d.settledAt.getTime() < to).reduce((t, d) => t + d.amountCents, 0) },
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

  await mongoose.connection.db.collection(MANIFEST).insertOne({
    createdAt: new Date(),
    records: manifest,
    metricDates: dates,
  });

  return { records: manifest.length, days: dates.length };
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
    const { records, days } = await build();
    log.info({ records, days }, 'demo data created');
    console.log(
      `\n  Created ${records} demo records and ${days} days of derived metrics.` +
        `\n  Every beneficiary surname ends in "(demo)".` +
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
