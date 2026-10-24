import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webUrl,
    locale: 'el-GR',
    colorScheme: 'light',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--disable-dev-shm-usage'] },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run build:api && npm run start:prod --workspace apps/api',
      url: `${apiUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      // Serve the production bundle: lighter than the dev server and closer to real deployments.
      command: 'npm run build:web && node scripts/serve-web.mjs',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
