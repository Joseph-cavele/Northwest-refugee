import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/programmes/programme.service';
import * as schema from '@/server/modules/programmes/programme.schema';

/*
 * Cohorts and sessions sit under /programmes but are addressed by their own id, not nested
 * under the programme's. Express needed these declared before /:id so 'cohorts' was not
 * captured as a programme id; the App Router resolves a literal segment ahead of a dynamic
 * one automatically, so the hazard is gone but the URL shape is unchanged.
 */
export const GET = route(
  { permission: PERMISSIONS.PROGRAMME_READ, params: schema.cohortIdParamSchema },
  async ({ params, user }) => success(await service.getCohortById(params.cohortId, user))
);

export const PATCH = route(
  { permission: PERMISSIONS.PROGRAMME_UPDATE, params: schema.cohortIdParamSchema, body: schema.updateCohortSchema },
  async ({ params, body, user, ctx }) => success(await service.updateCohort(params.cohortId, body, user, ctx))
);
