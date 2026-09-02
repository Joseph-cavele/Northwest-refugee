import { z } from 'zod';
import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { publicReadLimiter } from '@/server/http/rateLimit';
import * as service from '@/server/modules/screening/screening.service';

/*
 * GET /api/v1/public/screening-form?programme=… — the questions attached to a programme.
 *
 * THIS IS WHAT MAKES /get-help A SCREENING PAGE. An applicant picks a programme and the form
 * its administrator built loads, so the answers arrive with the application instead of being
 * collected again across a desk. No programme-specific form is written into any page; adding
 * a skills programme is an administrator's afternoon.
 *
 * WHAT IS STRIPPED BEFORE IT LEAVES, and each is a real risk rather than tidiness — see the
 * note above `getPublicScreeningForm`:
 *
 *   the template's status and version   tells an applicant which form is in flux
 *   `required` on a document type       "ID required" stops somebody with no ID applying,
 *                                       which contradicts the office's own position
 *   the assessment section              the screener's questions, not the applicant's
 *   file-upload questions               an unauthenticated page cannot take a file, and the
 *                                       office takes documents at the desk
 *
 * A programme with no published form answers `null` rather than 404: the page then collects
 * the ordinary details, which is a better answer for somebody asking for help than an error.
 */
export const GET = route(
  { query: z.object({ programme: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid programme id') }) },
  async ({ query, ctx }) => {
    publicReadLimiter.check(ctx.ip);

    const response = success(await service.getPublicScreeningForm(query.programme));
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    return response;
  }
);
