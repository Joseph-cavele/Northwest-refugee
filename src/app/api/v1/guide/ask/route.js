import { z } from 'zod';
import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { aiLimiter } from '@/server/http/rateLimit';
import { LANGUAGES } from '@/server/config/constants';
import { MAX_INPUT_LENGTH } from '@/server/modules/guide/guide.intent';
import * as service from '@/server/modules/guide/guide.service';

/**
 * POST /api/v1/guide/ask — free text in, one of OUR screens out.
 *
 * POST rather than GET: what a person types here can describe violence or immigration
 * status, and a query string ends up in access logs, browser history and every proxy in
 * between. It is never logged, and never echoed back.
 *
 * Rate limited because it can reach a metered model — without a tight limit, anyone with a
 * loop can run up an OpenAI bill against a nonprofit.
 */
const askSchema = z.object({
  text: z
    .string({ error: 'Tell us what you need' })
    .trim()
    .min(1, 'Tell us what you need')
    .max(MAX_INPUT_LENGTH, `Please keep it under ${MAX_INPUT_LENGTH} characters`),
  lang: z.enum(LANGUAGES).optional(),
});

const languageQuery = z.object({ lang: z.enum(LANGUAGES).optional() });

export const POST = route({ body: askSchema, query: languageQuery }, async ({ body, query, ctx }) => {
  aiLimiter.check(ctx.ip);
  const response = success(await service.ask(body.text, body.lang ?? query?.lang));
  // Per-visitor answer — never cached, by anything.
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
