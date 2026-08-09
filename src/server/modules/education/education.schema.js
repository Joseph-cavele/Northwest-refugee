import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import {
  GRADES, PLACEMENT_STATUS, COOPERATIVE_SECTORS, COOPERATIVE_STATUS, MEMBER_ROLES,
} from './education.model.js';

// Every other module keeps its zod schemas in a `.schema.js`; education is no different.
// The documented tree lists this module as model + routes only, but a service was already
// needed for the layering rule, and burying validation inside the router made the
// document-refusal rule below hard to find.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// --- schemas ----------------------------------------------------------------------
// Defaults on create only: zod carries `.default()` through `.partial()`, so a shared set
// would make an empty PATCH parse to a body full of them.

const schoolFields = z.object({
  name: z.string({ error: 'School name is required' }).trim().min(2, 'School name is required').max(200),
  emisNumber: z.string().trim().max(20).nullable().optional(),
  phase: z.enum(['PRIMARY', 'SECONDARY', 'COMBINED', 'ABET']).nullable().optional(),
});

const refusalFields = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
  // Recorded separately because a refusal on these grounds is unlawful in South Africa.
  dueToLackOfDocuments: z.coerce.boolean().optional(),
  escalatedAt: z.iso.datetime().transform((v) => new Date(v)).nullable().optional(),
});

const placementFields = z.object({
  beneficiary: objectId('beneficiary id'),
  school: schoolFields,
  grade: z.enum(GRADES, { error: 'Select a valid grade' }),
  academicYear: z.coerce.number().int().min(2000).max(2100),
  status: z.enum(PLACEMENT_STATUS, { error: 'Select a valid placement status' }).optional(),
  refusal: refusalFields.optional(),
  notes: z.string().trim().max(2000).optional(),
  programme: objectId('programme id').nullable().optional(),
});

export const createPlacementSchema = placementFields
  .extend({ notes: z.string().trim().max(2000).default('') })
  .superRefine((data, ctx_) => {
    if (data.status === 'REFUSED' && !data.refusal?.reason) {
      ctx_.addIssue({ code: 'custom', path: ['refusal', 'reason'], message: 'Record why admission was refused' });
    }
  });

export const updatePlacementSchema = placementFields
  .omit({ beneficiary: true })
  .partial()
  .superRefine((data, ctx_) => {
    if (Object.keys(data).length === 0) {
      ctx_.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    if (data.status === 'REFUSED' && !data.refusal?.reason) {
      ctx_.addIssue({ code: 'custom', path: ['refusal', 'reason'], message: 'Record why admission was refused' });
    }
  });

export const listPlacementsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  beneficiary: objectId('beneficiary id').optional(),
  status: z.enum(PLACEMENT_STATUS).optional(),
  grade: z.enum(GRADES).optional(),
  academicYear: z.coerce.number().int().min(2000).max(2100).optional(),
  activeOnly: z.coerce.boolean().default(false),
  // The advocacy queue.
  unlawfulRefusalsOnly: z.coerce.boolean().default(false),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['createdAt', '-createdAt', 'academicYear', '-academicYear']).default('-createdAt'),
});

export const memberSchema = z.object({
  beneficiary: objectId('beneficiary id'),
  role: z.enum(MEMBER_ROLES, { error: 'Select a valid member role' }).default('MEMBER'),
});

const cooperativeFields = z.object({
  name: z.string({ error: 'A cooperative name is required' }).trim().min(2, 'A cooperative name is required').max(200),
  sector: z.enum(COOPERATIVE_SECTORS, { error: 'Select a sector' }),
  description: z.string().trim().max(2000).optional(),
  registrationNumber: z.string().trim().max(40).nullable().optional(),
  programme: objectId('programme id').nullable().optional(),
});

export const createCooperativeSchema = cooperativeFields.extend({
  description: z.string().trim().max(2000).default(''),
  members: z.array(memberSchema).max(100).default([]),
});

export const updateCooperativeSchema = cooperativeFields
  .partial()
  .extend({ status: z.enum(COOPERATIVE_STATUS, { error: 'Select a valid status' }).optional() })
  .superRefine((data, ctx_) => {
    if (Object.keys(data).length === 0) {
      ctx_.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const listCooperativesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(COOPERATIVE_STATUS).optional(),
  sector: z.enum(COOPERATIVE_SECTORS).optional(),
  beneficiary: objectId('beneficiary id').optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});

export const idParam = z.object({ id: objectId('id') });
export const memberParam = z.object({ id: objectId('id'), beneficiaryId: objectId('beneficiary id') });

