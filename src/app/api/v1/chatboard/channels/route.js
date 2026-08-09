import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/chatboard/chatboard.service';
import * as schema from '@/server/modules/chatboard/chatboard.schema';

/*
 * Private channels 404 to non-members — the existence of a channel named "Safeguarding" is
 * itself information. That check lives in the service, where it applies to every path in.
 */
export const POST = route(
  { permission: PERMISSIONS.CHATBOARD_MANAGE, body: schema.createChannelSchema },
  async ({ body, user }) => created(await service.createChannel(body, user))
);

export const GET = route(
  { permission: PERMISSIONS.CHATBOARD_READ, query: schema.listChannelsSchema },
  async ({ query, user }) => paginated(await service.listChannels(query, user))
);
