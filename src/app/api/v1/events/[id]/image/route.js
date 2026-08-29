import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import { readUpload } from '@/server/http/upload';
import { uploadPublicImage } from '@/server/config/cloudinary';
import AppError from '@/server/utils/AppError';
import * as service from '@/server/modules/events/event.service';
import * as schema from '@/server/modules/events/event.schema';

/*
 * POST /api/v1/events/:id/image — the poster for a public listing.
 *
 * THE ONE UPLOAD IN THIS SYSTEM THAT PRODUCES A PUBLIC URL, and the reason is on
 * `uploadPublicImage`: a signed URL expires, and a page read by visitors who are not logged
 * in cannot re-sign it on every render. Everything else — permit scans, birth certificates —
 * goes through the private path and is never publicly addressable.
 *
 * PDFs ARE REFUSED HERE even though the shared upload helper accepts them. `readUpload`
 * allows the document set (JPEG, PNG, WebP, HEIC, PDF) because that is what a caseworker
 * photographs a permit with. A PDF is not a poster, and a browser handed one in an <img>
 * renders nothing at all.
 *
 * Behind `event:update` rather than `event:publish`: changing the artwork is an edit, and an
 * officer preparing a draft needs to be able to do it before anyone decides to publish.
 */

const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const POST = route(
  { permission: PERMISSIONS.EVENT_UPDATE, params: schema.eventIdParamSchema },
  async ({ request, params, user, ctx }) => {
    const { file } = await readUpload(request, { field: 'image' });

    if (!POSTER_TYPES.includes(file.mimetype)) {
      throw AppError.badRequest('An event poster must be a JPEG, PNG or WebP image');
    }

    const result = await uploadPublicImage(file.buffer, { filename: file.originalname });

    return success(
      await service.setEventImage(
        params.id,
        { url: result.secure_url, publicId: result.public_id },
        user,
        ctx
      )
    );
  }
);
