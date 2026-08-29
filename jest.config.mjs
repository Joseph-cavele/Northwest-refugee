/**
 * Jest, alongside Vitest rather than instead of it.
 *
 * WHY THERE ARE TWO RUNNERS, SO THE NEXT READER DOES NOT "TIDY" ONE AWAY. Vitest owns
 * `npm test` and the 38 files in tests/ — see vitest.config.ts and tests/README.md, which
 * tracks which of the Express-era route suites are still to port. Jest was added
 * deliberately on top of that. The two never see each other's files:
 *
 *   npm test        vitest run    tests/reportDates.test.js, tests/jobs.test.js,
 *                                 tests/**\/*.unit.test.ts
 *   npm run test:jest             tests/**\/*.jest.test.ts
 *
 * THE `.jest.test.ts` SUFFIX IS LOAD-BEARING. Vitest's `include` matches `*.unit.test.ts`
 * and two named files; Jest matches `*.jest.test.ts` and nothing else. A file cannot be
 * picked up by both, which matters because the Vitest suites import `describe`/`it`/`expect`
 * from 'vitest' — under Jest that import resolves to a package Jest is not driving, and the
 * failure is confusing rather than obvious.
 *
 * WHAT MAKES THIS WORK AT ALL, because none of it is default:
 *
 *   "type": "module"      This package is pure ESM. Jest's ESM support is still behind a
 *                         flag, which is why `test:jest` sets NODE_OPTIONS=
 *                         --experimental-vm-modules. Without it every import throws
 *                         "Cannot use import statement outside a module".
 *   useESM / extensions   ts-jest has to be told to emit ESM too, or it compiles TypeScript
 *                         to CommonJS and hands it to an ESM runtime.
 *   moduleNameMapper      Two entries, and both are needed for different reasons:
 *                           `@/…`      mirrors `paths` in tsconfig.json. Jest does not read
 *                                      tsconfig paths, so without this every alias import
 *                                      in a test resolves to nothing. vitest.config.ts
 *                                      carries the same mapping for the same reason.
 *                           `./x.js`   TypeScript ESM requires a `.js` extension on relative
 *                                      imports of `.ts` files. Node resolves that at
 *                                      runtime; Jest's resolver does not, so the extension
 *                                      is stripped back off before resolution.
 *
 * Coverage thresholds are deliberately absent. A number in this file would be a target to
 * game; tests/README.md names the behaviours worth protecting instead.
 */

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',

  // Jest's own corner of tests/. Never the files Vitest runs — see the note above.
  testMatch: ['<rootDir>/tests/**/*.jest.test.ts'],

  extensionsToTreatAsEsm: ['.ts'],

  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Strip the ESM `.js` extension off relative imports so Jest can find the `.ts` source.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // The same environment pinning the Vitest suites get: no real database, no real gateway,
  // no metered API. One file, loaded by both runners, so the two cannot drift.
  setupFiles: ['<rootDir>/tests/setup.js'],

  clearMocks: true,
};
