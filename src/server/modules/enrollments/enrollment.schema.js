import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import { ENROLLMENT_STATUS, ATTENDANCE_STATUS } from './enrollment.model.js';

// Defaults on create only: zod carries `.default()` through `.partial()`, so a shared
// field set would make an empty PATCH parse to a body full of them.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const enrollSchema = z.object({
  beneficiary: objectId('beneficiary id'),
  cohort: objectId('cohort id'),
  notes: z.string().trim().max(2000).default(''),
});

/**
 * Partial, never empty.
 *
 * `beneficiary` and `cohort` are omitted: moving an enrolment would rewrite two people's
 * histories, or move someone between cohorts without freeing the seat they held.
 */
export const updateEnrollmentSchema = z
  .object({
    status: z.enum(ENROLLMENT_STATUS, { error: 'Select a valid enrolment status' }).optional(),
    exitReason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
    // "They stopped coming" with no explanation is unusable at review, and drop-out is
    // one of the numbers a funder asks about most.
    if (['WITHDRAWN', 'DROPPED_OUT'].includes(data.status) && !data.exitReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['exitReason'],
        message: 'Record why the participant left',
      });
    }
  });

export const listEnrollmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  beneficiary: objectId('beneficiary id').optional(),
  cohort: objectId('cohort id').optional(),
  programme: objectId('programme id').optional(),
  status: z.enum(ENROLLMENT_STATUS).optional(),
  activeOnly: z.coerce.boolean().default(false),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['enrolledAt', '-enrolledAt', 'createdAt', '-createdAt']).default('-enrolledAt'),
});

/**
 * A register is marked for the whole class at once, so this takes an array. Re-submitting
 * corrects the existing marks rather than adding duplicates.
 */
export const markAttendanceSchema = z.object({
  marks: z
    .array(
      z.object({
        beneficiary: objectId('beneficiary id'),
        status: z.enum(ATTENDANCE_STATUS, { error: 'Select a valid attendance status' }),
        notes: z.string().trim().max(500).optional(),
      })
    )
    .min(1, 'Mark at least one participant')
    .max(500, 'Too many marks in one request')
    .superRefine((marks, ctx) => {
      const ids = marks.map((m) => m.beneficiary);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', message: 'The same person appears twice in this register' });
      }
    }),
});

export const listAttendanceSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(ATTENDANCE_STATUS).optional(),
  sort: z.enum(['recordedAt', '-recordedAt']).default('recordedAt'),
});

export const enrollmentIdParamSchema = z.object({ id: objectId('enrolment id') });
export const sessionIdParamSchema = z.object({ sessionId: objectId('session id') });
export const cohortIdParamSchema = z.object({ cohortId: objectId('cohort id') });
