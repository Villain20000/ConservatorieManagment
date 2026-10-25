import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
    // A throwaway database used to replay migrations when generating diffs and
    // running `migrate dev`. It is dropped and recreated on every run.
    shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
});
