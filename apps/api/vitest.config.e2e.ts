import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts', '**/*.integration-spec.ts'],
    // These specs share one seeded PostgreSQL database and mutate it (creating
    // students, issuing documents, publishing exams). Running them in parallel
    // workers makes them interfere with each other and saturates the CPU with
    // concurrent Argon2 verifications, which shows up as spurious 5s timeouts.
    // Serial execution costs wall-clock time but buys a deterministic result.
    fileParallelism: false,
  },
});
