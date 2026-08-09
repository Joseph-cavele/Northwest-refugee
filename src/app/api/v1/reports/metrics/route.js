import { z } from 'zod';
import { route } from '@/server/http/route';
import { paginated } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import { PAGINATION } from '@/server/config/constants';
import { METRIC_KEYS, METRIC_DIMENSIONS, DIMENSION_VALUES } from '@/server/modules/reports/metric.model';
import * as service from '@/server/modules/reports/report.service';

/*
 * GET /api/v1/reports/metrics — the stored daily series.
 *
 * `metric:read`, which is narrower than the `report:read` behind the cards: this data is
 * organisation-wide by construction, so a coordinator reading it would see totals covering
 * programmes they are not assigned to. Held by the four roles whose job is the whole
 * organisation's numbers (ED, Finance, Comms, M&E).
 */
const listMetricsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),

    // Constrained to the vocabulary: an unknown key would otherwise return an empty page,
    // which reads as "nothing happened" rather than "you asked for a metric that does not
    // exist". Repeatable — `?key=cases.open&key=cases.closed` charts two lines.
    key: z
      .union([z.enum(METRIC_KEYS), z.array(z.enum(METRIC_KEYS))])
      .transform((value) => (Array.isArray(value) ? value : [value]))
      .optional(),

    // Omitted means the organisation-wide rows only. Mixing a breakdown in with its own
    // total is how a caller ends up summing the same figure twice.
    dimension: z.enum(METRIC_DIMENSIONS).optional(),
    dimensionValue: z.string().trim().max(60).optional(),

    from: z.iso.date({ error: 'from must be a date (YYYY-MM-DD)' }).optional(),
    to: z.iso.date({ error: 'to must be a date (YYYY-MM-DD)' }).optional(),

    sort: z.enum(['date', '-date']).default('date'),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.to < data.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'End of range must be after the start' });
    }
    if (data.dimensionValue && !data.dimension) {
      ctx.addIssue({ code: 'custom', path: ['dimension'], message: 'Name the dimension the value belongs to' });
    }
    if (data.dimension && data.dimensionValue) {
      const allowed = DIMENSION_VALUES[data.dimension] ?? [];
      if (!allowed.includes(data.dimensionValue)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dimensionValue'],
          message: `Unknown ${data.dimension}: ${data.dimensionValue}`,
        });
      }
    }
  });

export const GET = route(
  { permission: PERMISSIONS.METRIC_READ, query: listMetricsSchema },
  async ({ query }) => paginated(await service.listMetrics(query))
);
