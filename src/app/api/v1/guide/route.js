import { z } from 'zod';
import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { LANGUAGES } from '@/server/config/constants';
import * as service from '@/server/modules/guide/guide.service';

/*
 * PUBLIC — no auth, and deliberately so. Someone looking for help must not need an account
 * to find out how to get it, and requiring one would exclude exactly the people the
 * organisation exists for.
 *
 * Safe to expose because the whole module is read-only static content: no database, no
 * user input beyond a language code, nothing generated, nothing personal.
 */

const languageQuery = z.object({
  lang: z.enum(LANGUAGES, { error: `Language must be one of: ${LANGUAGES.join(', ')}` }).optional(),
});

export const GET = route({ query: languageQuery }, async ({ query }) => {
  const response = success(service.getGuide(query?.lang));
  // Content changes only on deploy, so let a browser and any CDN hold it briefly. This
  // overrides the no-store default that next.config.mjs sets across /api.
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
});
