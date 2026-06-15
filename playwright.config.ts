import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific .env file first, fall back to .env
const env = process.env.ENVIRONMENT || 'staging';
const envFile = path.resolve(__dirname, `.env.${env}`);
const defaultEnvFile = path.resolve(__dirname, '.env');

dotenv.config({ path: envFile });       // .env.staging / .env.prod
dotenv.config({ path: defaultEnvFile }); // .env fills in anything not already set

const baseURL = process.env.BASE_URL || 'https://staging.bizsuggest.com';
const headless = process.env.HEADLESS !== 'false';

// globalSetup (auth.setup.ts) always runs first and guarantees this file exists
// before any lydia test starts. Hardcoding avoids the fs.existsSync() race where
// the check runs at config-load time (before globalSetup) and returns false on
// a fresh machine, causing lydia to run without auth state.
const STORAGE_STATE = 'storageState.json';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/auth.setup.ts',
  captureGitInfo: { commit: false, diff: false },

  fullyParallel: false,
  workers:       1,

  retries: process.env.CI ? 1 : 0,

  reporter: [['list']],

  use: {
    baseURL,
    headless,
    // storageState is NOT set globally — each project opts in below
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
    trace:         'on-first-retry',
    actionTimeout: 30_000,
    viewport:      { width: 1440, height: 900 },
  },

  projects: [
    // ── Logged-in app tests (Lydia) ─────────────────────────────────────────
    // Uses the session saved by auth.setup.ts. Run auth.setup first to get
    // storageState.json (solve CAPTCHA once, reused for the whole suite).
    {
      name:      'lydia',
      testMatch: '**/lydia/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },

    // ── Public / marketing page tests (Elisif) ──────────────────────────────
    // No storageState — these tests run as an anonymous visitor intentionally.
    {
      name:      'elisif',
      testMatch: '**/elisif/**/*.spec.ts',
      use:       { ...devices['Desktop Chrome'] },
    },

    // ── Other UI / data tests ───────────────────────────────────────────────
    {
      name:      'chromium',
      testMatch: ['**/ui/**/*.spec.ts', '**/data/**/*.spec.ts'],
      use:       { ...devices['Desktop Chrome'] },
    },
  ],

  timeout: 600_000,
});
