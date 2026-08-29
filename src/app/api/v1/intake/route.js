import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import { intakeLimiter } from '@/server/http/rateLimit';
import * as service from '@/server/modules/beneficiaries/beneficiary.service';
import { publicIntakeSchema } from '@/server/modules/beneficiaries/beneficiary.schema';

/**
 * POST /api/v1/intake — somebody registering themselves at /get-help.
 *
 * PUBLIC, AND THE SECOND UNAUTHENTICATED WRITE IN THE SYSTEM. The first is
 * `auth/access-requests`, which only sends an email; this one writes a person into the
 * register. Three things carry that weight:
 *
 *   the schema    `publicIntakeSchema` refuses permit numbers, vulnerability flags, programme
 *                 assignment and status outright — see its header. A field absent from the
 *                 schema cannot be smuggled in by adding it to the body.
 *   the service   `submitPublicIntake` decides the channel, the consent method and the
 *                 capturer rather than believing the caller about any of them.
 *   the limiter   five an hour from one address, because the abuse shape here is a queue
 *                 filled with invented people rather than data stolen.
 *
 * IT IS NOT UNDER /beneficiaries ON PURPOSE. That path is permission-gated end to end, and a
 * public sibling sitting inside it is how somebody later adds a route to the same directory
 * and assumes the guard from its neighbours. This one names itself.
 *
 * The response carries the reference code and nothing else. A person needs it to ask about
 * their own request at the desk; anything more would echo the whole submission back over an
 * unauthenticated channel.
 */
export const POST = route({ body: publicIntakeSchema }, async ({ body, ctx }) => {
  intakeLimiter.check(`intake:${ctx.ip}`);
  return created(await service.submitPublicIntake(body, ctx));
});
