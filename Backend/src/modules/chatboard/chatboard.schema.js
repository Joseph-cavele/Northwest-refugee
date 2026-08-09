import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';

// NOTE: this file is an addition to the documented tree, which lists chatboard as model +
// routes only. It exists because every other module validates with a zod schema and
// inlining these in the routes file would have hidden the ID-number rule below.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

// A South African ID number is 13 consecutive digits. Staff paste them into chat without
// thinking — and a chatboard message is visible to a whole channel, is not scoped to a
// caseload, and has no sensitive-read audit behind it. Refused with a message that says
// what to do instead, rather than silently stored.
//
// Phone numbers (10 local digits) and reference codes (alphanumeric) do not collide.
const SA_ID_NUMBER = /\b\d{13}\b/;

const messageBody = z
  .string({ error: 'A message is required' })
  .trim()
  .min(1, 'A message is required')
  .max(4000, 'Messages are limited to 4000 characters')
  .refine(
    (v) => !SA_ID_NUMBER.test(v),
    'Do not post ID or permit numbers on the chatboard — reference the beneficiary by their NWHR code instead'
  );

export const createChannelSchema = z.object({
  name: z.string({ error: 'A channel name is required' }).trim().min(1, 'A channel name is required').max(80),
  description: z.string().trim().max(300).default(''),
  isPrivate: z.coerce.boolean().default(false),
  members: z.array(objectId('member id')).default([]),
});

export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    members: z.array(objectId('member id')).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  });

export const postMessageSchema = z.object({
  body: messageBody,
  mentions: z.array(objectId('mention id')).max(20, 'Too many mentions').default([]),
});

export const editMessageSchema = z.object({ body: messageBody });

export const channelIdParamSchema = z.object({ id: objectId('channel id') });
export const messageIdParamSchema = z.object({ id: objectId('message id') });

export const listChannelsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  includeArchived: z.coerce.boolean().default(false),
  search: z.string().trim().max(80).optional(),
});

export const listMessagesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
});

export { SA_ID_NUMBER };
