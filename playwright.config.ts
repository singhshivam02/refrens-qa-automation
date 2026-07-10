import { defineConfig, devices, chromium } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Load environment-specific .env file first, fall back to .env
const env = process.env.ENVIRONMENT || 'staging';
const envFile = path.resolve(__dirname, `.env.${env}`);
const defaultEnvFile = path.resolve(__dirname, '.env');

dotenv.config({ path: envFile });       // .env.staging / .env.prod
dotenv.config({ path: defaultEnvFile }); // .env fills in anything not already set

const baseURL = process.env.BASE_URL || 'https://staging.bizsuggest.com';
const headless = process.env.HEADLESS !== 'false';

const STORAGE_STATE = 'storageState.json';

// Playwright's bundled Chromium build only ships support for a fixed list of
// Linux distros. On newer releases (e.g. Ubuntu 26) that aren't on that list
// yet, `npx playwright install` can't get a working Chromium, which blocks
// people from running any test at all. Fall back to the system-installed
// Google Chrome (`channel: 'chrome'`) in that case instead of hard-blocking.
function resolveChromiumChannel(): string | undefined {
  if (process.env.PW_CHROME_CHANNEL) return process.env.PW_CHROME_CHANNEL;
  if (os.platform() !== 'linux') return undefined;

  let bundledChromiumWorks = false;
  try {
    bundledChromiumWorks = fs.existsSync(chromium.executablePath());
  } catch {
    bundledChromiumWorks = false;
  }
  if (bundledChromiumWorks) return undefined;

  const systemChromePaths = [
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
  if (systemChromePaths.some((p) => fs.existsSync(p))) {
    console.warn('Bundled Playwright Chromium not found — using system Google Chrome instead.');
    return 'chrome';
  }

  console.warn(
    "Playwright's bundled Chromium isn't installed and no system Google Chrome was found.\n" +
    'Install Google Chrome (e.g. `sudo apt install google-chrome-stable`) or run ' +
    '`npx playwright install chrome`, then re-run the tests.'
  );
  return undefined;
}

const chromiumChannel = resolveChromiumChannel();

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
      use:       { browserName: 'chromium', ...devices['Desktop Chrome'], ...(chromiumChannel ? { channel: chromiumChannel } : {}), headless: false },
    },

    // ── Logged-in app tests (Lydia) ─────────────────────────────────────────
    // storageState.json is created by auth-setup on Chromium.
    // The saved cookies + localStorage are browser-agnostic, so all three
    // browser variants can reuse the same file.
    {
      name:         'lydia',
      testMatch:    '**/lydia/**/*.spec.ts',
      dependencies: ['auth-setup'],
      use:          { browserName: 'chromium', ...devices['Desktop Chrome'], ...(chromiumChannel ? { channel: chromiumChannel } : {}), storageState: STORAGE_STATE },
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
      use:       { browserName: 'chromium', ...devices['Desktop Chrome'], ...(chromiumChannel ? { channel: chromiumChannel } : {}) },
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
      use:          { browserName: 'chromium', ...devices['Desktop Chrome'], ...(chromiumChannel ? { channel: chromiumChannel } : {}), storageState: STORAGE_STATE },
    },

    // ── Public UI / data tests (Chromium only) ──────────────────────────────
    // All other ui/** tests are public pages — no login required.
    {
      name:       'chromium',
      testMatch:  ['**/ui/**/*.spec.ts', '**/data/**/*.spec.ts'],
      testIgnore: ['**/ui/document-creation.spec.ts', '**/ui/invoice-performance.spec.ts'],
      use:        { browserName: 'chromium', ...devices['Desktop Chrome'], ...(chromiumChannel ? { channel: chromiumChannel } : {}) },
    },
  ],

  timeout: 600_000,
});
