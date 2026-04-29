/**
 * Invoice Generator — Global / International (en)
 *
 * Locale: en | Tax: none | Currency: USD
 * URL: /en/free-online-invoice-generator
 *
 * Covers:
 *  1. Minimal invoice (no tax fields)
 *  2. Full invoice (US address, two items, notes, terms)
 *  3. Currency selection
 *  4. No GST/VAT fields visible
 *  5. End-to-end with login
 */

import { test, expect } from '@playwright/test';
import { InvoiceGeneratorPage } from '../../pages/InvoiceGeneratorPage';
import { enGlobal } from '../../fixtures/testData';
import { config } from '../../config/environment';

const LOCALE = 'en' as const;

test.describe('Invoice Generator — Global (en)', () => {

  function getCredentials() {
    const password = config.testPassword;
    if (!password) throw new Error('TEST_PASSWORD not set in .env');
    return {
      password,
      captchaWait: parseInt(process.env.CAPTCHA_WAIT_MS ?? '90000', 10),
    };
  }

  async function setupPage(page: any): Promise<InvoiceGeneratorPage> {
    const invoicePage = new InvoiceGeneratorPage(page, LOCALE);
    await invoicePage.navigateToGenerator();
    await expect(page).toHaveURL(/\/en\/free-online-invoice-generator/, { timeout: 15_000 });
    await invoicePage.clickCreateCta();
    return invoicePage;
  }

  // ── 1. Minimal invoice ─────────────────────────────────────────────────────

  test('1 — minimal invoice (no tax)', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm(enGlobal.simpleInvoice);
    await invoicePage.clickSaveAndContinue();

    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── 2. Full invoice ────────────────────────────────────────────────────────

  test('2 — full invoice: US address, two items', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm(enGlobal.fullInvoice);

    await expect(page.locator('input[name="billedBy.name"]')).toHaveValue(enGlobal.fullInvoice.business.name);
    await expect(page.locator('input[name="billedTo.name"]')).toHaveValue(enGlobal.fullInvoice.client.name);

    await invoicePage.clickSaveAndContinue();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. No tax-ID fields visible ────────────────────────────────────────────

  test('3 — no GSTIN or VAT fields visible on en locale', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await expect(page.locator('input[name="billedBy.gstin"]')).toHaveCount(0);
    await expect(page.locator('input[name="billedBy.vatNumber"]')).toHaveCount(0);
  });

  // ── 4. Currency selection ──────────────────────────────────────────────────

  test('4 — currency can be changed to EUR', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm({
      currency: 'EUR',
      business: enGlobal.businesses.minimal,
      client: { name: 'Euro Client' },
      items: [{ quantity: '1', rate: '1000' }],
    });

    await invoicePage.clickSaveAndContinue();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── 5. End-to-end with login ───────────────────────────────────────────────

  test('5 — end-to-end: fill → save → login', async ({ page }) => {
    test.slow();
    const { password, captchaWait } = getCredentials();
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm(enGlobal.fullInvoice);
    await invoicePage.clickSaveAndContinue();
    await invoicePage.loginAfterSave(password, captchaWait);

    await expect(page).not.toHaveURL(/free-online-invoice-generator/, { timeout: 30_000 });
  });

});
