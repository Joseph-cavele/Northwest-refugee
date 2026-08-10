import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/*
 * `npm test` runs the suites that actually run.
 *
 * The 23 route tests in tests/ are the Express-era suite: they call supertest against an
 * `app` object that no longer exists, and they need a mongod on 27017. They are excluded by
 * name rather than deleted, and `tests/README.md` explains how to port them and which to do
 * first — an excluded test is a visible debt, a deleted one is a silently lost invariant.
 *
 * Do NOT point TEST_MONGO_URI at Atlas to "make them run". tests/setup.js calls
 * resetDatabase(), which empties every collection, and production data currently lives in a
 * database literally named `test`.
 */

const PORTED = [
  'tests/reportDates.test.js', // SAST day boundaries and the metric vocabulary
  'tests/jobs.test.js', // the three scheduled jobs, every collaborator mocked
  'tests/**/*.unit.test.ts', // pure dashboard logic — series, alerts
];

export default defineConfig({
  resolve: {
    // Mirrors `paths` in tsconfig.json. Vitest does not read it, so without this every
    // `@/…` import in a test resolves to nothing.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: PORTED,
    environment: 'node',
    // No global setup file: nothing in PORTED touches a database, and setup.js exists to
    // pin credentials for suites that do.
    globals: false,
  },
});
