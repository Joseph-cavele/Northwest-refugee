import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

/** Aggregated demographics — the shape a funder is shown, with no identities in it. */
export const GET = route(
  { permission: PERMISSIONS.EVENT_READ, params: schema.eventIdParamSchema },
  async ({ params, user }) => success(await service.getAttendanceBreakdown(params.id, user))
);
