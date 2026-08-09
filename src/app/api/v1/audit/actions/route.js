import { route } from '@/server/http/route';
import { success } from '@/server/http/respond';
import { PERMISSIONS } from '@/server/config/permissions';
import * as service from '@/server/modules/audit/audit.service';

/**
 * GET /api/v1/audit/actions — the full action vocabulary, so a filter dropdown is built
 * from the same source of truth the writers use rather than a list that drifts out of date.
 */
export const GET = route({ permission: PERMISSIONS.AUDIT_READ }, async () =>
  success(service.listActions())
);
