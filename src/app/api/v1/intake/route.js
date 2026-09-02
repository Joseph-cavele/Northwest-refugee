import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import { intakeLimiter } from '@/server/http/rateLimit';
import * as service from '@/server/modules/intake/intake.service';
import { publicIntakeSchema } from '@/server/modules/intake/intake.schema';

/**
 * POST /api/v1/intake — somebody registering themselves at /get-help.
 *
 * IT NO LONGER WRITES TO THE REGISTER, AND THAT IS THE CHANGE. This route used to call
 * `beneficiary.service.submitPublicIntake`, which created a Beneficiary with status
 * PENDING_VERIFICATION — so anyone who filled in the public form was, from that moment, a
 * beneficiary of this organisation. The register therefore answered "everybody who has ever
 * asked us for anything" rather than "the people we work with", and those are different
 * numbers with different meanings to a funder and to a caseworker.
 *
 * It now creates an INTAKE. A screening decides; only an approval creates or links a
 * Beneficiary. `beneficiary.service.submitPublicIntake` is left in place but is no longer
 * called from here.
 *
 * PUBLIC, AND THE SECOND UNAUTHENTICATED WRITE IN THE SYSTEM. The first is
 * `auth/access-requests`, which only sends an email; this one writes a person's details into
 * the intake queue. Three things carry that weight:
 *
 *   the schema    `publicIntakeSchema` refuses source, channel, status, programme assignment
 *                 and the linked beneficiary outright — see its header. A field absent from
 *                 the schema cannot be smuggled in by adding it to the body.
 *   the service   `submitPublicIntake` decides the channel, the consent method and the
 *                 capturer rather than believing the caller about any of them.
 *   the limiter   five an hour from one address, because the abuse shape here is a queue
 *                 filled with invented people rather than data stolen.
 *
 * IT IS NOT UNDER /intakes ON PURPOSE, even though that is where its records land. That path
 * is permission-gated end to end, and a public sibling sitting inside it is how somebody
 * later adds a route to the same directory and assumes the guard from its neighbours. This
 * one names itself, in the singular, and is the only unauthenticated route in the workflow.
 *
 * The response carries the reference code and nothing else. A person needs it to ask about
 * their own request at the desk; anything more would echo the whole submission back over an
 * unauthenticated channel.
 */
export const POST = route({ body: publicIntakeSchema }, async ({ body, ctx }) => {
  intakeLimiter.check(`intake:${ctx.ip}`);
  return created(await service.submitPublicIntake(body, ctx));
});
