import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { publicReadLimiter } from '@/server/http/rateLimit';
import * as service from '@/server/modules/screening/screening.service';

/*
 * GET /api/v1/public/programmes — what somebody may apply for at /get-help.
 *
 * PUBLIC, NO AUTH, for the same reason the events feed is: a person looking for a skills
 * course must not need an account to find out that it exists.
 *
 * IT IS NOT THE PROGRAMMES LIST. `/api/v1/programmes` is permission-gated and returns
 * budgets, coordinators, enrolment counts and pillars. This returns a name, a description
 * and what somebody needs to bring — the fields a person deciding whether to apply actually
 * reads. The whitelist lives in `listOpenProgrammes`, not here.
 *
 * ONLY PROGRAMMES WITH A PUBLISHED SCREENING FORM APPEAR. Offering one without a form would
 * take an application that nobody can then screen.
 */
export const GET = route({}, async ({ ctx }) => {
  publicReadLimiter.check(ctx.ip);

  const response = success(await service.listOpenProgrammes());
  // Programmes change a few times a term, not a few times an hour.
  response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
  return response;
});
