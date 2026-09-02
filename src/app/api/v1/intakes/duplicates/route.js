import { z } from 'zod';
import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/intake/intake.service';

/*
 * POST /api/v1/intakes/duplicates — "have we met this person before?"
 *
 * POST RATHER THAN GET, WITH THE DETAILS IN THE BODY. A GET would put somebody's name,
 * birthday and phone number into a query string, and a query string lands in access logs,
 * browser history and every proxy in between. The same reasoning as /guide/ask.
 *
 * Behind `intake:read` rather than `beneficiary:read`: it returns register records, but only
 * the handful of fields a duplicate check needs, and the people who need to run it are the
 * ones taking applications at the desk.
 */

const searchSchema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  dateOfBirth: z.iso.date().optional(),
  contact: z
    .object({
      cellphone: z.string().trim().max(20).optional(),
      email: z.email().optional(),
    })
    .optional(),
});

export const POST = route(
  { permission: PERMISSIONS.INTAKE_READ, body: searchSchema },
  async ({ body }) => {
    const matches = await service.findPossibleDuplicates(body);
    const response = success(matches);
    // Never cached, anywhere: the request body is somebody's identity and the response says
    // whether this organisation holds a record about them.
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
);
