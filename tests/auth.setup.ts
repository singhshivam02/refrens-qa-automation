import { test as setup } from '@playwright/test';
import fs from 'fs';

const { initializeRuntime, hasValidBrowserSession } = require('../config/runtime.cjs');
const runtime = initializeRuntime();
const STORAGE_FILE = runtime.storageState;

// Reuse only a non-expired refresh-token cookie scoped to the selected frontend.
// The app still validates the token itself when the session is used.
function hasValidSession(): boolean {
  if (!fs.existsSync(STORAGE_FILE)) return false;

  try {
    const state = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
    return hasValidBrowserSession(state, runtime.baseURL);
  } catch {
    return false;
  }
}

setup('authenticate', async ({ page }) => {
  if (hasValidSession()) {
    console.log('Existing auth token is still valid, reusing environment-specific storage state (no login needed).');
    return;
  }

  const email    = process.env.QA_EMAIL    || process.env.TEST_EMAIL;
  const password = process.env.QA_PASSWORD || process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Auth setup requires QA_EMAIL and QA_PASSWORD (or TEST_PASSWORD).\n' +
      'Copy .env.example to .env and fill in your credentials.'
    );
  }

  // Remove any stale file so a failed or interrupted run never leaves an
  // expired token that later causes "invalid token" errors in auth-required tests.
  if (fs.existsSync(STORAGE_FILE)) {
    fs.unlinkSync(STORAGE_FILE);
  }

  console.log('No valid auth token found, logging in...');

  await page.goto('/login');
  await page.fill('input[name="email"]',    email);
  await page.fill('input[name="password"]', password);

  console.log('Solve the CAPTCHA in the opened browser window...');

  await page.click('button[type="submit"]');

  const captchaTimeout = parseInt(process.env.CAPTCHA_WAIT_MS || '180000', 10);
  await page.waitForURL(/.*app.*/, { timeout: captchaTimeout });

  await page.context().storageState({ path: STORAGE_FILE });
});
