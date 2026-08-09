import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/programmes/programme.service';
import * as schema from '@/server/modules/programmes/programme.schema';

export const GET = route(
  { permission: PERMISSIONS.PROGRAMME_READ, params: schema.programmeIdParamSchema },
  async ({ params, user }) => success(await service.getProgrammeById(params.id, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.PROGRAMME_UPDATE, params: schema.programmeIdParamSchema, body: schema.updateProgrammeSchema },
  async ({ params, body, user, ctx }) => success(await service.updateProgramme(params.id, body, user, ctx))
);
