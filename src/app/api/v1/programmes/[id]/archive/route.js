import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/programmes/programme.service';
import * as schema from '@/server/modules/programmes/programme.schema';

/** Archiving retires a pillar's programme without deleting the history hanging off it. */
export const POST = route(
  { permission: PERMISSIONS.PROGRAMME_UPDATE, params: schema.programmeIdParamSchema },
  async ({ params, user, ctx }) => success(await service.archiveProgramme(params.id, user, ctx))
);
