import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/reports/report.service';

/*
 * GET /api/v1/reports/cards — the dashboard's headline figures for whoever is asking.
 *
 * The response is not the same for two people, and that is the point: cards are filtered
 * by permission and row-scoped to the caller's caseload, so this is safe to render on the
 * landing screen of every role that can reach it.
 *
 * `report:read` rather than `metric:read` — the cards are scoped to your own caseload,
 * where the stored series is organisation-wide. See ../metrics/route.js.
 */
export const GET = route({ permission: PERMISSIONS.REPORT_READ }, async ({ user }) =>
  success(await service.getDashboardCards(user))
);
