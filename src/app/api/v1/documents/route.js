import { route } from '@/server/http/route';
import { created, paginated } from '@/server/http/respond';
import AppError from '@/server/utils/AppError';
import { PERMISSIONS } from '@/server/config/permissions';
import { readUpload } from '@/server/http/upload';
import * as service from '@/server/modules/documents/document.service';
import * as schema from '@/server/modules/documents/document.schema';

/*
 * POST /api/v1/documents — upload an identity document.
 *
 * `raw: true` because the body is multipart, not JSON: route() must not try to parse it,
 * and the zod schema is applied to the accompanying fields by hand once FormData has been
 * read. The bytes go straight to Cloudinary and are never written to disk — a permit scan
 * on a server filesystem would survive the request, land in a backup, and sit outside every
 * access control in this codebase.
 */
export const POST = route(
  { permission: PERMISSIONS.DOCUMENT_CREATE, raw: true },
  async ({ request, user, ctx }) => {
    const { file, fields } = await readUpload(request);

    const parsed = schema.uploadDocumentSchema.safeParse(fields);
    if (!parsed.success) {
      const details = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.length ? issue.path.join('.') : 'body';
        if (!(key in details)) details[key] = issue.message;
      }
      throw AppError.validationFailed(details);
    }

    return created(await service.uploadDocument(parsed.data, file, user, ctx));
  }
);

export const GET = route(
  { permission: PERMISSIONS.DOCUMENT_READ, query: schema.listDocumentsSchema },
  async ({ query, user }) => paginated(await service.listDocuments(query, user))
);
