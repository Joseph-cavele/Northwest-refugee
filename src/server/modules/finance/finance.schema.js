import { z } from 'zod';
import { PROGRAMME_PILLARS, PAGINATION } from '../../config/constants.js';
import { toCents } from '../../utils/money.js';
import { BUDGET_STATUS } from './budget.model.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUS, PAYMENT_METHODS } from './transaction.model.js';
import { MOVEMENT_TYPES, FLOAT_STATUS } from './pettyCash.model.js';

// Amounts arrive as RANDS and are converted by the service with toCents(). Strings are
// preferred and documented as such: "1.005" is exact, while the number 1.005 is already
// 1.00499999999999989 before this file ever sees it.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const instant = z.iso.datetime({ error: 'Enter a date and time in ISO format' }).transform((v) => new Date(v));

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
      // Direction is carried by type, never by sign.
      if (cents < 0) ctx.addIssue({ code: 'custom', message: `${label} must be positive` });
    });

const lineCode = z
  .string({ error: 'A line code is required' })
  .trim()
  .toUpperCase()
  .min(1, 'A line code is required')
  .max(20);

// --- budgets ---------------------------------------------------------------------------

const budgetLine = z.object({
  code: lineCode,
  description: z.string({ error: 'A line description is required' }).trim().min(1).max(200),
  allocated: randAmount('Allocation'),
});

export const createBudgetSchema = z.object({
  name: z.string({ error: 'A budget name is required' }).trim().min(2, 'A budget name is required').max(200),
  financialYear: z.coerce.number().int().min(2000).max(2100),
  programme: objectId('programme id').nullable().optional(),
  pillar: z.enum(Object.values(PROGRAMME_PILLARS)).nullable().optional(),
  lines: z
    .array(budgetLine)
    .min(1, 'A budget needs at least one line')
    .max(200)
    .superRefine((lines, ctx) => {
      const codes = lines.map((l) => l.code);
      if (new Set(codes).size !== codes.length) {
        ctx.addIssue({ code: 'custom', message: 'Line codes must be unique within a budget' });
      }
    }),
  notes: z.string().trim().max(2000).default(''),
});

/**
 * Only a DRAFT budget can be edited, and `status` is not settable here — submission,
 * approval and rejection each have their own endpoint so the maker-checker rule cannot be
 * sidestepped by a PATCH.
 */
export const updateBudgetSchema = createBudgetSchema
  .omit({ financialYear: true })
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const listBudgetsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  financialYear: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(BUDGET_STATUS).optional(),
  programme: objectId('programme id').optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['name', '-name', '-financialYear', '-createdAt']).default('-financialYear'),
});

// --- transactions ----------------------------------------------------------------------

// Kept unwrapped so the update schema can .partial() it. A schema is no longer an object
// type once .superRefine() has wrapped it, and zod 4 offers no way back out.
const transactionFields = z.object({
    type: z.enum(TRANSACTION_TYPES, { error: 'Select a transaction type' }),
    amount: randAmount('Amount', { min: 1 }),
    description: z.string({ error: 'A description is required' }).trim().min(1, 'A description is required').max(500),
    payee: z.string().trim().max(200).default(''),
    method: z.enum(PAYMENT_METHODS).default('EFT'),
    budget: objectId('budget id').nullable().optional(),
    budgetLineCode: lineCode.nullable().optional(),
  notes: z.string().trim().max(2000).default(''),
});

export const createTransactionSchema = transactionFields
  .superRefine((data, ctx) => {
    // An expense that names no line cannot be committed against anything, and would be
    // invisible in every budget-versus-actual report.
    if (data.type === 'EXPENSE' && (!data.budget || !data.budgetLineCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['budgetLineCode'],
        message: 'An expense must name a budget and a budget line',
      });
    }
    // A REVERSAL is only ever created by the reversal endpoint, never raised directly.
    if (data.type === 'REVERSAL') {
      ctx.addIssue({ code: 'custom', path: ['type'], message: 'Use the reverse endpoint to correct a posted entry' });
    }
  });

export const updateTransactionSchema = transactionFields
  .partial()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const rejectSchema = z.object({
  reason: z
    .string({ error: 'A reason is required' })
    .trim()
    .min(1, 'A reason is required')
    .max(500),
});

export const reverseSchema = z.object({
  reason: z
    .string({ error: 'A reason is required for a reversal' })
    .trim()
    .min(1, 'A reason is required for a reversal')
    .max(500),
});

export const listTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  type: z.enum(TRANSACTION_TYPES).optional(),
  status: z.enum(TRANSACTION_STATUS).optional(),
  budget: objectId('budget id').optional(),
  budgetLineCode: lineCode.optional(),
  createdBy: objectId('user id').optional(),
  // Everything waiting on someone else — the approver's queue.
  awaitingApproval: z.coerce.boolean().default(false),
  from: instant.optional(),
  to: instant.optional(),
  includeDeleted: z.coerce.boolean().default(false),
  sort: z.enum(['createdAt', '-createdAt', '-amountCents']).default('-createdAt'),
});

// --- petty cash ------------------------------------------------------------------------

export const createFloatSchema = z.object({
  name: z.string({ error: 'A float name is required' }).trim().min(2, 'A float name is required').max(120),
  custodian: objectId('custodian id'),
  imprest: randAmount('Imprest amount', { min: 1 }),
});

export const updateFloatSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    custodian: objectId('custodian id').optional(),
    imprest: randAmount('Imprest amount', { min: 1 }).optional(),
    status: z.enum(FLOAT_STATUS).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const movementSchema = z.object({
  type: z.enum(MOVEMENT_TYPES, { error: 'Select a movement type' }),
  amount: randAmount('Amount', { min: 1 }),
  description: z.string({ error: 'A description is required' }).trim().min(1, 'A description is required').max(500),
  budget: objectId('budget id').nullable().optional(),
  budgetLineCode: lineCode.nullable().optional(),
});

export const reconcileSchema = z.object({
  counted: randAmount('Counted amount'),
  notes: z.string().trim().max(2000).default(''),
});

export const listMovementsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  type: z.enum(MOVEMENT_TYPES).optional(),
  sort: z.enum(['recordedAt', '-recordedAt']).default('-recordedAt'),
});

export const idParamSchema = z.object({ id: objectId('id') });
