import { z } from 'zod';
import {
  SERVICE_CATEGORIES,
  URGENCY_LEVELS,
  SERVICE_REQUEST_STATUS,
  INTAKE_CHANNELS,
  PAGINATION,
} from '../../config/constants.js';

// Defaults live on the create schema only. zod keeps `.default()` through `.partial()`,
// so a shared field set carrying defaults would make an empty PATCH parse to a body full
// of default values and quietly reset urgency and description.

const objectId = (label = 'id') =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const description = z.string().trim().max(2000, 'Description must be at most 2000 characters');

const fields = z.object({
  beneficiary: objectId('beneficiary id'),
  category: z.enum(SERVICE_CATEGORIES, { error: 'Select a service category' }),
  description: description.optional(),
  urgency: z.enum(URGENCY_LEVELS, { error: 'Select an urgency' }).optional(),
  channel: z.enum(INTAKE_CHANNELS, { error: 'Select a valid channel' }).optional(),
  programme: objectId('programme id').nullable().optional(),
  assignedTo: objectId('officer id').nullable().optional(),
});

export const createServiceRequestSchema = fields.extend({
  description: description.default(''),
  urgency: z.enum(URGENCY_LEVELS, { error: 'Select an urgency' }).default('NORMAL'),
  channel: z.enum(INTAKE_CHANNELS, { error: 'Select a valid channel' }).default('WALK_IN'),
});

/**
 * Partial, and never empty.
 *
 * `beneficiary` and `status` are omitted deliberately: moving a request to a different
 * person would rewrite that person's service history, and status changes go through the
 * transition endpoint so an invalid jump is refused rather than written.
 */
export const updateServiceRequestSchema = fields
  .omit({ beneficiary: true })
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const serviceRequestIdParamSchema = z.object({ id: objectId('service request id') });

export const assignServiceRequestSchema = z.object({
  assignedTo: objectId('officer id').nullable(),
});

/**
 * A status change, with the evidence that belongs to it. Resolving without a note leaves
 * the next officer — and any audit — unable to tell what was actually done.
 */
export const transitionServiceRequestSchema = z
  .object({
    status: z.enum(SERVICE_REQUEST_STATUS, { error: 'Select a valid status' }),
    notes: z.string().trim().max(2000).optional(),
    referral: objectId('referral id').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'RESOLVED' && !data.notes) {
      ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Describe how the request was resolved' });
    }
    if (data.status === 'CANCELLED' && !data.notes) {
      ctx.addIssue({ code: 'custom', path: ['notes'], message: 'A reason is required when cancelling' });
    }
    if (data.status === 'REFERRED' && !data.referral) {
      ctx.addIssue({ code: 'custom', path: ['referral'], message: 'A referral record is required' });
    }
  });

export const listServiceRequestsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  beneficiary: objectId('beneficiary id').optional(),
  status: z.enum(SERVICE_REQUEST_STATUS).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  urgency: z.enum(URGENCY_LEVELS).optional(),
  assignedTo: objectId('officer id').optional(),
  programme: objectId('programme id').optional(),
  // The caseworker's own queue, without having to know their own id.
  mine: z.coerce.boolean().default(false),
  // Past due and still open — the queue that matters most.
  overdue: z.coerce.boolean().default(false),
  // Excludes terminal states, so "what is still on my desk" is one flag.
  openOnly: z.coerce.boolean().default(false),
  sort: z.enum(['dueAt', '-dueAt', 'createdAt', '-createdAt']).default('dueAt'),
  includeDeleted: z.coerce.boolean().default(false),
});
