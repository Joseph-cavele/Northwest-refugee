import { z } from 'zod';
import { PROGRAMME_PILLARS, GENDER, PAGINATION } from '../../config/constants.js';
import { AGE_BANDS } from '../../utils/dates.js';
import { EVENT_TYPES, EVENT_STATUS, EVENT_MODES, PUBLICATION_STATUS } from './event.model.js';

// Defaults on create only: zod carries `.default()` through `.partial()`, so a shared
// field set would make an empty PATCH parse to a body full of them.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const instant = z.iso.datetime({ error: 'Enter a date and time in ISO format' }).transform((v) => new Date(v));

const eventFields = z.object({
  title: z.string({ error: 'An event title is required' }).trim().min(2, 'An event title is required').max(200),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(EVENT_TYPES, { error: 'Select an event type' }),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS)).nullable().optional(),
  programme: objectId('programme id').nullable().optional(),
  startsAt: instant,
  endsAt: instant.nullable().optional(),
  venue: z.string().trim().max(200).optional(),
  address: z.string().trim().max(300).optional(),
  expectedAttendance: z.coerce.number().int().min(0).max(100_000).optional(),
  organiser: objectId('organiser id').nullable().optional(),
});

/*
 * The publishable half of an event.
 *
 * `status` IS ABSENT FROM THIS OBJECT AND CANNOT BE SET THROUGH create OR update. Publishing
 * goes through its own endpoint and its own permission, so an officer who may edit an event
 * cannot put it on the public site by including one extra key in a PATCH body. The same
 * reasoning as the register's intake, where `status` is set by the service rather than
 * accepted from the caller.
 *
 * A URL FIELD IS http(s) OR EMPTY, never anything else. These are rendered as links on a
 * public page read by people with good reason to distrust a strange link, and `javascript:`
 * in an href is the oldest trick there is.
 */
const httpUrl = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === '' || /^https:\/\/|^http:\/\//i.test(v), 'Enter a full web address starting with https://');

const publicationFields = z.object({
  imageUrl: z
    .string()
    .trim()
    .max(600)
    .refine(
      (v) => v === '' || /^https?:\/\//i.test(v) || v.startsWith('/'),
      'Enter a full web address, or a path beginning with /'
    )
    .optional(),
  summary: z.string().trim().max(280).optional(),
  mode: z.enum(EVENT_MODES, { error: 'Choose whether this is in person or online' }).optional(),
  onlineUrl: httpUrl.optional(),
  audience: z.string().trim().max(300).optional(),
  registrationInfo: z.string().trim().max(1000).optional(),
  registrationUrl: httpUrl.optional(),
  contact: z.string().trim().max(300).optional(),
});

function checkTimeOrder(data, ctx) {
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'An event cannot end before it starts' });
  }
}

export const createEventSchema = eventFields
  .extend({
    publication: publicationFields.optional(),
    description: z.string().trim().max(2000).default(''),
    venue: z.string().trim().max(200).default(''),
    address: z.string().trim().max(300).default(''),
    expectedAttendance: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .superRefine(checkTimeOrder);

export const updateEventSchema = eventFields
  .partial()
  .extend({
    publication: publicationFields.optional(),
    status: z.enum(EVENT_STATUS, { error: 'Select a valid status' }).optional(),
    cancellationReason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    checkTimeOrder(data, ctx);
    if (data.status === 'CANCELLED' && !data.cancellationReason) {
      ctx.addIssue({ code: 'custom', path: ['cancellationReason'], message: 'A reason is required when cancelling' });
    }
  });

export const listEventsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  type: z.enum(EVENT_TYPES).optional(),
  status: z.enum(EVENT_STATUS).optional(),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS)).optional(),
  programme: objectId('programme id').optional(),
  upcomingOnly: z.coerce.boolean().default(false),
  from: instant.optional(),
  to: instant.optional(),
  search: z.string().trim().max(120).optional(),
  includeDeleted: z.coerce.boolean().default(false),
  /* Staff-side filter: "show me what is still a draft". Never applied to the public query,
     which is not a filter but a hard condition — see listPublicEvents. */
  publication: z.enum(PUBLICATION_STATUS).optional(),
  sort: z.enum(['startsAt', '-startsAt']).default('-startsAt'),
});

/*
 * Publishing, as its own body rather than a PATCH field.
 *
 * An explicit boolean and not a toggle: a toggle sent twice by an impatient click, or
 * replayed by a retry, lands in the opposite state from the one the officer chose. `publish`
 * states the intended end state, so sending it twice is harmless.
 */
export const publishEventSchema = z.object({
  publish: z.boolean({ error: 'Say whether to publish or unpublish' }),
});

/*
 * The public listing's query. Deliberately small — no status filter, no programme, no
 * pillar, nothing that could be used to probe what is not published. Everything a visitor
 * may narrow by is here, and that is the whole surface.
 */
export const listPublicEventsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  mode: z.enum(EVENT_MODES).optional(),
  /* Upcoming first by default; `past: true` is how the page offers an archive without
     letting a caller construct an arbitrary date range. */
  past: z.coerce.boolean().default(false),
});

/**
 * One attendance row.
 *
 * Either a known beneficiary, or an anonymous demographic count — never a name on its
 * own. Contact details require `consentToContact`, checked here and again in the service,
 * because a walk-in at a community event has consented to nothing.
 */
const participantSchema = z
  .object({
    beneficiary: objectId('beneficiary id').optional(),
    gender: z.enum(GENDER).default('UNDISCLOSED'),
    ageBand: z.enum(AGE_BANDS).nullable().optional(),
    isFirstTime: z.coerce.boolean().default(false),
    consentToContact: z.coerce.boolean().default(false),
    contactName: z.string().trim().max(120).optional(),
    contactPhone: z.string().trim().max(20).optional(),
  })
  .superRefine((data, ctx) => {
    const hasContactDetails = Boolean(data.contactName || data.contactPhone);
    if (hasContactDetails && !data.consentToContact) {
      ctx.addIssue({
        code: 'custom',
        path: ['consentToContact'],
        message: 'Contact details may only be recorded when the person has consented to be contacted',
      });
    }
    if (data.beneficiary && hasContactDetails) {
      // Their details are already on their own record, under the consent captured there.
      ctx.addIssue({
        code: 'custom',
        path: ['contactName'],
        message: 'Do not re-record contact details for someone already on the register',
      });
    }
  });

/** Registers are captured for the whole room at once. */
export const recordParticipantsSchema = z.object({
  participants: z
    .array(participantSchema)
    .min(1, 'Record at least one participant')
    .max(500, 'Too many participants in one request')
    .superRefine((rows, ctx) => {
      const known = rows.map((r) => r.beneficiary).filter(Boolean);
      if (new Set(known).size !== known.length) {
        ctx.addIssue({ code: 'custom', message: 'The same person appears twice in this register' });
      }
    }),
});

export const listParticipantsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  gender: z.enum(GENDER).optional(),
  knownOnly: z.coerce.boolean().default(false),
  sort: z.enum(['recordedAt', '-recordedAt']).default('recordedAt'),
});

export const eventIdParamSchema = z.object({ id: objectId('event id') });
