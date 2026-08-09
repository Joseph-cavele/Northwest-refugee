import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/documents/document.service';
import * as schema from '@/server/modules/documents/document.schema';

export const GET = route(
  { permission: PERMISSIONS.DOCUMENT_READ, params: schema.documentIdParamSchema },
  async ({ params, user }) => success(await service.getDocumentById(params.id, user))
);

/*
 * Soft delete only. Admin Officer alone — removing the evidence behind a case file is not
 * something a volunteer or coordinator should be able to do.
 */
export const DELETE = route(
  { permission: PERMISSIONS.DOCUMENT_DELETE, params: schema.documentIdParamSchema },
  async ({ params, user, ctx }) => success(await service.deleteDocument(params.id, user, ctx))
);
