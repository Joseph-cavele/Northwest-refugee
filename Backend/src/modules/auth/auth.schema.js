import { z } from 'zod';
import { ROLES, ACCESS_REQUEST_STATUS, PAGINATION } from '../../config/constants.js';

// Every auth input is validated here and applied with validate({ body }).
// zod 4: `z.email()` is top-level, and custom messages use `error:` — not the zod 3
// `required_error` / `errorMap`.

const email = z.email({ error: 'Enter a valid email address' }).trim().toLowerCase();

// Staff handle minors' identity documents — enforce a real password, not a 4-digit PIN.
// Length dominates (NIST); a letter and a digit are also required.
const strongPassword = z
  .string({ error: 'Password is required' })
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const totpCode = z
  .string({ error: 'Authentication code is required' })
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

// Opaque action tokens (invite/reset) — presence only; validity is checked server-side.
const actionToken = z.string({ error: 'Missing token' }).min(1, 'Missing token');

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// Shape only. normalisePhone() in the service is what decides whether it is a real number
// and rewrites it to E.164 — this just keeps obvious rubbish out.
const phone = z
  .string({ error: 'A phone number is required' })
  .trim()
  .min(6, 'Enter a valid phone number')
  .max(20, 'Enter a valid phone number');

export const loginSchema = z.object({
  email,
  // No password *policy* on login — only the currently stored password matters. Applying
  // the policy here would lock out anyone whose password predates a rule change.
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

export const mfaVerifySchema = z.object({
  challengeToken: z.string({ error: 'Missing challenge token' }).min(1, 'Missing challenge token'),
  code: totpCode,
});

export const acceptInviteSchema = z.object({
  token: actionToken,
  password: strongPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: actionToken,
  password: strongPassword,
});

export const inviteSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(120),
  email,
  role: z.enum(Object.values(ROLES), { error: 'Select a valid role' }),
  departmentId: objectId('department id').nullable().optional(),
});

export const mfaEnableSchema = z.object({ code: totpCode });

// --- change password / profile ----------------------------------------------------

export const changePasswordSchema = z
  .object({
    // No policy on the current password, for the same reason as login: only what is
    // actually stored matters, and a rule added later must not lock anyone out.
    currentPassword: z
      .string({ error: 'Your current password is required' })
      .min(1, 'Your current password is required'),
    newPassword: strongPassword,
  })
  .superRefine((data, ctx) => {
    if (data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Your new password must be different from your current one',
      });
    }
  });

/**
 * Self-service profile edit. Deliberately narrow.
 *
 * `email` is absent because it is the login identifier — changing it is an account
 * takeover primitive, and doing it safely needs a verify-the-new-address round trip.
 * `role`, `department`, `status` and `programmes` are absent because they are the
 * authorisation surface: a user who can PATCH their own role has no role at all.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    phone: phone.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

// --- access requests --------------------------------------------------------------

export const submitAccessRequestSchema = z.object({
  firstName: z.string({ error: 'First name is required' }).trim().min(1, 'First name is required').max(80),
  lastName: z.string({ error: 'Last name is required' }).trim().min(1, 'Last name is required').max(80),
  email,
  phone,
  // What the applicant is asking for. Never granted automatically — an approver names the
  // role that is actually issued.
  requestedRole: z.enum(Object.values(ROLES), { error: 'Select a valid role' }),
  departmentId: objectId('department id'),
  motivation: z.string().trim().max(1000).default(''),
});

export const listAccessRequestsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  status: z.enum(ACCESS_REQUEST_STATUS).optional(),
  search: z.string().trim().max(120).optional(),
  // Oldest first by default so the queue is answered in the order people applied.
  sort: z.enum(['createdAt', '-createdAt']).default('createdAt'),
});

export const approveAccessRequestSchema = z.object({
  // Both optional: approving with an empty body accepts the request as submitted.
  role: z.enum(Object.values(ROLES), { error: 'Select a valid role' }).optional(),
  departmentId: objectId('department id').optional(),
  note: z.string().trim().max(500).optional(),
});

export const rejectAccessRequestSchema = z.object({
  // Required — the applicant is emailed this, and "no reason given" is not an answer.
  reason: z
    .string({ error: 'A reason is required' })
    .trim()
    .min(1, 'A reason is required')
    .max(500),
});

export const accessRequestIdParamSchema = z.object({ id: objectId('access request id') });
