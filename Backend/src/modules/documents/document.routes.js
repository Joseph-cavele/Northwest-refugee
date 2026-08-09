import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { uploadSingle } from '../../middleware/upload.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as controller from './document.controller.js';
import * as schema from './document.schema.js';

const router = Router();

// Identity documents belonging to refugees and children. Nothing here is public.
router.use(authenticate);

router
  .route('/')
  .post(
    authorize(PERMISSIONS.DOCUMENT_CREATE),
    // multer runs BEFORE validate: the multipart body does not exist as fields until it
    // has been parsed, so validating first would see an empty req.body and reject
    // every upload.
    uploadSingle('file'),
    validate({ body: schema.uploadDocumentSchema }),
    controller.upload
  )
  .get(
    authorize(PERMISSIONS.DOCUMENT_READ),
    validate({ query: schema.listDocumentsSchema }),
    controller.list
  );

// Static before /:id — otherwise this would arrive as id='...' and never match.
router.get(
  '/:id/download',
  // A distinct permission from read: knowing a permit scan exists is not the same as
  // fetching it, and only this route mints a URL to the bytes.
  authorize(PERMISSIONS.DOCUMENT_DOWNLOAD),
  validate({ params: schema.documentIdParamSchema, query: schema.downloadQuerySchema }),
  controller.download
);

router
  .route('/:id')
  .get(
    authorize(PERMISSIONS.DOCUMENT_READ),
    validate({ params: schema.documentIdParamSchema }),
    controller.getById
  )
  .delete(
    authorize(PERMISSIONS.DOCUMENT_DELETE),
    validate({ params: schema.documentIdParamSchema }),
    controller.remove
  );

export default router;
