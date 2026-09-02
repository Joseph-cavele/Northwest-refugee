import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/screening/screening.service';
import * as schema from '@/server/modules/screening/screening.schema';

/*
 * Record what happened with one document on the checklist.
 *
 * THIS IS NOT AN UPLOAD ENDPOINT. The file itself goes to /api/v1/documents, which already
 * handles storage, type checking, signed delivery and download auditing; this records the
 * OUTCOME — uploaded, still pending, not available, not applicable — and points at the
 * document when there is one.
 *
 * "Not available" is a first-class answer, not a failure to complete the form. People arrive
 * here without papers, and a screening that cannot record that fact is a screening that
 * cannot be finished for exactly the applicants who need it most.
 */
export const POST = route(
  {
    permission: PERMISSIONS.SCREENING_CONDUCT,
    params: schema.screeningIdParamSchema,
    body: schema.recordDocumentSchema,
  },
  async ({ params, body, user, ctx }) => success(await service.recordDocument(params.id, body, user, ctx))
);
