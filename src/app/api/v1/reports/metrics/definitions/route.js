import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/reports/report.service';

/*
 * GET /api/v1/reports/metrics/definitions — the metric vocabulary.
 *
 * A directory of its own under metrics/, which is how the App Router expresses what
 * "static paths before /:id" did in Express. There is no ordering hazard here: a literal
 * segment always beats a dynamic one.
 */
export const GET = route({ permission: PERMISSIONS.METRIC_READ }, async () =>
  success(service.listMetricDefinitions())
);
