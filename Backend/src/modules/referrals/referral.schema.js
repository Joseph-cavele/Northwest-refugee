import { z } from 'zod';
import { SERVICE_CATEGORIES, URGENCY_LEVELS, PAGINATION } from '../../config/constants.js';
import { normalisePhone } from '../../utils/phone.js';
import {
  REFERRAL_STATUS,
  REFERRAL_DIRECTION,
  ORGANISATION_TYPES,
  SHARING_CONSENT_METHODS,
} from './referral.model.js';

// Defaults live on the create schema only. zod keeps `.default()` through `.partial()`, so
// a shared field set carrying defaults would make an empty PATCH parse to a body full of
// default values and quietly reset urgency and the reason.
//
// zod 4: `z.email()` and `z.iso.date()` are top-level, and custom messages use `error:`.

const objectId = (label = 'id') =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// Shape only — normalisePhone() decides whether it is a real number, because a partner's
// switchboard is typed off a letterhead as '(014) 592 0000' as often as not.
const optionalPhone = z
  .string()
  .trim()
  .transform((value) => normalisePhone(value))
  .refine((value) => value !== null, 'Enter a valid phone number, e.g. 014 592 0000')
  .nullable()
  .optional();

const optionalEmail = z
  .email({ error: 'Enter a valid email address' })
  .trim()
  .toLowerCase()
  .nullable()
  .optional();

const reason = z.string().trim().max(2000, 'The reason must be at most 2000 characters');
const notes = z.string().trim().max(2000, 'Notes must be at most 2000 characters');

// Contact details drift; who the referral is TO does not. Splitting them here is what lets
// the update schema accept the first without ever accepting the second.
const organisationContact = z.object({
  contactPerson: z.string().trim().max(120, 'Name must be at most 120 characters').nullable().optional(),
  phone: optionalPhone,
  email: optionalEmail,
});

const organisation = organisationContact.extend({
  name: z
    .string({ error: 'The organisation is required' })
    .trim()
    .min(1, 'The organisation is required')
    .max(200, 'The organisation must be at most 200 characters'),
  type: z.enum(ORGANISATION_TYPES, { error: 'Select the kind of organisation' }),
});

/**
 * Consent to disclose this person's information to the organisation named above.
 *
 * `given` is a literal true rather than a boolean: there is no such thing as referring
 * someone with consent recorded as false, and accepting the field at all would let a
 * client send it. A refusal is recorded by not creating the referral.
 */
const informationSharing = z.object({
  given: z.literal(true, { error: 'Record the consent to share this information' }),
  method: z.enum(SHARING_CONSENT_METHODS, { error: 'Select how consent was obtained' }),
  policyVersion: z.string().trim().min(1).max(20).default('1.0'),
});

const fields = z.object({
  beneficiary: objectId('beneficiary id'),
  case: objectId('case id').nullable().optional(),
  serviceRequest: objectId('service request id').nullable().optional(),
  direction: z.enum(REFERRAL_DIRECTION, { error: 'Select a direction' }).optional(),
  organisation,
  category: z.enum(SERVICE_CATEGORIES, { error: 'Select what the referral is for' }),
  urgency: z.enum(URGENCY_LEVELS, { error: 'Select an urgency' }).optional(),
  reason: reason.optional(),
  programme: objectId('programme id').nullable().optional(),
});

export const createReferralSchema = fields
  .extend({
    direction: z.enum(REFERRAL_DIRECTION, { error: 'Select a direction' }).default('OUTBOUND'),
    urgency: z.enum(URGENCY_LEVELS, { error: 'Select an urgency' }).default('NORMAL'),
    reason: reason.default(''),
    informationSharing: informationSharing.optional(),
  })
  .superRefine((data, ctx) => {
    // The model enforces this too. It is repeated here so the caller gets a field-keyed
    // 422 they can render against the consent checkbox, rather than a mongoose error.
    if (data.direction === 'OUTBOUND' && !data.informationSharing) {
      ctx.addIssue({
        code: 'custom',
        path: ['informationSharing'],
        message: 'Record consent to share this information before referring someone out',
      });
    }
  });

/**
 * Partial, and never empty.
 *
 * Four things are deliberately unreachable. `beneficiary` — moving a referral to another
 * person rewrites two histories at once. `organisation.name` and `.type` — a referral to a
 * different organisation is a new referral, and editing them in place would quietly repair
 * a partner's decline rate. `status` — transitions have their own endpoint, so an invalid
 * jump is refused rather than written. `informationSharing` — consent is a fact about what
 * happened on a day, not a field to be corrected.
 */
export const updateReferralSchema = fields
  .omit({ beneficiary: true, direction: true, organisation: true })
  .extend({ organisation: organisationContact.optional() })
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const referralIdParamSchema = z.object({ id: objectId('referral id') });

/**
 * A status change, with the evidence that belongs to it.
 *
 * Every terminal state needs a note. A referral that ends without one is a record nobody
 * can account for six months later — and a DECLINED with no reason is precisely the
 * evidence the advocacy pillar exists to collect.
 */
export const transitionReferralSchema = z
  .object({
    status: z.enum(REFERRAL_STATUS, { error: 'Select a valid status' }),
    notes: notes.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'DECLINED' && !data.notes) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Record the reason the organisation gave',
      });
    }
    const needsNote = ['COMPLETED', 'CANCELLED', 'LOST_TO_FOLLOW_UP'];
    if (needsNote.includes(data.status) && !data.notes) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Describe the outcome before closing the referral',
      });
    }
  });

export const listReferralsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  beneficiary: objectId('beneficiary id').optional(),
  case: objectId('case id').optional(),
  serviceRequest: objectId('service request id').optional(),
  status: z.enum(REFERRAL_STATUS).optional(),
  direction: z.enum(REFERRAL_DIRECTION).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  urgency: z.enum(URGENCY_LEVELS).optional(),
  organisationType: z.enum(ORGANISATION_TYPES).optional(),
  programme: objectId('programme id').optional(),
  // The officer's own referrals, without having to know their own id.
  mine: z.coerce.boolean().default(false),
  // Still waiting on an answer — the queue that matters.
  openOnly: z.coerce.boolean().default(false),
  // Past the follow-up date and still open: nobody has chased this.
  overdue: z.coerce.boolean().default(false),
  sort: z
    .enum(['followUpAt', '-followUpAt', 'referredAt', '-referredAt', 'createdAt', '-createdAt'])
    .default('followUpAt'),
  includeDeleted: z.coerce.boolean().default(false),
});
