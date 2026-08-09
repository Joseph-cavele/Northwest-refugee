import { z } from 'zod';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES, PAGINATION } from '../../config/constants.js';

// No create schema: notifications are written by services as a side effect of real events,
// never posted by a client. See notification.service.js.

const objectId = (label) =>
  z.string({ error: `${label} is required` }).regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

export const listNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
  unreadOnly: z.coerce.boolean().default(false),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
});

export const notificationIdParamSchema = z.object({ id: objectId('notification id') });
