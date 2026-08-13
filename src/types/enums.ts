/*
 * Mirror of src/server/config/constants.js.
 *
 * These are wire values, not display strings — the API accepts and returns exactly
 * these tokens, so the arrays below are the client's copy of a server contract. When
 * a constant changes on the server, it changes here in the same commit or the two
 * silently disagree: a select with a stale option produces a 422 the user cannot fix.
 *
 * Labels live alongside their values so a dropdown and a table cell can never render
 * the same code two different ways.
 */

export const ROLES = [
  'EXECUTIVE_DIRECTOR',
  'ADMIN_OFFICER',
  'PROJECT_COORDINATOR',
  'FINANCE_OFFICER',
  'COMMS_OFFICER',
  'ME_OFFICER',
  'PEER_LEADER',
  'VOLUNTEER',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  EXECUTIVE_DIRECTOR: 'Executive Director',
  ADMIN_OFFICER: 'Admin Officer',
  PROJECT_COORDINATOR: 'Project Coordinator',
  FINANCE_OFFICER: 'Finance Officer',
  COMMS_OFFICER: 'Communications Officer',
  ME_OFFICER: 'Monitoring & Evaluation Officer',
  PEER_LEADER: 'Peer Community Leader',
  VOLUNTEER: 'Volunteer',
};

/**
 * Where to land someone after sign-in.
 *
 * The server sends this as `dashboard` on every completed sign-in, and that value is
 * what the app uses. This table is the fallback for a cold reload, where /me is the
 * only call made — keep the two in step. Either way it is a landing route, never an
 * authorisation decision: every dashboard's data is permission-guarded server-side.
 */
export const DASHBOARD_BY_ROLE: Record<Role, string> = {
  EXECUTIVE_DIRECTOR: '/dashboard/executive',
  ADMIN_OFFICER: '/dashboard/admin',
  PROJECT_COORDINATOR: '/dashboard/programmes',
  FINANCE_OFFICER: '/dashboard/finance',
  COMMS_OFFICER: '/dashboard/communications',
  ME_OFFICER: '/dashboard/monitoring-evaluation',
  PEER_LEADER: '/dashboard/community',
  VOLUNTEER: '/dashboard/volunteer',
};

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// --- programmes -------------------------------------------------------------

export const PROGRAMME_PILLARS = [
  'ADVOCACY_DOCUMENTATION',
  'SKILLS_ENTREPRENEURSHIP',
  'EDUCATION',
  'SOCIAL_COHESION',
  'WOMEN_YOUTH_EMPOWERMENT',
] as const;
export type ProgrammePillar = (typeof PROGRAMME_PILLARS)[number];

export const PILLAR_LABELS: Record<ProgrammePillar, string> = {
  ADVOCACY_DOCUMENTATION: 'Advocacy & Documentation',
  SKILLS_ENTREPRENEURSHIP: 'Skills & Entrepreneurship',
  EDUCATION: 'Education',
  SOCIAL_COHESION: 'Social Cohesion',
  WOMEN_YOUTH_EMPOWERMENT: 'Women & Youth Empowerment',
};

// --- beneficiaries ----------------------------------------------------------

export const GENDERS = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
  UNDISCLOSED: 'Prefer not to say',
};

/**
 * `UNDOCUMENTED` is not an edge case — it is a large share of the people NWHR serves.
 * No form in this app may require a permit number.
 */
export const IMMIGRATION_STATUSES = [
  'ASYLUM_SEEKER',
  'REFUGEE',
  'PERMANENT_RESIDENT',
  'WORK_VISA',
  'STUDY_VISA',
  'SA_CITIZEN',
  'UNDOCUMENTED',
  'OTHER',
] as const;
export type ImmigrationStatus = (typeof IMMIGRATION_STATUSES)[number];

export const IMMIGRATION_STATUS_LABELS: Record<ImmigrationStatus, string> = {
  ASYLUM_SEEKER: 'Asylum seeker (s22)',
  REFUGEE: 'Refugee (s24)',
  PERMANENT_RESIDENT: 'Permanent resident',
  WORK_VISA: 'Work visa',
  STUDY_VISA: 'Study visa',
  SA_CITIZEN: 'South African citizen',
  UNDOCUMENTED: 'Undocumented',
  OTHER: 'Other',
};

export const INTAKE_CHANNELS = [
  'WALK_IN',
  'WHATSAPP',
  'REFERRAL',
  'PHONE',
  'WEB',
  'FACEBOOK',
  'INSTAGRAM',
  'OUTREACH',
] as const;
export type IntakeChannel = (typeof INTAKE_CHANNELS)[number];

export const INTAKE_CHANNEL_LABELS: Record<IntakeChannel, string> = {
  WALK_IN: 'Walk-in',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  PHONE: 'Phone',
  WEB: 'Website',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  OUTREACH: 'Outreach',
};

export const BENEFICIARY_STATUSES = [
  'DRAFT',
  'PENDING_VERIFICATION',
  'ACTIVE',
  'INACTIVE',
  'EXITED',
  'REJECTED',
] as const;
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number];

export const BENEFICIARY_STATUS_LABELS: Record<BeneficiaryStatus, string> = {
  DRAFT: 'Draft',
  PENDING_VERIFICATION: 'Pending verification',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  EXITED: 'Exited',
  REJECTED: 'Rejected',
};

/**
 * How consent was obtained, so it can be evidenced to the Information Regulator.
 *
 * Mirrors the inline enum on `consentSchema` in beneficiary.model.js rather than
 * constants.js, which is where the server happens to declare it — noted because a
 * reader looking for the source of truth will check constants.js first and not find it.
 */
export const CONSENT_METHODS = ['WHATSAPP', 'SIGNED_FORM', 'VERBAL_WITNESSED'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  WHATSAPP: 'Agreed on WhatsApp',
  SIGNED_FORM: 'Signed form',
  VERBAL_WITNESSED: 'Verbal, witnessed',
};

/**
 * Held `select: false` server-side and readable only with `beneficiary:read_sensitive`,
 * which writes an audit entry. This list describes the most damaging facts in the
 * system — nothing may render it outside a SensitivePanel.
 */
export const VULNERABILITY_FLAGS = [
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
] as const;
export type VulnerabilityFlag = (typeof VULNERABILITY_FLAGS)[number];

/**
 * Written the way a caseworker would say it aloud to the person sitting opposite them.
 *
 * `humanise()` would render GBV_SURVIVOR as "Gbv survivor" and TORTURE_SURVIVOR as
 * "Torture survivor" — the first is wrong and the second reads as a category rather than
 * a person. These describe the worst thing that has happened to someone, so they are
 * spelled out rather than derived.
 */
export const VULNERABILITY_FLAG_LABELS: Record<VulnerabilityFlag, string> = {
  UNACCOMPANIED_MINOR: 'Unaccompanied minor',
  SEPARATED_CHILD: 'Separated child',
  GBV_SURVIVOR: 'Survivor of gender-based violence',
  TRAFFICKING_SURVIVOR: 'Survivor of trafficking',
  TORTURE_SURVIVOR: 'Survivor of torture',
  DISABILITY: 'Living with a disability',
  CHRONIC_ILLNESS: 'Chronic illness',
  PREGNANT_OR_NURSING: 'Pregnant or nursing',
  ELDERLY: 'Older person',
  CHILD_HEADED_HOUSEHOLD: 'Child-headed household',
  SINGLE_PARENT: 'Single parent',
  HOMELESS: 'Without shelter',
  STATELESS: 'Stateless',
};

// --- casework ---------------------------------------------------------------

export const SERVICE_CATEGORIES = [
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
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  LEGAL_DOCUMENTATION: 'Legal & documentation',
  FOOD_ASSISTANCE: 'Food assistance',
  SHELTER: 'Shelter',
  HEALTHCARE: 'Healthcare',
  PSYCHOSOCIAL: 'Psychosocial support',
  GBV_SUPPORT: 'GBV support',
  CHILD_PROTECTION: 'Child protection',
  EDUCATION_PLACEMENT: 'Education placement',
  SKILLS_TRAINING: 'Skills training',
  EMPLOYMENT: 'Employment',
  FAMILY_REUNIFICATION: 'Family reunification',
  FINANCIAL_ASSISTANCE: 'Financial assistance',
  TRANSPORT: 'Transport',
  OTHER: 'Other',
};

export const URGENCY_LEVELS = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const SERVICE_REQUEST_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'REFERRED',
  'CANCELLED',
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  RESOLVED: 'Resolved',
  REFERRED: 'Referred',
  CANCELLED: 'Cancelled',
};

/** Terminal statuses. A request in one of these cannot be transitioned again. */
export const TERMINAL_SERVICE_REQUEST_STATUSES: readonly ServiceRequestStatus[] = [
  'RESOLVED',
  'REFERRED',
  'CANCELLED',
];

// --- staff onboarding --------------------------------------------------------

export const ACCESS_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

// --- notifications -----------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'ACCESS_REQUEST',
  'BENEFICIARY',
  'DONATION',
  'CAMPAIGN',
  'PROGRAMME',
  'REFERRAL',
  'USER',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

// --- languages ----------------------------------------------------------------

/** The four the WhatsApp bot and the public help widget speak. */
export const GUIDE_LANGUAGES = ['en', 'fr', 'sw', 'pt'] as const;
export type GuideLanguage = (typeof GUIDE_LANGUAGES)[number];

export const GUIDE_LANGUAGE_LABELS: Record<GuideLanguage, string> = {
  en: 'English',
  fr: 'Français',
  sw: 'Kiswahili',
  pt: 'Português',
};

/**
 * Wider than GUIDE_LANGUAGES: the bot speaks four, but the register has to describe
 * who actually walks in so a caseworker knows an interpreter is needed.
 */
export const SUPPORTED_LANGUAGES = [
  'en',
  'fr',
  'pt',
  'sw',
  'ln',
  'rw',
  'so',
  'am',
  'ar',
  'sn',
  'nd',
  'ny',
  'tn',
  'zu',
  'xh',
  'st',
  'af',
  'other',
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'French',
  pt: 'Portuguese',
  sw: 'Swahili',
  ln: 'Lingala',
  rw: 'Kinyarwanda',
  so: 'Somali',
  am: 'Amharic',
  ar: 'Arabic',
  sn: 'Shona',
  nd: 'Northern Ndebele',
  ny: 'Chichewa',
  tn: 'Setswana',
  zu: 'isiZulu',
  xh: 'isiXhosa',
  st: 'Sesotho',
  af: 'Afrikaans',
  other: 'Other',
};

// --- misc ---------------------------------------------------------------------

export const CURRENCY = 'ZAR';
export const TIMEZONE = 'Africa/Johannesburg';

/** Server caps `limit` at 100 regardless of what is asked for. */
export const PAGINATION = { DEFAULT_LIMIT: 25, MAX_LIMIT: 100 } as const;

/** Build a `{ value, label }` list for a Select from any of the label maps above. */
export function optionsFrom<T extends string>(
  values: readonly T[],
  labels: Record<T, string>
): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
