import AppError from '../utils/AppError.js';
import { hasPermission, assertKnownPermission } from '../config/permissions.js';
import AuditLog, { ACTIONS } from '../modules/audit/audit.model.js';

/**
 * Route guard: require a permission, never a role name —
 *
 *   router.post('/', authenticate, authorize('transaction:approve'), …)
 *
 * The permission string is validated at wire-up (module load), not per request: a typo
 * would otherwise deny everyone silently and look like a broken login. Denials are
 * audited before the 403, because a pattern of refusals is itself a security signal.
 */
export function authorize(permission) {
  assertKnownPermission(permission);

  return async function guard(req, _res, next) {
    try {
      if (!req.user) throw AppError.unauthorized();
      if (hasPermission(req.user.role, permission)) return next();

      await AuditLog.record({
        actor: req.user._id,
        action: ACTIONS.PERMISSION_DENIED,
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? '',
        meta: { permission, method: req.method, path: req.originalUrl },
      });
      throw AppError.forbidden();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Maker-checker guard. `resolveCreatorId(req)` returns whoever created the record being
 * acted on; the action is refused if that is the current user.
 *
 * This is a convenience for routes — it does NOT replace the equivalent check inside
 * finance.service.js. The service-level check is the one that holds when a record is
 * approved through any path other than this route.
 */
export function requireDifferentActor(resolveCreatorId) {
  return async function guard(req, _res, next) {
    try {
      if (!req.user) throw AppError.unauthorized();
      const creatorId = await resolveCreatorId(req);
      if (creatorId && String(creatorId) === String(req.user._id)) {
        throw AppError.selfApproval();
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export default authorize;
