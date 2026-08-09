import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import catchAsync from '../../utils/catchAsync.js';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/apiResponse.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { PAGINATION } from '../../config/constants.js';
import { METRIC_KEYS, METRIC_DIMENSIONS, DIMENSION_VALUES } from './metric.model.js';
import * as service from './report.service.js';

// Counts and totals only. Nothing here returns a beneficiary, a case or a transaction —
// which is why `report:read` is held by six roles that do not all hold beneficiary:read,
// and why every card is filtered by the permission for the data behind it before it is
// counted. No controller file: the module is four handlers thin, same as audit.
//
// TWO PERMISSIONS, on purpose:
//   report:read   — the dashboard cards, scoped to the caller's own caseload. Everyone
//                   with a desk gets these; it is the screen they land on.
//   metric:read   — the stored organisation-wide series. Unscoped by construction, so a
//                   coordinator reading it would see totals covering programmes they are
//                   not assigned to. Held by the four roles whose job is the whole
//                   organisation's numbers (ED, Finance, Comms, M&E).
//
// Peer leaders and volunteers hold neither and get a 403 here. That is the existing
// permission matrix, not a decision taken in this module — they work from their own
// queues, and an organisation-wide figure is not information they need.

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
      ctx.addIssue({
        code: 'custom',
        path: ['dimension'],
        message: 'Name the dimension the value belongs to',
      });
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

const snapshotSchema = z
  .object({
    // Defaults to today. The service refuses anything older than its backfill window — a
    // level such as "open cases" cannot be reconstructed for a past date, only today's
    // number written under an old one.
    date: z.iso.date({ error: 'date must be a date (YYYY-MM-DD)' }).optional(),
  })
  // Express 5 leaves req.body undefined when a request carries no content-type at all, and
  // "recompute today" is a legitimately bodyless POST. Without this the convenient call
  // fails validation rather than doing the obvious thing.
  .default({});

const router = Router();

router.use(authenticate);

/**
 * GET /cards — the dashboard's headline figures for whoever is asking.
 *
 * The response is not the same for two people, and that is the point: cards are filtered
 * by permission and row-scoped to the caller's caseload, so this is safe to render on the
 * landing screen of every role that can reach it.
 */
router.get(
  '/cards',
  authorize(PERMISSIONS.REPORT_READ),
  catchAsync(async (req, res) => {
    sendSuccess(res, await service.getDashboardCards(req.user));
  })
);

// Static before the collection it describes.
router.get(
  '/metrics/definitions',
  authorize(PERMISSIONS.METRIC_READ),
  catchAsync(async (_req, res) => {
    sendSuccess(res, service.listMetricDefinitions());
  })
);

router.get(
  '/metrics',
  authorize(PERMISSIONS.METRIC_READ),
  validate({ query: listMetricsSchema }),
  catchAsync(async (req, res) => {
    sendPaginated(res, await service.listMetrics(req.validatedQuery));
  })
);

/**
 * POST /snapshots — recompute and store a day's metrics.
 *
 * The daily job at 00:30 is the normal writer; this exists so a failed run can be repeated
 * without waiting a day, which is why it is `report:create` and not `metric:read`. It
 * recomputes from the same source rows rather than accepting figures, so there is no path
 * here for a reported number to be typed in by hand.
 */
router.post(
  '/snapshots',
  authorize(PERMISSIONS.REPORT_CREATE),
  validate({ body: snapshotSchema }),
  catchAsync(async (req, res) => {
    sendCreated(res, await service.snapshotDailyMetrics({ date: req.body.date }));
  })
);

export default router;
