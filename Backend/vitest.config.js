import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // The router suites share one database; running files in parallel would have them
    // deleting each other's fixtures between assertions.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/seed.js', 'src/**/*.routes.js'],
    },
  },
});
