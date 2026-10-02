import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    // Integration files share seeded organizations and signing-key locks.
    // Race tests still create concurrent independent sessions within each file.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    include: ['packages/*/src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
