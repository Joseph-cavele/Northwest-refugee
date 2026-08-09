import { z } from 'zod';
import { PROGRAMME_PILLARS, PAGINATION } from '../../config/constants.js';
import { toCents } from '../../utils/money.js';
import {
  DONOR_TYPES, CAMPAIGN_STATUS, PLEDGE_STATUS, DONATION_METHODS, DONATION_STATUS, DONATION_TYPES,
} from './fundraising.model.js';

// Amounts arrive as RANDS and are validated here; the service converts with toCents().
// A string is preferred and documented as such — "1.005" is exact, while the number
// 1.005 is already 1.00499999999999989 before this file ever sees it.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const instant = z.iso.datetime({ error: 'Enter a date and time in ISO format' }).transform((v) => new Date(v));

/**
 * A monetary amount in rands. Accepts a string or a number, rejects anything toCents()
 * cannot represent exactly, and leaves the value as given — conversion is the service's
 * job, per the boundary rule in utils/money.js.
 */
const randAmount = (label = 'Amount', { min = 0 } = {}) =>
  z
    .union([z.string(), z.number()], { error: `${label} is required` })
    .superRefine((value, ctx) => {
      let cents;
      try {
        cents = toCents(value);
      } catch (err) {
        ctx.addIssue({ code: 'custom', message: err.message });
        return;
      }
      if (cents < min) {
        ctx.addIssue({ code: 'custom', message: `${label} must be at least R${(min / 100).toFixed(2)}` });
      }
    });

// --- donor ----------------------------------------------------------------------------

const donorFields = z.object({
  name: z.string({ error: 'A donor name is required' }).trim().min(2, 'A donor name is required').max(200),
  type: z.enum(DONOR_TYPES, { error: 'Select a donor type' }),
  email: z.email({ error: 'Enter a valid email address' }).trim().toLowerCase().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  taxNumber: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).optional(),
  isAnonymous: z.coerce.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createDonorSchema = donorFields.extend({
  address: z.string().trim().max(300).default(''),
  isAnonymous: z.coerce.boolean().default(false),
  notes: z.string().trim().max(2000).default(''),
});

export const updateDonorSchema = donorFields.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
  }
});

export const listDonorsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  type: z.enum(DONOR_TYPES).optional(),
  search: z.string().trim().max(120).optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['name', '-name', 'totalGivenCents', '-totalGivenCents', '-lastGiftAt']).default('name'),
});

// --- campaign -------------------------------------------------------------------------

const campaignFields = z.object({
  name: z.string({ error: 'A campaign name is required' }).trim().min(2, 'A campaign name is required').max(200),
  description: z.string().trim().max(2000).optional(),
  target: randAmount('Target').optional(),
  startsAt: instant.nullable().optional(),
  endsAt: instant.nullable().optional(),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS)).nullable().optional(),
  programme: objectId('programme id').nullable().optional(),
  // Constrained to https so a campaign page cannot be made to load a hero image over
  // plaintext and trip the browser's mixed-content block.
  featuredImage: z
    .url({ error: 'Enter a valid image URL' })
    .refine((v) => v.startsWith('https://'), 'The image URL must be https')
    .nullable()
    .optional(),
});

function checkDateOrder(data, ctx) {
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A campaign cannot end before it starts' });
  }
}

export const createCampaignSchema = campaignFields
  .extend({ description: z.string().trim().max(2000).default('') })
  .superRefine(checkDateOrder);

export const updateCampaignSchema = campaignFields
  .partial()
  .extend({ status: z.enum(CAMPAIGN_STATUS, { error: 'Select a valid status' }).optional() })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    checkDateOrder(data, ctx);
  });

export const listCampaignsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(CAMPAIGN_STATUS).optional(),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS)).optional(),
  openOnly: z.coerce.boolean().default(false),
  sort: z.enum(['name', '-name', '-raisedCents', '-endsAt']).default('name'),
});

// --- pledge ---------------------------------------------------------------------------

export const createPledgeSchema = z.object({
  donor: objectId('donor id'),
  campaign: objectId('campaign id').nullable().optional(),
  // A pledge of nothing is not a pledge.
  amount: randAmount('Pledge amount', { min: 1 }),
  dueAt: instant.nullable().optional(),
  notes: z.string().trim().max(2000).default(''),
});

export const updatePledgeSchema = z
  .object({
    status: z.enum(PLEDGE_STATUS, { error: 'Select a valid pledge status' }).optional(),
    dueAt: instant.nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const listPledgesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  donor: objectId('donor id').optional(),
  campaign: objectId('campaign id').optional(),
  status: z.enum(PLEDGE_STATUS).optional(),
  overdue: z.coerce.boolean().default(false),
  sort: z.enum(['dueAt', '-dueAt', '-createdAt']).default('dueAt'),
});

// --- donation -------------------------------------------------------------------------

export const recordDonationSchema = z.object({
  // Absent for a genuinely anonymous gift, such as a cash tin at an event.
  donor: objectId('donor id').nullable().optional(),
  campaign: objectId('campaign id').nullable().optional(),
  pledge: objectId('pledge id').nullable().optional(),
  amount: randAmount('Donation amount', { min: 1 }),
  method: z.enum(DONATION_METHODS, { error: 'Select how the donation was received' }),
  donationType: z.enum(DONATION_TYPES, { error: 'Select a donation type' }).default('ONE_TIME'),
  // The donor's own dedication, quoted back on the receipt. Staff commentary goes in `notes`.
  message: z.string().trim().max(1000).default(''),
  receivedAt: instant.optional(),
  // Supplied when an offline record corresponds to something a gateway also saw; the
  // unique index on it is what stops a later webhook double-counting the same money.
  providerReference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).default(''),
});

export const settleDonationSchema = z.object({
  providerReference: z.string().trim().max(120).optional(),
  settledAt: instant.optional(),
});

export const refundDonationSchema = z.object({
  reason: z
    .string({ error: 'A refund reason is required' })
    .trim()
    .min(1, 'A refund reason is required')
    .max(500),
});

export const listDonationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  donor: objectId('donor id').optional(),
  campaign: objectId('campaign id').optional(),
  status: z.enum(DONATION_STATUS).optional(),
  method: z.enum(DONATION_METHODS).optional(),
  from: instant.optional(),
  to: instant.optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['receivedAt', '-receivedAt', '-amountCents']).default('-receivedAt'),
});

export const idParamSchema = z.object({ id: objectId('id') });
