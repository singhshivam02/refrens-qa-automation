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

const STORAGE_STATE = 'storageState.json';

export default defineConfig({
  testDir: './tests',
  captureGitInfo: { commit: false, diff: false },

  fullyParallel: false,
  workers:       1,

  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['html', { open: 'never' }],
    ['list']],

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
    // ── Auth setup project ──────────────────────────────────────────────────
    // Runs only when a dependent project is selected. Opens headed so the
    // CAPTCHA is visible. storageState.json is written here and reused below.
    {
      name:      'auth-setup',
      testMatch: '**/auth.setup.ts',
      use:       { browserName: 'chromium', ...devices['Desktop Chrome'], headless: false },
    },

    // ── Logged-in app tests (Lydia) ─────────────────────────────────────────
    // storageState.json is created by auth-setup on Chromium.
    // The saved cookies + localStorage are browser-agnostic, so all three
    // browser variants can reuse the same file.
    {
      name:         'lydia',
      testMatch:    '**/lydia/**/*.spec.ts',
      dependencies: ['auth-setup'],
      use:          { browserName: 'chromium', ...devices['Desktop Chrome'],  storageState: STORAGE_STATE },
    },
    {
      name:         'lydia-firefox',
      testMatch:    '**/lydia/**/*.spec.ts',
      dependencies: ['auth-setup'],
      use:          { browserName: 'firefox',  ...devices['Desktop Firefox'], storageState: STORAGE_STATE },
    },
    {
      name:         'lydia-webkit',
      testMatch:    '**/lydia/**/*.spec.ts',
      dependencies: ['auth-setup'],
      use:          { browserName: 'webkit',   ...devices['Desktop Safari'],  storageState: STORAGE_STATE },
    },

    // ── Public / marketing page tests (Elisif) ──────────────────────────────
    // No storageState — these tests run as an anonymous visitor intentionally.
    {
      name:      'elisif',
      testMatch: '**/elisif/**/*.spec.ts',
      use:       { browserName: 'chromium', ...devices['Desktop Chrome'] },
    },
    {
      name:      'elisif-firefox',
      testMatch: '**/elisif/**/*.spec.ts',
      use:       { browserName: 'firefox',  ...devices['Desktop Firefox'] },
    },
    {
      name:      'elisif-edge',
      testMatch: '**/elisif/**/*.spec.ts',
      use:       { browserName: 'chromium', ...devices['Desktop Edge'], channel: 'msedge' },
    },

    // ── Auth-required UI tests ──────────────────────────────────────────────
    // document-creation and invoice-performance hit authenticated app routes.
    {
      name:         'ui-auth',
      testMatch:    ['**/ui/document-creation.spec.ts', '**/ui/invoice-performance.spec.ts'],
      dependencies: ['auth-setup'],
      use:          { browserName: 'chromium', ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
    },

    // ── Public UI / data tests (Chromium only) ──────────────────────────────
    // All other ui/** tests are public pages — no login required.
    {
      name:       'chromium',
      testMatch:  ['**/ui/**/*.spec.ts', '**/data/**/*.spec.ts'],
      testIgnore: ['**/ui/document-creation.spec.ts', '**/ui/invoice-performance.spec.ts'],
      use:        { browserName: 'chromium', ...devices['Desktop Chrome'] },
    },
  ],

  timeout: 600_000,
});
