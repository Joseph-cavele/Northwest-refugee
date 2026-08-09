import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/chatboard/chatboard.service';
import * as schema from '@/server/modules/chatboard/chatboard.schema';

/*
 * Editing is AUTHOR-ONLY with no manager override — enforced in the service, not here.
 * Deletion allows chatboard:manage to remove anyone's message, and is soft, so the thread
 * still reads in order. Both routes carry chatboard:post because the finer rule is not a
 * permission question; it is a "whose message is this" question.
 */
export const PATCH = route(
  { permission: PERMISSIONS.CHATBOARD_POST, params: schema.messageIdParamSchema, body: schema.editMessageSchema },
  async ({ params, body, user }) => success(await service.editMessage(params.id, body.body, user))
);

export const DELETE = route(
  { permission: PERMISSIONS.CHATBOARD_POST, params: schema.messageIdParamSchema },
  async ({ params, user }) => success(await service.deleteMessage(params.id, user))
);
