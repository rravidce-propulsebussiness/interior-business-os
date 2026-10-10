import { defineConfig } from 'vitest/config';
import { assertLocalTestDatabase } from './scripts/local-test-target';
if (process.env.TEST_DATABASE_URL)
  assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
export default defineConfig({
  test: {
    environment: 'node',
    // Integration files share seeded organizations and signing-key locks.
    // Race tests still create concurrent independent sessions within each file.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/business-app/src/app/dashboard/website/cloudflare-domains.test.ts',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
