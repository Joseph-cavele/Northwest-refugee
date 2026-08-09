import { z } from 'zod';
import { PROGRAMME_PILLARS, PAGINATION } from '../../config/constants.js';
import { PROGRAMME_STATUS, COHORT_STATUS, SESSION_STATUS } from './programme.model.js';

// Defaults live on the create schemas only. zod carries `.default()` through `.partial()`,
// so a shared field set with defaults would make an empty PATCH parse to a body full of
// them and quietly reset a cohort's capacity or a programme's status.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// A date, not an instant: a cohort runs for whole days, so a timezone offset must not
// shift it. Session times are the exception and keep their clock time.
const day = z.iso
  .date({ error: 'Enter the date as YYYY-MM-DD' })
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

const instant = z.iso.datetime({ error: 'Enter a date and time in ISO format' }).transform((v) => new Date(v));

// --- programme -------------------------------------------------------------------

const programmeFields = z.object({
  name: z.string({ error: 'A programme name is required' }).trim().min(2, 'A programme name is required').max(120),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS), { error: 'Select one of the five pillars' }),
  description: z.string().trim().max(2000).optional(),
  coordinators: z.array(objectId('coordinator id')).max(20).optional(),
  startDate: day.nullable().optional(),
  endDate: day.nullable().optional(),
});

function checkDateOrder(data, ctx, startKey = 'startDate', endKey = 'endDate') {
  const start = data[startKey];
  const end = data[endKey];
  if (start && end && end < start) {
    ctx.addIssue({ code: 'custom', path: [endKey], message: 'End date must be on or after the start date' });
  }
}

export const createProgrammeSchema = programmeFields
  .extend({
    description: z.string().trim().max(2000).default(''),
    coordinators: z.array(objectId('coordinator id')).max(20).default([]),
  })
  .superRefine((data, ctx) => checkDateOrder(data, ctx));

/**
 * Partial, never empty.
 *
 * `pillar` is accepted here but the service refuses it once a programme has left PLANNED:
 * moving a live programme between pillars silently rewrites every historical figure that
 * grouped by it.
 */
export const updateProgrammeSchema = programmeFields
  .partial()
  .extend({ status: z.enum(PROGRAMME_STATUS, { error: 'Select a valid status' }).optional() })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    checkDateOrder(data, ctx);
  });

export const listProgrammesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS)).optional(),
  status: z.enum(PROGRAMME_STATUS).optional(),
  search: z.string().trim().max(120).optional(),
  includeArchived: z.coerce.boolean().default(false),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});

// --- cohort ----------------------------------------------------------------------

const cohortFields = z.object({
  name: z.string({ error: 'A cohort name is required' }).trim().min(2, 'A cohort name is required').max(120),
  startDate: day,
  endDate: day,
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(1000).optional(),
  venue: z.string().trim().max(200).optional(),
  facilitator: objectId('facilitator id').nullable().optional(),
});

export const createCohortSchema = cohortFields
  .extend({
    capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(1000).default(30),
    venue: z.string().trim().max(200).default(''),
  })
  .superRefine((data, ctx) => checkDateOrder(data, ctx));

export const updateCohortSchema = cohortFields
  .partial()
  .extend({
    status: z.enum(COHORT_STATUS, { error: 'Select a valid status' }).optional(),
    // Required when cancelling — see the service.
    cancellationReason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    checkDateOrder(data, ctx);
    if (data.status === 'CANCELLED' && !data.cancellationReason) {
      ctx.addIssue({ code: 'custom', path: ['cancellationReason'], message: 'A reason is required when cancelling' });
    }
  });

export const listCohortsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(COHORT_STATUS).optional(),
  // Cohorts still taking enrolments — what an intake officer needs.
  enrollableOnly: z.coerce.boolean().default(false),
  sort: z.enum(['startDate', '-startDate']).default('-startDate'),
});

// --- session ---------------------------------------------------------------------

const sessionFields = z.object({
  title: z.string({ error: 'A session title is required' }).trim().min(2, 'A session title is required').max(200),
  // A clock time, unlike the cohort's whole-day dates.
  scheduledAt: instant,
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  venue: z.string().trim().max(200).optional(),
  facilitator: objectId('facilitator id').nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createSessionSchema = sessionFields.extend({
  durationMinutes: z.coerce.number().int().min(5).max(600).default(60),
  venue: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(2000).default(''),
});

export const updateSessionSchema = sessionFields
  .partial()
  .extend({
    status: z.enum(SESSION_STATUS, { error: 'Select a valid status' }).optional(),
    cancellationReason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    if (data.status === 'CANCELLED' && !data.cancellationReason) {
      ctx.addIssue({ code: 'custom', path: ['cancellationReason'], message: 'A reason is required when cancelling' });
    }
  });

export const listSessionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(SESSION_STATUS).optional(),
  upcomingOnly: z.coerce.boolean().default(false),
  sort: z.enum(['scheduledAt', '-scheduledAt']).default('scheduledAt'),
});

// --- params ----------------------------------------------------------------------

export const programmeIdParamSchema = z.object({ id: objectId('programme id') });
export const cohortIdParamSchema = z.object({ cohortId: objectId('cohort id') });
export const sessionIdParamSchema = z.object({ sessionId: objectId('session id') });
export const programmeCohortParamSchema = z.object({ id: objectId('programme id') });
