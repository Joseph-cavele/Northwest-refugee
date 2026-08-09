import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/chatboard/chatboard.service';
import * as schema from '@/server/modules/chatboard/chatboard.schema';

export const GET = route(
  { permission: PERMISSIONS.CHATBOARD_READ, params: schema.channelIdParamSchema },
  async ({ params, user }) => success(await service.getChannel(params.id, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.CHATBOARD_MANAGE, params: schema.channelIdParamSchema, body: schema.updateChannelSchema },
  async ({ params, body, user }) => success(await service.updateChannel(params.id, body, user))
);
