import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import * as service from '@/server/modules/auth/accessRequest.service';

/*
 * GET /api/v1/auth/access-requests/options — departments and roles for the public form.
 *
 * Unauthenticated, because the form is. A literal segment always beats the `[id]` sibling
 * in App Router matching, so the Express "static paths before /:id" rule has no equivalent
 * hazard here — but the ordering intent is the same.
 */
export const GET = route({}, async () => success(await service.getAccessRequestOptions()));
