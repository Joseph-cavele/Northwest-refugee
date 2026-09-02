import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

/*
 * PUT, not PATCH, and the whole answer set at once.
 *
 * A screening form is filled in over minutes with a person sitting opposite, so a
 * per-question endpoint would write a partial record on every pause and leave the officer
 * unsure what had saved. The whole set replaces the whole set, which also means an answer
 * cleared in the UI is actually cleared rather than lingering from an earlier save.
 *
 * Each value is checked against the FROZEN form before it is written — a date question gets
 * a date, a dropdown gets one of its own options — because only the screening knows what
 * type each question is. An answer to a question not on the form is dropped rather than
 * stored: nothing would ever render it back.
 */
export const PUT = route(
  {
    permission: PERMISSIONS.SCREENING_CONDUCT,
    params: schema.screeningIdParamSchema,
    body: schema.saveAnswersSchema,
  },
  async ({ params, body, user, ctx }) => success(await service.saveAnswers(params.id, body, user, ctx))
);
