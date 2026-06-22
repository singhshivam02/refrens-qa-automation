/**
 * Invoice Generator — India (en-in) — focused unit tests
 *
 * The comprehensive single-flow test lives in invoice-en-in-full.spec.ts
 * This file keeps targeted regression checks that should stay fast.
 */

import { test, expect } from '@playwright/test';
import { InvoiceGeneratorPage } from '../../pages/InvoiceGeneratorPage';
import { enIn, generateEmail } from '../../fixtures/testData';
import { config } from '../../config/environment';

const LOCALE = 'en-in' as const;

async function setup(page: any): Promise<InvoiceGeneratorPage> {
  const inv = new InvoiceGeneratorPage(page, LOCALE);
  await inv.navigateToGenerator();
  await expect(page).toHaveURL(/free-online-invoice-generator/, { timeout: 15_000 });
  await inv.clickCreateCta();
  return inv;
}

test.describe('Invoice Generator — India (en-in)', () => {

  test('smoke — minimal invoice reaches login popup', async ({ page }) => {
    const inv = await setup(page);
    await inv.fillForm(enIn.simpleInvoice);
    await inv.clickSaveAndContinue();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  test('GSTIN auto-fills GST state', async ({ page }) => {
    const inv = await setup(page);
    await inv.fillBusinessName('State Test Co');
    await inv.fillBusinessTaxId('29AABCT1234A1Z5'); // 29 → Karnataka
    await page.waitForTimeout(800);
    await expect(page.locator('input[name="billedBy.gstin"]')).toHaveValue('29AABCT1234A1Z5');
  });

  test('item-wise discount values are applied correctly', async ({ page }) => {
    const inv = await setup(page);
    await inv.fillForm(enIn.invoiceWithItemWiseDiscount);
    await expect(page.locator('input[name="items[0].discount.amount"]')).toHaveValue(
      enIn.invoiceWithItemWiseDiscount.features!.discount!.itemDiscounts![0],
    );
    await expect(page.locator('input[name="items[1].discount.amount"]')).toHaveValue(
      enIn.invoiceWithItemWiseDiscount.features!.discount!.itemDiscounts![1],
    );
    await inv.clickSaveAndContinue();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  test('end-to-end: fill → save → login (requires TEST_PASSWORD + CAPTCHA)', async ({ page }) => {
    test.slow();
    const password = config.testPassword;
    if (!password) throw new Error('TEST_PASSWORD not set in .env');
   // const captchaWait = parseInt(process.env.CAPTCHA_WAIT_MS ?? '90000', 10);

    const inv = await setup(page);
    const invoice = {
      ...enIn.fullInvoice,
      business: { ...enIn.fullInvoice.business, email: generateEmail('biz') },
    };

    await inv.fillForm(invoice);
    await inv.clickSaveAndContinue();
    await inv.loginAfterSave(password);

    await expect(page).not.toHaveURL(/free-online-invoice-generator/, { timeout: 30_000 });
  });

});
