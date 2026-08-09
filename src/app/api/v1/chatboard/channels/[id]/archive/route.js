import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/chatboard/chatboard.service';
import * as schema from '@/server/modules/chatboard/chatboard.schema';

export const POST = route(
  { permission: PERMISSIONS.CHATBOARD_MANAGE, params: schema.channelIdParamSchema },
  async ({ params, user }) => success(await service.archiveChannel(params.id, user))
);
