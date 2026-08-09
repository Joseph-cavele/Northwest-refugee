// Shared vocabulary. Anything that more than one module needs to agree on lives here so
// a rename is one edit, not a grep. Permission strings are the exception — those belong
// to permissions.js, which is their single source of truth.

export const ROLES = Object.freeze({
  EXECUTIVE_DIRECTOR: 'EXECUTIVE_DIRECTOR',
  ADMIN_OFFICER: 'ADMIN_OFFICER',
  PROJECT_COORDINATOR: 'PROJECT_COORDINATOR',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  COMMS_OFFICER: 'COMMS_OFFICER',
  ME_OFFICER: 'ME_OFFICER',
  PEER_LEADER: 'PEER_LEADER',
  VOLUNTEER: 'VOLUNTEER',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.EXECUTIVE_DIRECTOR]: 'Executive Director',
  [ROLES.ADMIN_OFFICER]: 'Admin Officer',
  [ROLES.PROJECT_COORDINATOR]: 'Project Coordinator',
  [ROLES.FINANCE_OFFICER]: 'Finance Officer',
  [ROLES.COMMS_OFFICER]: 'Communications Officer',
  [ROLES.ME_OFFICER]: 'Monitoring & Evaluation Officer',
  [ROLES.PEER_LEADER]: 'Peer Community Leader',
  [ROLES.VOLUNTEER]: 'Volunteer',
});

/**
 * Where the SPA sends someone after a successful sign-in.
 *
 * A landing route, NOT an access control decision — every one of these dashboards still
 * enforces its own permissions server-side. Sending a volunteer to /dashboard/finance by
 * editing their local storage gets them an empty screen and a string of 403s, because the
 * role in the access token is what authorize() reads, never the path they asked for.
 */
export const DASHBOARD_BY_ROLE = Object.freeze({
  [ROLES.EXECUTIVE_DIRECTOR]: '/dashboard/executive',
  [ROLES.ADMIN_OFFICER]: '/dashboard/admin',
  [ROLES.PROJECT_COORDINATOR]: '/dashboard/programmes',
  [ROLES.FINANCE_OFFICER]: '/dashboard/finance',
  [ROLES.COMMS_OFFICER]: '/dashboard/communications',
  [ROLES.ME_OFFICER]: '/dashboard/monitoring-evaluation',
  [ROLES.PEER_LEADER]: '/dashboard/community',
  [ROLES.VOLUNTEER]: '/dashboard/volunteer',
});

// Falls back rather than returning undefined: a role added to ROLES without a dashboard
// would otherwise log someone in and strand them on `undefined`.
export function dashboardForRole(role) {
  return DASHBOARD_BY_ROLE[role] ?? '/dashboard';
}

// The five pillars every programme rolls up to. Reporting groups by these, so adding one
// is an organisational decision, not a code tidy-up.
export const PROGRAMME_PILLARS = Object.freeze({
  ADVOCACY_DOCUMENTATION: 'ADVOCACY_DOCUMENTATION',
  SKILLS_ENTREPRENEURSHIP: 'SKILLS_ENTREPRENEURSHIP',
  EDUCATION: 'EDUCATION',
  SOCIAL_COHESION: 'SOCIAL_COHESION',
  WOMEN_YOUTH_EMPOWERMENT: 'WOMEN_YOUTH_EMPOWERMENT',
});

export const PILLAR_LABELS = Object.freeze({
  [PROGRAMME_PILLARS.ADVOCACY_DOCUMENTATION]: 'Advocacy & Documentation',
  [PROGRAMME_PILLARS.SKILLS_ENTREPRENEURSHIP]: 'Skills & Entrepreneurship',
  [PROGRAMME_PILLARS.EDUCATION]: 'Education',
  [PROGRAMME_PILLARS.SOCIAL_COHESION]: 'Social Cohesion',
  [PROGRAMME_PILLARS.WOMEN_YOUTH_EMPOWERMENT]: 'Women & Youth Empowerment',
});

export const CURRENCY = 'ZAR';

// Money is integer cents everywhere below this line — see utils/money.js.
// PLACEHOLDER FIGURES: replace with NWHR's signed delegation-of-authority schedule before
// go-live. A ceiling set too generously silently defeats the escalation rule it exists to
// enforce, and nothing else in the system will notice.
export const APPROVAL_CEILINGS = Object.freeze({
  [ROLES.ADMIN_OFFICER]: 500_000, // R5 000
  [ROLES.PROJECT_COORDINATOR]: 1_000_000, // R10 000
  [ROLES.EXECUTIVE_DIRECTOR]: Number.MAX_SAFE_INTEGER,
  // FINANCE_OFFICER is deliberately absent: they originate spend and may never approve it.
});

// Languages the WhatsApp bot speaks. Keys into whatsapp/prompts.js — a language listed
// here with no prompt entry strands a beneficiary mid-intake.
export const LANGUAGES = Object.freeze(['en', 'fr', 'sw', 'pt']);
export const DEFAULT_LANGUAGE = 'en';

// Languages a beneficiary may be recorded as speaking. Wider than LANGUAGES: the bot
// speaks four, but the register must describe who actually walks in, and a caseworker
// needs to know an interpreter is required.
export const SUPPORTED_LANGUAGES = Object.freeze([
  'en', // English
  'fr', // French
  'pt', // Portuguese
  'sw', // Swahili
  'ln', // Lingala
  'rw', // Kinyarwanda
  'so', // Somali
  'am', // Amharic
  'ar', // Arabic
  'sn', // Shona
  'nd', // Northern Ndebele
  'ny', // Chichewa
  'tn', // Setswana
  'zu', // isiZulu
  'xh', // isiXhosa
  'st', // Sesotho
  'af', // Afrikaans
  'other',
]);

export const GENDER = Object.freeze(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']);

// South African immigration categories. `UNDOCUMENTED` is not an edge case — it is a
// large share of the people NWHR exists to serve, so nothing may require a permit number.
export const IMMIGRATION_STATUS = Object.freeze([
  'ASYLUM_SEEKER', // s22 permit
  'REFUGEE', // s24 permit
  'PERMANENT_RESIDENT',
  'WORK_VISA',
  'STUDY_VISA',
  'SA_CITIZEN',
  'UNDOCUMENTED',
  'OTHER',
]);

export const INTAKE_CHANNELS = Object.freeze([
  'WALK_IN',
  'WHATSAPP',
  'REFERRAL',
  'PHONE',
  'WEB',
  'FACEBOOK',
  'INSTAGRAM',
  'OUTREACH',
]);

export const BENEFICIARY_STATUS = Object.freeze([
  'DRAFT', // intake started, not yet a real record
  'PENDING_VERIFICATION',
  'ACTIVE',
  'INACTIVE',
  'EXITED',
  'REJECTED',
]);

// What a beneficiary can ask for. Codes, not free text, so M&E can count them without
// parsing whatever an officer typed.
export const SERVICE_CATEGORIES = Object.freeze([
  'LEGAL_DOCUMENTATION',
  'FOOD_ASSISTANCE',
  'SHELTER',
  'HEALTHCARE',
  'PSYCHOSOCIAL',
  'GBV_SUPPORT',
  'CHILD_PROTECTION',
  'EDUCATION_PLACEMENT',
  'SKILLS_TRAINING',
  'EMPLOYMENT',
  'FAMILY_REUNIFICATION',
  'FINANCIAL_ASSISTANCE',
  'TRANSPORT',
  'OTHER',
]);

// Which pillar each category reports under. Stored on the request at creation rather than
// derived at read time: re-categorising a service later must not silently rewrite last
// year's donor figures.
export const CATEGORY_PILLAR = Object.freeze({
  LEGAL_DOCUMENTATION: PROGRAMME_PILLARS.ADVOCACY_DOCUMENTATION,
  FAMILY_REUNIFICATION: PROGRAMME_PILLARS.ADVOCACY_DOCUMENTATION,
  SKILLS_TRAINING: PROGRAMME_PILLARS.SKILLS_ENTREPRENEURSHIP,
  EMPLOYMENT: PROGRAMME_PILLARS.SKILLS_ENTREPRENEURSHIP,
  FINANCIAL_ASSISTANCE: PROGRAMME_PILLARS.SKILLS_ENTREPRENEURSHIP,
  EDUCATION_PLACEMENT: PROGRAMME_PILLARS.EDUCATION,
  FOOD_ASSISTANCE: PROGRAMME_PILLARS.SOCIAL_COHESION,
  SHELTER: PROGRAMME_PILLARS.SOCIAL_COHESION,
  TRANSPORT: PROGRAMME_PILLARS.SOCIAL_COHESION,
  HEALTHCARE: PROGRAMME_PILLARS.SOCIAL_COHESION,
  OTHER: PROGRAMME_PILLARS.SOCIAL_COHESION,
  GBV_SUPPORT: PROGRAMME_PILLARS.WOMEN_YOUTH_EMPOWERMENT,
  PSYCHOSOCIAL: PROGRAMME_PILLARS.WOMEN_YOUTH_EMPOWERMENT,
  CHILD_PROTECTION: PROGRAMME_PILLARS.WOMEN_YOUTH_EMPOWERMENT,
});

export const URGENCY_LEVELS = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

// Working days a request may sit before it is overdue. PLACEHOLDER: these drive the
// caseworker queue and any "we responded within X" figure reported to a funder, so they
// need NWHR's actual service standards before go-live.
export const SLA_DAYS_BY_URGENCY = Object.freeze({
  URGENT: 1,
  HIGH: 3,
  NORMAL: 7,
  LOW: 14,
});

export const SERVICE_REQUEST_STATUS = Object.freeze([
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'REFERRED',
  'CANCELLED',
]);

// Drives prioritisation and case assignment. Held select:false and readable only with
// beneficiary:read_sensitive — this list describes the most damaging facts in the system.
export const VULNERABILITY_FLAGS = Object.freeze([
  'UNACCOMPANIED_MINOR',
  'SEPARATED_CHILD',
  'GBV_SURVIVOR',
  'TRAFFICKING_SURVIVOR',
  'TORTURE_SURVIVOR',
  'DISABILITY',
  'CHRONIC_ILLNESS',
  'PREGNANT_OR_NURSING',
  'ELDERLY',
  'CHILD_HEADED_HOUSEHOLD',
  'SINGLE_PARENT',
  'HOMELESS',
  'STATELESS',
]);

// --- staff onboarding ------------------------------------------------------
// A request from someone who wants a staff account. Terminal once reviewed: an admin who
// changes their mind reopens nothing, they invite the person directly instead — so the
// trail always shows which decision was taken on which day.
export const ACCESS_REQUEST_STATUS = Object.freeze(['PENDING', 'APPROVED', 'REJECTED']);

// --- notifications ---------------------------------------------------------
// One Notification collection serves every module. `type` says what kind of record the
// notification is about and therefore which collection `referenceId` points into, so the
// frontend can route a click without a second lookup.
export const NOTIFICATION_TYPES = Object.freeze([
  'ACCESS_REQUEST',
  'BENEFICIARY',
  'DONATION',
  'CAMPAIGN',
  'PROGRAMME',
  'REFERRAL',
  'USER',
  // Carries no referenceId — maintenance windows, job failures, broadcast messages.
  'SYSTEM',
]);

// Drives ordering and badge colour in the bell menu, nothing else. Deliberately distinct
// from URGENCY_LEVELS, which is a caseworker's assessment of a beneficiary's need: an
// URGENT service request and an URGENT notification are not the same claim.
export const NOTIFICATION_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

// Caps exist so nobody can dump the beneficiary register with ?limit=100000.
export const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
});

// Cron jobs and every human-facing timestamp are South African local time.
export const TIMEZONE = 'Africa/Johannesburg';
