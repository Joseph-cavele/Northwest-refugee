import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { aiLimiter } from '../../middleware/rateLimiter.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { LANGUAGES } from '../../config/constants.js';
import { MAX_INPUT_LENGTH } from './guide.intent.js';
import * as service from './guide.service.js';

// PUBLIC — no authenticate, and deliberately so. Someone looking for help must not need
// an account to find out how to get it, and requiring one would exclude exactly the
// people the organisation exists for.
//
// Safe to expose because the whole module is read-only static content: no database, no
// user input beyond a language code, nothing generated, nothing personal. The /api rate
// limiter in app.js still applies.

const router = Router();

const languageQuery = z.object({
  lang: z.enum(LANGUAGES, { error: `Language must be one of: ${LANGUAGES.join(', ')}` }).optional(),
});

const askSchema = z.object({
  text: z
    .string({ error: 'Tell us what you need' })
    .trim()
    .min(1, 'Tell us what you need')
    .max(MAX_INPUT_LENGTH, `Please keep it under ${MAX_INPUT_LENGTH} characters`),
  lang: z.enum(LANGUAGES).optional(),
});

const nodeParams = z.object({
  // The script's own ids, so anything else is a 404 rather than a lookup.
  id: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, 'Invalid guide step'),
});

router.get(
  '/',
  validate({ query: languageQuery }),
  catchAsync(async (req, res) => {
    // Content changes only on deploy, so let a browser and any CDN hold it briefly.
    res.set('Cache-Control', 'public, max-age=300');
    sendSuccess(res, service.getGuide(req.validatedQuery?.lang));
  })
);

/**
 * Free text in, one of OUR screens out.
 *
 * POST rather than GET: what a person types here can describe violence or immigration
 * status, and a query string ends up in access logs, browser history and every proxy in
 * between. It is never logged, and never echoed back.
 */
router.post(
  '/ask',
  aiLimiter,
  validate({ body: askSchema, query: languageQuery }),
  catchAsync(async (req, res) => {
    // No caching: this is a per-visitor answer.
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, await service.ask(req.body.text, req.body.lang ?? req.validatedQuery?.lang));
  })
);

router.get(
  '/steps/:id',
  validate({ params: nodeParams, query: languageQuery }),
  catchAsync(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    sendSuccess(res, service.getNode(req.params.id, req.validatedQuery?.lang));
  })
);

export default router;
