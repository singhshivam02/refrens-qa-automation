/**
 * Invoice Generator — United Kingdom (en-gb)
 *
 * Locale: en-gb | Tax: VAT | Currency: GBP
 * URL: /en-gb/free-online-invoice-generator
 *
 * Covers:
 *  1. Minimal invoice
 *  2. Full invoice (VAT No., two items with 20% VAT, notes, terms)
 *  3. Invoice with zero-rated VAT item
 *  4. End-to-end with login
 *
 * NOTE: VAT field name (billedBy.vatNumber) is a best-guess based on the
 * India (billedBy.gstin) naming pattern. Verify against the live en-gb DOM
 * and update config/locales.ts if different.
 */

import { test, expect } from '@playwright/test';
import { InvoiceGeneratorPage } from '../../pages/InvoiceGeneratorPage';
import { enGb } from '../../fixtures/testData';
import { config } from '../../config/environment';

const LOCALE = 'en-gb' as const;

test.describe('Invoice Generator — United Kingdom (en-gb)', () => {

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
    await expect(page).toHaveURL(/en-gb\/free-online-invoice-generator/, { timeout: 15_000 });
    await invoicePage.clickCreateCta();
    return invoicePage;
  }

  // ── 1. Minimal invoice ─────────────────────────────────────────────────────

  test('1 — minimal invoice', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm(enGb.simpleInvoice);
    await invoicePage.clickSaveAndContinue();

    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── 2. Full invoice with VAT ───────────────────────────────────────────────

  test('2 — full invoice: VAT No., two items, notes, terms', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm(enGb.fullInvoice);

    // Assert key fields
    await expect(page.locator('input[name="billedBy.name"]')).toHaveValue(enGb.fullInvoice.business.name);
    await expect(page.locator('input[name="billedTo.name"]')).toHaveValue(enGb.fullInvoice.client.name);

    await invoicePage.clickSaveAndContinue();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. Zero-rated VAT item ─────────────────────────────────────────────────

  test('3 — zero-rated VAT item (0%)', async ({ page }) => {
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm({
      currency: 'GBP',
      business: enGb.businesses.techLtd,
      client: enGb.clients.britishCorp,
      items: [enGb.lineItems.zeroRatedItem],
      features: { notes: 'Zero-rated supply.' },
    });

    await invoicePage.clickSaveAndContinue();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  // ── 4. No GSTIN field on en-gb ─────────────────────────────────────────────

  test('4 — GSTIN field absent on en-gb locale', async ({ page }) => {
    const invoicePage = await setupPage(page);

    // GSTIN field should not exist — en-gb uses VAT
    await expect(page.locator('input[name="billedBy.gstin"]')).toHaveCount(0);
  });

  // ── 5. End-to-end with login ───────────────────────────────────────────────

  test('5 — end-to-end: fill → save → login', async ({ page }) => {
    test.slow();
    const { password, captchaWait } = getCredentials();
    const invoicePage = await setupPage(page);

    await invoicePage.fillForm(enGb.fullInvoice);
    await invoicePage.clickSaveAndContinue();
    await invoicePage.loginAfterSave(password, captchaWait);

    await expect(page).not.toHaveURL(/free-online-invoice-generator/, { timeout: 30_000 });
  });

});
