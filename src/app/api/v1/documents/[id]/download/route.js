import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/documents/document.service';
import * as schema from '@/server/modules/documents/document.schema';

/*
 * Returns a SIGNED URL rather than proxying the bytes.
 *
 * The URL expires in minutes and is generated per request, so it cannot outlive the
 * permission check behind it — and every call writes a DOCUMENT_DOWNLOADED entry naming
 * the actor. A permit scan is never publicly addressable.
 *
 * Separate from document:read on purpose: listing that a scan exists is not the same as
 * fetching it.
 */
export const GET = route(
  {
    permission: PERMISSIONS.DOCUMENT_DOWNLOAD,
    params: schema.documentIdParamSchema,
    query: schema.downloadQuerySchema,
  },
  async ({ params, query, user, ctx }) =>
    success(await service.getDownloadUrl(params.id, user, ctx, query?.reason))
);
