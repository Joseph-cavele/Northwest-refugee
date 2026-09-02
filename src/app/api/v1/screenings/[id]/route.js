import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

export const GET = route(
  { permission: PERMISSIONS.SCREENING_CONDUCT, params: schema.screeningIdParamSchema },
  async ({ params }) => success(await service.getScreeningById(params.id))
);
