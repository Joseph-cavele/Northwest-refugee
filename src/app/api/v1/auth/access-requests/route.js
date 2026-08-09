import { route } from '@/server/http/route';
import { success, paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import { passwordResetLimiter, authKey } from '@/server/http/rateLimit';
import * as service from '@/server/modules/auth/accessRequest.service';
import * as schema from '@/server/modules/auth/auth.schema';

/**
 * POST /api/v1/auth/access-requests — request a staff account.
 *
 * The only unauthenticated WRITE in the system. Rate limited with the password-reset
 * limiter deliberately: submitting sends mail to an address the caller chose, which is the
 * same abuse shape as a reset.
 *
 * Answers with an acknowledgement, never the created record — returning the row would
 * confirm one was written, which is exactly what the service works to hide when the
 * address already belongs to a staff member. The sentence is the same every time.
 */
export const POST = route({ body: schema.submitAccessRequestSchema }, async ({ body, ctx }) => {
  passwordResetLimiter.check(authKey(ctx.ip, body.email));
  return success(await service.submitAccessRequest(body, ctx));
});

/** GET /api/v1/auth/access-requests — the review queue. */
export const GET = route(
  { permission: PERMISSIONS.ACCESS_REQUEST_READ, query: schema.listAccessRequestsSchema },
  async ({ query }) => paginated(await service.listAccessRequests(query))
);
