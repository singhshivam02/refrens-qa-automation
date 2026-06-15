import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const env = process.env.ENVIRONMENT || 'staging';
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseURL      = process.env.BASE_URL || 'https://staging.bizsuggest.com';
const STORAGE_FILE = path.resolve(__dirname, '../storageState.json');

async function globalSetup() {
  const email    = process.env.QA_EMAIL    || process.env.TEST_EMAIL;
  const password = process.env.QA_PASSWORD || process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Auth setup requires QA_EMAIL and QA_PASSWORD (or TEST_PASSWORD).\n' +
      'Copy .env.example to .env and fill in your credentials.'
    );
  }

  // Remove any stale file so a failed or interrupted run never leaves an
  // expired token that later causes "invalid token" errors in lydia tests.
  if (fs.existsSync(STORAGE_FILE)) {
    fs.unlinkSync(STORAGE_FILE);
  }

  const browser = await chromium.launch({ headless: false });
  const page    = await browser.newPage();

  await page.goto(`${baseURL}/login`);

  await page.fill('input[name="email"]',    email);
  await page.fill('input[name="password"]', password);

  console.log('Solve the CAPTCHA in the opened browser window...');

  await page.click('button[type="submit"]');

  const captchaTimeout = parseInt(process.env.CAPTCHA_WAIT_MS || '180000', 10);
  await page.waitForURL(/.*app.*/, { timeout: captchaTimeout });

  await page.context().storageState({ path: STORAGE_FILE });

  await browser.close();
}

export default globalSetup;
