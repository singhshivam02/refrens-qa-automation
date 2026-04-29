import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment-specific .env file first, fall back to .env
const env = process.env.ENVIRONMENT || 'staging';
const envFile = path.resolve(__dirname, `.env.${env}`);
const defaultEnvFile = path.resolve(__dirname, '.env');

dotenv.config({ path: envFile });       // .env.staging / .env.prod
dotenv.config({ path: defaultEnvFile }); // .env fills in anything not already set

const baseURL       = process.env.BASE_URL || 'https://staging.bizsuggest.com';
const headless      = process.env.HEADLESS !== 'false';
const storageState  = fs.existsSync('storageState.json') ? 'storageState.json' : undefined;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/auth.setup.ts',
  captureGitInfo: { commit: false, diff: false },

  /* Run tests sequentially — important for a form-fill E2E */
  fullyParallel: false,
  workers:       1,

  /* Retry once on CI */
  retries: process.env.CI ? 1 : 0,

  /* Reporter */
  reporter: [
    ['list'],
  ],

  use: {
    baseURL,
    headless,

    /* Reuse the session saved by auth.setup.ts. Undefined on fresh clone until setup runs. */
    storageState,

    /* Capture artefacts on failure */
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    trace:      'on-first-retry',

    /* Default timeout for each action */
    actionTimeout: 30_000,

    /* Viewport */
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],

  /* Global timeout per test (10 minutes — allows for CAPTCHA) */
  timeout: 600_000,
});
