import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { publicReadLimiter } from '@/server/http/rateLimit';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

/*
 * GET /api/v1/public/events/:id — one published event.
 *
 * PUBLIC, NO AUTH. See the note on the listing beside this file.
 *
 * A DRAFT ANSWERS 404, NOT 403, and the difference matters even here. A 403 would confirm
 * that an event with this id exists and is merely hidden, which is exactly the signal that
 * makes an id worth guessing at. It is the same rule the beneficiary register follows for
 * out-of-scope records, applied to the one endpoint anybody on the internet can call.
 */
export const GET = route({ params: schema.eventIdParamSchema }, async ({ params, ctx }) => {
  /*
   * The same bucket as the listing, deliberately: they are one surface to a caller, and two
   * separate allowances would let a script alternate between them for double the rate.
   */
  publicReadLimiter.check(ctx.ip);

  const response = success(await service.getPublicEvent(params.id));
  response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return response;
});
