import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import logger from '@/server/config/logger';
import { connectDB } from '@/server/config/db';
import env from '@/server/config/env';
import { runPermitExpiry } from '@/server/jobs/permitExpiry.job';
import { runDailyRollup } from '@/server/jobs/dailyRollup.job';
import { runFinanceAlerts } from '@/server/jobs/financeAlerts.job';

/*
 * The scheduled jobs, as HTTP endpoints.
 *
 * WHY THEY MOVED. node-cron kept a timer inside a long-lived Express process. Next has no
 * such process — there is nothing running between requests to hold a schedule — so the
 * schedule now lives outside the application and pokes it. The job FUNCTIONS themselves are
 * unchanged and still live in src/server/jobs/; only the trigger moved.
 *
 * Configure the schedule in vercel.json (or the platform's equivalent), in
 * Africa/Johannesburg, matching what jobs/index.js used to declare:
 *
 *   07:00 daily   /api/v1/cron/permit-expiry   before the front desk opens
 *   00:30 daily   /api/v1/cron/daily-rollup    after midnight, so it covers a closed day
 *   08:00 Monday  /api/v1/cron/finance-alerts  the finance week starts with what is outstanding
 *
 * NOTE ON TIMEZONE: node-cron was given `timezone: 'Africa/Johannesburg'` directly. Most
 * platform schedulers only speak UTC, so those become 05:00, 22:30 (previous day) and 06:00
 * Monday UTC. SA observes no daylight saving, so the offset is fixed and this conversion
 * stays correct — but it is a conversion, and it is the kind that is silently wrong for
 * half the year in a country that does.
 *
 * DOUBLE-FIRING: unchanged from before. Two instances receiving the same trigger run the
 * job twice, and a permit-expiry run that messages each beneficiary twice is the visible
 * symptom. The scheduler calling once is what prevents that; add a distributed lock before
 * relying on anything less.
 */

const JOBS = {
  'permit-expiry': runPermitExpiry,
  'daily-rollup': runDailyRollup,
  'finance-alerts': runFinanceAlerts,
};

/**
 * These endpoints are public URLs. Without a secret, anyone who guesses one can make the
 * organisation send every beneficiary a permit-expiry message at three in the morning.
 *
 * Compared in constant time and failing closed when CRON_SECRET is unset: an unset secret
 * must mean "nobody may run these", never "everybody may".
 */
function authorised(request) {
  const expected = env.CRON_SECRET;
  if (!expected) {
    logger.error('CRON_SECRET is not set — refusing to run scheduled jobs over HTTP');
    return false;
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; a self-hosted scheduler can
  // send the same header.
  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request, context) {
  const { job } = await context.params;

  if (!authorised(request)) {
    logger.warn({ job }, 'rejected an unauthorised cron trigger');
    return new NextResponse(null, { status: 401 });
  }

  const handler = JOBS[job];
  if (!handler) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: `Unknown job: ${job}` } },
      { status: 404 }
    );
  }

  const startedAt = Date.now();
  try {
    await connectDB();
    const summary = await handler();
    const ms = Date.now() - startedAt;
    logger.info({ job, ms, summary }, 'job completed');
    return NextResponse.json({ success: true, data: { job, ms, summary } });
  } catch (err) {
    /*
     * A failing job must never take the instance with it — the same rule the `guard()`
     * wrapper in jobs/index.js enforced. A 500 here also tells the scheduler the run
     * failed, which node-cron had no way of reporting to anyone.
     */
    logger.error({ job, err }, 'job failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Job failed' } },
      { status: 500 }
    );
  }
}

/** Some schedulers only issue GET. Same guard, same work. */
export const GET = POST;
