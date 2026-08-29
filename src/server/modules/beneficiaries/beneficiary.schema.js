import { z } from 'zod';
import {
  GENDER,
  IMMIGRATION_STATUS,
  SUPPORTED_LANGUAGES,
  INTAKE_CHANNELS,
  BENEFICIARY_STATUS,
  VULNERABILITY_FLAGS,
  PAGINATION,
} from '../../config/constants.js';
import { normalisePhone } from '../../utils/phone.js';
import { isMinor } from '../../utils/dates.js';

// Validation for everything entering the beneficiary register. Rules that protect a
// person — consent, guardians for minors — are enforced here AND in the model. The model
// is the guarantee; this layer exists so the caller gets a field-keyed 422 they can render
// against a form, rather than a mongoose error they cannot map.
//
// zod 4: `z.email()` and `z.iso.date()` are top-level, and custom messages use `error:`.
//
// DEFAULTS LIVE ON CREATE ONLY. zod's `.partial()` keeps `.default()` in place, so a
// shared field set carrying defaults would make an empty PATCH parse to a body full of
// default values — silently clearing notes and vulnerability flags on a request that
// asked for nothing. Every field below is therefore declared bare, and createSchema
// re-declares the ones that need a default.
//
// NOTE: permitNumber passes through here in the clear. Never log a parsed body from this
// module — encryption happens at the model layer, not before it.

const objectId = (label = 'id') =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// No character whitelist on names. This register holds Congolese, Somali, Zimbabwean and
// Malawian names — a regex tuned to one alphabet rejects real people.
const personName = (label) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} must be at most 80 characters`);

const phone = (label = 'Phone number') =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .transform((value) => normalisePhone(value))
    .refine((value) => value !== null, `Enter a valid ${label.toLowerCase()}, e.g. 082 123 4567`);

const EARLIEST_DOB = Date.UTC(1900, 0, 1);

// A calendar date, not an instant: parsed at UTC midnight so a date of birth never shifts
// a day because the browser sent local midnight.
const dateOfBirth = z
  .iso.date({ error: 'Enter the date of birth as YYYY-MM-DD' })
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => date.getTime() <= Date.now(), 'Date of birth cannot be in the future')
  .refine((date) => date.getTime() >= EARLIEST_DOB, 'Enter a realistic date of birth');

const optionalDate = z.iso
  .date({ error: 'Enter the date as YYYY-MM-DD' })
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .nullable()
  .optional();

// Reusable field types, so the create and update variants differ only in their defaults.
const addressLine = z.string().trim().max(200);
const shortText = z.string().trim().max(100);
const householdCount = z.coerce.number().int().min(0).max(50);

// --- sub-objects (bare: no defaults) ---------------------------------------------

const immigrationFields = z.object({
  status: z.enum(IMMIGRATION_STATUS, { error: 'Select an immigration status' }),
  // Optional at every status. Undocumented arrivals and asylum seekers still awaiting a
  // s22 permit are precisely the people NWHR serves; requiring a number locks them out.
  permitNumber: z
    .string()
    .trim()
    .max(40, 'Permit number must be at most 40 characters')
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional(),
  permitType: shortText.nullable().optional(),
  permitIssuedAt: optionalDate,
  permitExpiresAt: optionalDate,
});

const contactFields = z.object({
  cellphone: phone('Cellphone number'),
  // Optional: most beneficiaries have WhatsApp, far fewer have email.
  email: z.email({ error: 'Enter a valid email address' }).trim().toLowerCase().nullable().optional(),
  address: addressLine.optional(),
  suburb: shortText.optional(),
  city: shortText.optional(),
  province: shortText.optional(),
});

const householdFields = z.object({
  size: householdCount.min(1, 'Household size must be at least 1').optional(),
  headOfHousehold: z.coerce.boolean().optional(),
  dependants: householdCount.optional(),
});

const guardianFields = z.object({
  fullName: personName('Guardian name'),
  relationship: z
    .string({ error: "Guardian's relationship is required" })
    .trim()
    .min(1, "Guardian's relationship is required")
    .max(60),
  phone: phone('Guardian phone number').nullable().optional(),
  isLegalGuardian: z.coerce.boolean().optional(),
});

const consentFields = z.object({
  // Refused at the edge: a record must never be created for someone who declined. The
  // WhatsApp bot discards the session rather than reaching this endpoint at all.
  given: z.literal(true, { error: 'Consent must be given before a record can be created' }),
  method: z.enum(['WHATSAPP', 'SIGNED_FORM', 'VERBAL_WITNESSED', 'ONLINE_FORM'], {
    error: 'Record how consent was obtained',
  }),
  // Which wording was agreed to. Without it, a later change to the text makes every
  // historical consent unprovable.
  policyVersion: z.string().trim().min(1).max(20).optional(),
  witnessedBy: objectId('witness id').nullable().optional(),
});

// --- shared field set ------------------------------------------------------------

const beneficiaryFields = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  otherNames: z.string().trim().max(120).nullable().optional(),
  gender: z.enum(GENDER, { error: 'Select a gender' }),
  dateOfBirth,
  nationality: z.string({ error: 'Nationality is required' }).trim().min(2, 'Nationality is required').max(60),
  // First entry is the preferred language — it decides which prompts the bot uses and
  // whether an interpreter is needed.
  languages: z
    .array(z.enum(SUPPORTED_LANGUAGES, { error: 'Select a valid language' }))
    .min(1, 'Select at least one language')
    .transform((values) => [...new Set(values)]),
  immigration: immigrationFields,
  contact: contactFields,
  household: householdFields.optional(),
  guardian: guardianFields.nullable().optional(),
  vulnerabilityFlags: z
    .array(z.enum(VULNERABILITY_FLAGS, { error: 'Select a valid vulnerability flag' }))
    .max(VULNERABILITY_FLAGS.length)
    .transform((values) => [...new Set(values)])
    .optional(),
  consent: consentFields,
  intakeChannel: z.enum(INTAKE_CHANNELS, { error: 'Select a valid intake channel' }).optional(),
  programmes: z.array(objectId('programme id')).optional(),
  assignedOfficer: objectId('officer id').nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Cross-field rules. Applied to create and update alike — see the caveat on
 * updateBeneficiarySchema about what a partial body can and cannot see.
 */
function checkCrossFieldRules(data, ctx) {
  // Child protection: refused here so the client can highlight the guardian fields, and
  // again in the model so no other code path can bypass it.
  if (data.dateOfBirth && isMinor(data.dateOfBirth) && !data.guardian?.fullName) {
    ctx.addIssue({
      code: 'custom',
      path: ['guardian'],
      message: 'A beneficiary under 18 requires a recorded guardian',
    });
  }

  const { permitIssuedAt, permitExpiresAt } = data.immigration ?? {};
  if (permitIssuedAt && permitExpiresAt && permitExpiresAt <= permitIssuedAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['immigration', 'permitExpiresAt'],
      message: 'Permit expiry must be after the issue date',
    });
  }

  const { size, dependants } = data.household ?? {};
  if (size !== undefined && dependants !== undefined && dependants > size - 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['household', 'dependants'],
      message: 'Dependants cannot exceed the rest of the household',
    });
  }
}

// --- create ----------------------------------------------------------------------
// `.prefault()` rather than `.default()` on the nested objects: `.default({})` hands back
// the literal `{}` without running it through the schema, so the inner defaults never fire.

export const createBeneficiarySchema = beneficiaryFields
  .extend({
    contact: contactFields.extend({
      address: addressLine.default(''),
      suburb: shortText.default(''),
      city: shortText.default('Rustenburg'),
      province: shortText.default('North West'),
    }),
    household: householdFields
      .extend({
        size: householdCount.min(1, 'Household size must be at least 1').default(1),
        headOfHousehold: z.coerce.boolean().default(false),
        dependants: householdCount.default(0),
      })
      .prefault({}),
    guardian: guardianFields.extend({ isLegalGuardian: z.coerce.boolean().default(true) }).nullable().optional(),
    consent: consentFields.extend({ policyVersion: z.string().trim().min(1).max(20).default('1.0') }),
    vulnerabilityFlags: beneficiaryFields.shape.vulnerabilityFlags.unwrap().default([]),
    intakeChannel: z.enum(INTAKE_CHANNELS, { error: 'Select a valid intake channel' }).default('WALK_IN'),
    programmes: z.array(objectId('programme id')).default([]),
    notes: z.string().trim().max(2000).default(''),
  })
  .superRefine(checkCrossFieldRules);

// --- update ----------------------------------------------------------------------

/**
 * Partial, and never empty — an update carrying no fields is a client bug worth a 422
 * rather than a silent 200.
 *
 * `consent` is omitted deliberately: consent is captured once at intake and withdrawn
 * through its own endpoint. Allowing a general PATCH to rewrite it would let an officer
 * backdate or fabricate a consent record.
 *
 * CAVEAT: the guardian rule can only fire when the patch carries dateOfBirth. A request
 * lowering only the date of birth, or clearing only the guardian, is caught by the model's
 * conditional `required`, which sees the merged document. Do not rely on this layer alone.
 */
export const updateBeneficiarySchema = beneficiaryFields
  .omit({ consent: true })
  .partial()
  .extend({
    status: z.enum(BENEFICIARY_STATUS, { error: 'Select a valid status' }).optional(),
    exitReason: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    checkCrossFieldRules(data, ctx);
  });

// --- list / query ----------------------------------------------------------------

/**
 * Query strings arrive as text, so every scalar is coerced. `limit` is capped: without it
 * one request could dump the entire beneficiary register.
 */
export const listBeneficiariesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // Matches the text index on names and reference code.
  search: z.string().trim().max(120).optional(),
  status: z.enum(BENEFICIARY_STATUS).optional(),
  gender: z.enum(GENDER).optional(),
  immigrationStatus: z.enum(IMMIGRATION_STATUS).optional(),
  nationality: z.string().trim().max(60).optional(),
  intakeChannel: z.enum(INTAKE_CHANNELS).optional(),
  programme: objectId('programme id').optional(),
  assignedOfficer: objectId('officer id').optional(),
  // Feeds the permit-expiry queue: "whose permit lapses in the next 30 days".
  permitExpiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'lastName', '-lastName']).default('-createdAt'),
  // Soft-deleted rows stay hidden unless explicitly asked for.
  includeDeleted: z.coerce.boolean().default(false),
});

// --- targeted actions ------------------------------------------------------------

export const beneficiaryIdParamSchema = z.object({ id: objectId('beneficiary id') });

/**
 * Lookup by permit number. The service hashes this into a blind index — the plaintext is
 * never used in a query, and must never appear in a query string, which is why this is a
 * POST body rather than a GET parameter.
 */
export const permitLookupSchema = z.object({
  permitNumber: z
    .string({ error: 'Permit number is required' })
    .trim()
    .min(3, 'Permit number is required')
    .max(40),
});

/**
 * Why the caller needs the sensitive fields. Optional, but it is written into the
 * SENSITIVE_READ audit entry — an access review is far more useful when the trail says
 * "front desk verification" than when it only says someone looked.
 */
export const sensitiveReadQuerySchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const verifyBeneficiarySchema = z
  .object({
    verified: z.coerce.boolean(),
    // Required on rejection: "rejected" with no reason is unactionable for the next officer.
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.verified === false && !data.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required when rejecting' });
    }
  });

export const assignOfficerSchema = z.object({
  assignedOfficer: objectId('officer id').nullable(),
});

export const exitBeneficiarySchema = z.object({
  exitReason: z
    .string({ error: 'An exit reason is required' })
    .trim()
    .min(1, 'An exit reason is required')
    .max(500),
  exitAt: optionalDate,
});

/**
 * Consent withdrawal. Does NOT delete the record — retention may be legally required —
 * but it must stop further processing, so it is recorded rather than acted on destructively.
 */
export const withdrawConsentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// --- public intake ---------------------------------------------------------------
/*
 * What /get-help is allowed to send. A DELIBERATELY NARROWER SHAPE than
 * createBeneficiarySchema, and every omission is a decision rather than an oversight.
 *
 * NOT ACCEPTED FROM THE PUBLIC, AT ALL:
 *
 *   permitNumber        Encrypted at rest with a blind index, `select: false`, never logged.
 *                       A digit mistyped on a phone becomes an undecryptable lookup key that
 *                       nobody can correct without the document in hand. It is taken at the
 *                       desk, from the permit itself.
 *   vulnerabilityFlags  Reading these inside the dashboard needs `beneficiary:read_sensitive`
 *                       and writes an audit entry. Accepting them on an unauthenticated route
 *                       would let anyone write the most protected category in the system into
 *                       somebody else's record.
 *   programmes,         Assignment is a staff decision. A caller who could set them could
 *   assignedOfficer     enrol a stranger onto a programme or attach them to an officer.
 *   status              Every public intake lands as PENDING_VERIFICATION. Nothing self-
 *                       registered is verified by the act of registering.
 *
 * FORCED SERVER-SIDE, NEVER READ FROM THE BODY: `intakeChannel` is WEB and `consent.method` is
 * ONLINE_FORM, because both describe how the request actually arrived and the sender is not a
 * trustworthy narrator of that. `arrivingBy` below records what the person SAYS they will do —
 * walk in, or come on a referral — which is a different fact and belongs in the notes a
 * caseworker reads, not in the channel field an auditor relies on.
 */
export const publicIntakeSchema = beneficiaryFields
  .omit({
    vulnerabilityFlags: true,
    programmes: true,
    assignedOfficer: true,
    consent: true,
    intakeChannel: true,
  })
  .extend({
    immigration: immigrationFields.omit({ permitNumber: true }),
    contact: contactFields.extend({
      address: addressLine.default(''),
      suburb: shortText.default(''),
      city: shortText.default(''),
      province: shortText.default(''),
    }),
    household: householdFields.optional(),
    notes: z.string().trim().max(2000).default(''),

    /** How the person says they are coming to us. Recorded in the notes, not the channel. */
    arrivingBy: z.enum(['WALK_IN', 'REFERRAL', 'WEB', 'WHATSAPP']).default('WEB'),
    referredBy: z.string().trim().max(120).default(''),

    /*
     * Consent, reduced to the one thing a visitor can actually assert. `given` must be the
     * literal true — the schema refuses the record outright rather than storing a decline,
     * which is the same rule the WhatsApp bot follows by discarding the session.
     */
    consent: z.object({
      given: z.literal(true, { error: 'Consent must be given before a record can be created' }),
      policyVersion: z.string().trim().min(1).max(20).optional(),
    }),
  })
  .superRefine(checkCrossFieldRules);
