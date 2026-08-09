import { z } from 'zod';
import { route } from '@/server/http/route';
import { created } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/reports/report.service';

/*
 * POST /api/v1/reports/snapshots — recompute and store a day's metrics.
 *
 * The daily cron is the normal writer; this exists so a failed run can be repeated without
 * waiting a day, which is why it is `report:create` and not `metric:read`. It recomputes
 * from the same source rows rather than accepting figures, so there is no path here for a
 * reported number to be typed in by hand.
 */
const snapshotSchema = z
  .object({
    // Defaults to today. The service refuses anything older than its backfill window — a
    // level such as "open cases" cannot be reconstructed for a past date, only today's
    // number written under an old one.
    date: z.iso.date({ error: 'date must be a date (YYYY-MM-DD)' }).optional(),
  })
  // A bodyless POST means "recompute today". Route handlers hand `undefined` to the schema
  // when there is no JSON content-type, and without this the convenient call would fail
  // validation rather than doing the obvious thing.
  .default({});

export const POST = route(
  { permission: PERMISSIONS.REPORT_CREATE, body: snapshotSchema },
  async ({ body }) => created(await service.snapshotDailyMetrics({ date: body.date }))
);
