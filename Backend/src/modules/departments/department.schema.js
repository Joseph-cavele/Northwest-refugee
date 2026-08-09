import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// `slug` is not accepted from the client on either path. It is derived from the name at
// creation and then frozen — see the service.

export const createDepartmentSchema = z.object({
  name: z
    .string({ error: 'A department name is required' })
    .trim()
    .min(2, 'A department name is required')
    .max(120),
  description: z.string().trim().max(1000).default(''),
  head: objectId('head of department id').nullable().optional(),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, 'A department name is required').max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    head: objectId('head of department id').nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const listDepartmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(120).optional(),
  // Deactivated departments are hidden by default — they exist to keep history readable,
  // not to be offered in a picker.
  includeInactive: z.coerce.boolean().default(false),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});

export const departmentIdParamSchema = z.object({ id: objectId('department id') });
