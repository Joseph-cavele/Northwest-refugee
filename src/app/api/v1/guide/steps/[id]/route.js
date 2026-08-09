import { z } from 'zod';
import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { LANGUAGES } from '@/server/config/constants';
import * as service from '@/server/modules/guide/guide.service';

const nodeParams = z.object({
  // The script's own ids, so anything else is a 404 rather than a lookup.
  id: z.string().trim().regex(/^[a-z0-9-]{1,40}$/, 'Invalid guide step'),
});

const languageQuery = z.object({ lang: z.enum(LANGUAGES).optional() });

export const GET = route({ params: nodeParams, query: languageQuery }, async ({ params, query }) => {
  const response = success(service.getNode(params.id, query?.lang));
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
});
