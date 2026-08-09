import { z } from 'zod';
import { SERVICE_CATEGORIES, URGENCY_LEVELS, PAGINATION } from '../../config/constants.js';
import { CASE_STATUS, CLOSURE_OUTCOMES } from './case.model.js';

// Defaults live on the open schema only. zod carries `.default()` through `.partial()`, so
// a shared field set with defaults would make an empty PATCH parse to a body full of them
// and quietly reset priority and summary.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const summary = z.string().trim().max(2000, 'Summary must be at most 2000 characters');

const fields = z.object({
  beneficiary: objectId('beneficiary id'),
  // Optional on open: left out, the person opening the case takes it. Most cases are
  // opened by whoever will work them.
  caseworker: objectId('caseworker id').optional(),
  category: z.enum(SERVICE_CATEGORIES, { error: 'Select a case category' }),
  priority: z.enum(URGENCY_LEVELS, { error: 'Select a priority' }).optional(),
  summary: summary.optional(),
  programme: objectId('programme id').nullable().optional(),
});

export const openCaseSchema = fields.extend({
  priority: z.enum(URGENCY_LEVELS, { error: 'Select a priority' }).default('NORMAL'),
  summary: summary.default(''),
});

/**
 * Partial, and never empty.
 *
 * `beneficiary` is omitted — moving a case to another person would rewrite two people's
 * histories at once. `status` is omitted because closing has its own endpoint, which
 * requires an outcome.
 */
export const updateCaseSchema = fields
  .omit({ beneficiary: true })
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const assignCaseSchema = z.object({
  // Not nullable: a case always has someone answerable for it.
  caseworker: objectId('caseworker id'),
});

/**
 * Closing requires an outcome, and notes for the outcomes that need explaining. A case
 * closed as UNREACHABLE or OTHER with no note is unanswerable at review.
 */
export const closeCaseSchema = z
  .object({
    outcome: z.enum(CLOSURE_OUTCOMES, { error: 'Select a closure outcome' }),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (['UNREACHABLE', 'OTHER', 'DUPLICATE'].includes(data.outcome) && !data.notes) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: `Closing as ${data.outcome} requires a note explaining why`,
      });
    }
  });

export const reopenHoldSchema = z.object({
  status: z.enum(['OPEN', 'ON_HOLD'], { error: 'Status must be OPEN or ON_HOLD' }),
  notes: z.string().trim().max(2000).optional(),
});

export const caseIdParamSchema = z.object({ id: objectId('case id') });

export const listCasesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  beneficiary: objectId('beneficiary id').optional(),
  caseworker: objectId('caseworker id').optional(),
  status: z.enum(CASE_STATUS).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  priority: z.enum(URGENCY_LEVELS).optional(),
  // My caseload, without having to know my own id.
  mine: z.coerce.boolean().default(false),
  // HIGH or URGENT and still open — the queue a supervisor opens first.
  urgent: z.coerce.boolean().default(false),
  // Excludes closed files.
  openOnly: z.coerce.boolean().default(false),
  sort: z.enum(['openedAt', '-openedAt', 'priority', '-priority']).default('-openedAt'),
  includeDeleted: z.coerce.boolean().default(false),
});
