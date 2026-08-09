import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/programmes/programme.service';
import * as schema from '@/server/modules/programmes/programme.schema';

export const PATCH = route(
  { permission: PERMISSIONS.PROGRAMME_UPDATE, params: schema.sessionIdParamSchema, body: schema.updateSessionSchema },
  async ({ params, body, user, ctx }) => success(await service.updateSession(params.sessionId, body, user, ctx))
);
