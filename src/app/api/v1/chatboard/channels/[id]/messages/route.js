import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/chatboard/chatboard.service';
import * as schema from '@/server/modules/chatboard/chatboard.schema';

/*
 * Messages containing a 13-digit SA ID number are refused, with a message pointing at the
 * beneficiary's NWHR code instead. The staff board is not a place for identity numbers.
 */
export const POST = route(
  { permission: PERMISSIONS.CHATBOARD_POST, params: schema.channelIdParamSchema, body: schema.postMessageSchema },
  async ({ params, body, user }) => created(await service.postMessage(params.id, body, user))
);

export const GET = route(
  { permission: PERMISSIONS.CHATBOARD_READ, params: schema.channelIdParamSchema, query: schema.listMessagesSchema },
  async ({ params, query, user }) => paginated(await service.listMessages(params.id, query, user))
);
