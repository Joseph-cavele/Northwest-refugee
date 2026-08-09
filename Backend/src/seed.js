import env from './config/env.js';
import logger from './config/logger.js';
import { connectDB, disconnectDB } from './config/db.js';
import { ROLES, PROGRAMME_PILLARS, PILLAR_LABELS } from './config/constants.js';
import User from './modules/users/user.model.js';
import Department, { slugify } from './modules/departments/department.model.js';
import { Channel } from './modules/chatboard/chatboard.model.js';
import { Programme } from './modules/programmes/programme.model.js';

// Bootstraps an empty database: the Executive Director account, one channel, and a
// placeholder for the five pillars.
//
// IDEMPOTENT. Re-running finds what already exists and leaves it alone, so this is safe
// to run against a database that is already in use — it will never overwrite a password
// or duplicate an account.
//
//   npm run seed
//
// Not a fixture generator: it creates only what the system cannot start without. Test
// data belongs in tests, where it is torn down again.

const log = logger.child({ module: 'seed' });

/**
 * The first account has to exist before anyone can log in to invite anyone else.
 *
 * No password is set. The account is created in `invited` status with a one-time token,
 * and the link is printed once — a seeded default password is the single most common way
 * a system like this ends up compromised, and it would be in the git history forever.
 */
async function seedExecutiveDirector() {
  const email = (env.SEED_ED_EMAIL ?? 'director@nwhr.org.za').toLowerCase();

  const existing = await User.findOne({ email });
  if (existing) {
    log.info({ email, status: existing.status }, 'Executive Director already exists — left untouched');
    return { user: existing, created: false, inviteLink: null };
  }

  const user = await User.create({
    name: env.SEED_ED_NAME ?? 'Executive Director',
    email,
    role: ROLES.EXECUTIVE_DIRECTOR,
    status: 'invited',
  });

  // Imported lazily so the seed does not pull the whole auth module graph when the
  // account already exists.
  const { Token } = await import('./modules/auth/otp.model.js');
  const raw = await Token.issue({ user: user._id, type: 'invite', ttlMs: 7 * 86_400_000 });
  const inviteLink = `${env.APP_URL}/accept-invite?token=${encodeURIComponent(raw)}`;

  return { user, created: true, inviteLink };
}

/**
 * The five pillars are an organisational fact, not configuration — every programme rolls
 * up to one of them and reporting groups by them.
 *
 * modules/programmes is not built yet, so this only reports what will be needed. It is
 * here rather than absent so the gap is visible at seed time instead of being discovered
 * when the first report comes out empty.
 */
async function seedPillars(createdBy) {
  const pillars = Object.values(PROGRAMME_PILLARS);

  let created = 0;
  for (const pillar of pillars) {
    // Matched on pillar, not name: a renamed programme must not cause a duplicate.
    const exists = await Programme.exists({ pillar, deletedAt: null });
    if (exists) continue;
    await Programme.create({ name: PILLAR_LABELS[pillar], pillar, status: 'ACTIVE', createdBy });
    created += 1;
  }
  return { created, skipped: pillars.length - created };
}

/**
 * The organisational units a staff member can belong to.
 *
 * Needed before anyone can apply for an account: the public access-request form makes the
 * applicant choose one, so an empty collection leaves that form unusable. Named to match
 * how NWHR actually divides its work rather than one-per-role — Programmes covers the
 * coordinators and the M&E function reports separately because funders ask it to.
 *
 * PLACEHOLDER SET: adjust to NWHR's real structure before go-live. Renaming a department
 * later is safe (the slug is frozen at creation); deleting one that staff point at is not.
 */
const DEPARTMENTS = [
  { name: 'Executive Office', description: 'Organisational leadership and governance.' },
  { name: 'Administration', description: 'Staff accounts, records and office administration.' },
  { name: 'Programmes', description: 'Delivery of the five programme pillars.' },
  { name: 'Finance', description: 'Budgets, payments, petty cash and financial reporting.' },
  { name: 'Communications & Marketing', description: 'Campaigns, donor communications and outreach.' },
  { name: 'Monitoring & Evaluation', description: 'Indicators, reporting and programme evaluation.' },
  { name: 'Community Engagement', description: 'Peer community leaders and volunteers.' },
];

async function seedDepartments(createdBy) {
  let created = 0;
  for (const dept of DEPARTMENTS) {
    // Matched on slug, not name: it is the stable key, and the name index is
    // case-insensitive so a near-miss would throw rather than duplicate.
    const slug = slugify(dept.name);
    if (await Department.exists({ slug })) continue;
    await Department.create({ ...dept, slug, createdBy });
    created += 1;
  }
  return { created, skipped: DEPARTMENTS.length - created };
}

/**
 * Put the seeded ED in the Executive Office.
 *
 * Separate from seedExecutiveDirector() because the account has to exist before the
 * departments can be attributed to it. Only ever fills a blank — it must not move an ED
 * whom an administrator has since placed somewhere else.
 */
async function assignExecutiveDirectorDepartment(user) {
  if (user.departmentId) return { assigned: false };

  const executiveOffice = await Department.findOne({ slug: slugify('Executive Office') });
  if (!executiveOffice) return { assigned: false };

  user.departmentId = executiveOffice._id;
  await user.save();
  return { assigned: true };
}

/** A general channel so the board is not an empty screen on first login. */
async function seedGeneralChannel(createdBy) {
  const slug = 'general';
  const existing = await Channel.findOne({ slug });
  if (existing) return { created: false };

  await Channel.create({
    name: 'General',
    slug,
    description: 'Organisation-wide announcements.',
    isPrivate: false,
    members: [createdBy],
    createdBy,
  });
  return { created: true };
}

async function seed() {
  if (env.NODE_ENV === 'production' && !env.SEED_ALLOW_PRODUCTION) {
    // Not a hard block on principle — a first deploy genuinely needs this — but it must
    // be a deliberate act, because the invite link is printed to the logs.
    throw new Error(
      'Refusing to seed in production. Set SEED_ALLOW_PRODUCTION=true if this is a first deploy.'
    );
  }

  await connectDB();

  const ed = await seedExecutiveDirector();
  const depts = await seedDepartments(ed.user._id);
  const edDepartment = await assignExecutiveDirectorDepartment(ed.user);
  const pillars = await seedPillars(ed.user._id);
  const channel = await seedGeneralChannel(ed.user._id);

  log.info(
    {
      executiveDirector: ed.created ? 'created' : 'existing',
      departments: depts,
      executiveDirectorDepartment: edDepartment.assigned ? 'assigned' : 'unchanged',
      pillarProgrammes: pillars,
      generalChannel: channel.created ? 'created' : 'existing',
    },
    'seed complete'
  );

  if (ed.inviteLink) {
    // Printed to stdout, not through the logger: the logger's redact list would strip a
    // token, and this link is the only way to claim the account. It is single-use and
    // expires in 7 days.
    process.stdout.write(
      `\n  Executive Director invite (single use, expires in 7 days):\n  ${ed.inviteLink}\n\n`
    );
  }

  await disconnectDB();
}

// Only self-executes when run directly, so a test can import and call seed() itself.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('seed.js');
if (invokedDirectly) {
  seed()
    .then(() => process.exit(0))
    .catch(async (err) => {
      log.fatal({ err }, 'seed failed');
      await disconnectDB().catch(() => {});
      process.exit(1);
    });
}

export {
  seed,
  seedExecutiveDirector,
  seedDepartments,
  assignExecutiveDirectorDepartment,
  seedPillars,
  seedGeneralChannel,
};
export default seed;
