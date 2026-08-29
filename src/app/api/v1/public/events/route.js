import { route } from '@/server/http/route';
import { paginated } from '@/server/http/respond';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

/*
 * GET /api/v1/public/events — the published events, to anyone who asks.
 *
 * PUBLIC, NO AUTH, and deliberately so, for the same reason `/guide` is: somebody looking
 * for a community meeting, a legal clinic or a skills course must not need an account to
 * find out when it is. Requiring one would exclude exactly the people the organisation
 * exists for.
 *
 * UNDER /public/ RATHER THAN AS AN UNGUARDED /events. The path is the warning label. Every
 * other route under /api/v1/events is permission-gated, and an unauthenticated GET sitting
 * in the middle of them is the kind of thing that survives review by looking ordinary. A
 * separate segment means "no permission here" is a property of the directory a reader can
 * see, not a missing line they have to notice.
 *
 * The service, not this file, is what makes it safe: `listPublicEvents` writes the
 * published-and-not-deleted condition itself, and returns a whitelisted projection rather
 * than the documents. Read the note above it before changing anything here.
 */
export const GET = route({ query: schema.listPublicEventsSchema }, async ({ query }) => {
  const response = paginated(await service.listPublicEvents(query));

  /*
   * A minute of shared cache. Long enough to absorb a burst — a WhatsApp broadcast pointing
   * at the events page is exactly the traffic shape this org produces — short enough that
   * staff publishing something see it live while they are still at the desk that did it.
   * Overrides the no-store default next.config.mjs sets across /api.
   */
  response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return response;
});
