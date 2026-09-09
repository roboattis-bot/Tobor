import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const testPort = process.env.E2E_PORT || '3002';
const baseURL = `http://127.0.0.1:${testPort}`;
const runId = `${Date.now()}-${process.pid}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/workspace.spec.ts',
  outputDir: './test-results/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    channel: 'msedge',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 10_000,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Run `npm.cmd run build` first. An independent database and port keep
  // test accounts and sample edits away from the user's workspace.
  webServer: {
    command: 'node --import tsx server/index.ts',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      HOST: '127.0.0.1',
      PORT: testPort,
      NODE_ENV: 'test',
      APP_ORIGIN: baseURL,
      DATABASE_PATH: resolve('test-results', `e2e-${runId}.sqlite`),
      UPLOAD_DIR: resolve('test-results', `uploads-${runId}`),
      SEED_DEMO: 'true',
      SESSION_TTL_HOURS: '12',
    },
  },
});
