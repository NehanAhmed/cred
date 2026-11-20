import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Every database-backed suite owns a mongod process. Running files
    // serially keeps memory usage predictable on CI and developer machines.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000
  }
});
