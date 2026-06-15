/**
 * Lydia Checklist — Logged-in App Flows
 *
 * Prerequisite: storageState.json must exist.
 *   Run auth.setup (solve CAPTCHA once) — all tests here reuse that session.
 *   Credentials: QA_EMAIL / QA_PASSWORD in .env  (shivam.s@refrens.com)
 *
 * How to run:
 *   npx playwright test --project=lydia --headed
 *   npx playwright test --project=lydia --headed -g "invoice creation"
 *
 * URL pattern:
 *   staging.bizsuggest.com/app/{urlKey}/...
 *   Invoice dashboard: /app/{urlKey}/invoices
 *
 * Business urlKey is read from DEFAULT_URL_KEY in .env.
 * Set it once: qa use business <urlKey>
 *
 * Checklist:
 *   1.  Auth verification    confirm /app URL, not on /login
 *   2.  Invoice dashboard    navigate to /app/{urlKey}/invoices
 *   3.  Invoice creation     fill form, add new client, add line items, save
 *   4.  Invoice reports      navigate to reports section
 *   5.  Quotation            navigate to quotations section (placeholder)
 */

import { test, expect, Page } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────

const urlKey = (process.env.DEFAULT_URL_KEY || 'test-premium-check').trim();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Click the first visible element among the given selectors. */
async function clickFirst(page: Page, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await loc.click();
      return;
    }
  }
  await page.locator(selectors[selectors.length - 1]).first().click();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Auth Verification
// ─────────────────────────────────────────────────────────────────────────────

test.describe('1. Auth — session verification', () => {

  test('storageState session is active, URL is /app', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    console.log(`[auth] landed at: ${url}`);

    // Logged-in users land in /app/..., never /login
    await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
    console.log('[auth] ✓ session active');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Invoice Dashboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('2. Invoice dashboard', () => {

  test('navigate to /app/{urlKey}/invoices', async ({ page }) => {
    await page.goto(`/app/${urlKey}/invoices`);
    await page.waitForLoadState('networkidle');

    console.log(`[invoices] at: ${page.url()}`);

    await expect(page).toHaveURL(/\/invoices/, { timeout: 15_000 });

    // Dashboard should have a create button or invoice list
    const createBtn = page.locator([
      'button:has-text("Create Invoice")',
      'button:has-text("New Invoice")',
      'a:has-text("Create Invoice")',
      'button:has-text("Create new")',
    ].join(', ')).first();

    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    console.log('[invoices] ✓ dashboard loaded, create button visible');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Invoice Creation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('3. Invoice creation', () => {

  test('create a new invoice with a new client', async ({ page }) => {
    test.slow();

    const ts = Date.now();
    const clientFirstName = 'QA';
    const clientLastName  = `Test-${ts}`;
    const clientEmail     = `qa.test+${ts}@refrens.com`;
    const contactId       = `QA-${ts}`;

    // ── Navigate to invoice dashboard ────────────────────────────────────────
    await page.goto(`/app/${urlKey}/invoices`);
    await page.waitForLoadState('networkidle');
    console.log(`[create] at: ${page.url()}`);

    // ── Click "Create Invoice" ────────────────────────────────────────────────
    await clickFirst(page, [
      'button:has-text("Create Invoice")',
      'button:has-text("New Invoice")',
      'a:has-text("Create Invoice")',
      'button:has-text("Create new")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[create] form at: ${page.url()}`);

    // ── Wait for invoice form ─────────────────────────────────────────────────
    await page.locator('input[name="invoiceNumber"]').waitFor({ state: 'visible', timeout: 15_000 });

    // ── Invoice number (auto-filled — just assert it's set) ───────────────────
    const invoiceNumber = await page.locator('input[name="invoiceNumber"]').inputValue();
    expect(invoiceNumber).toBeTruthy();
    console.log(`[create] invoice number: ${invoiceNumber}`);

    // ── Invoice date (already filled to today — assert not empty) ────────────
    const invoiceDate = await page.locator('input[name="invoiceDate"]').inputValue();
    expect(invoiceDate).toBeTruthy();
    console.log(`[create] invoice date: ${invoiceDate}`);

    // ── Billed To — Add New Client ────────────────────────────────────────────
    console.log('[create] opening "Add New Client" drawer...');
    await page.locator('button:has-text("Add New Client")').first().click();

    // Wait for the "Create New Contact" drawer
    const drawer = page.locator('.refrens-drawer-content').filter({ hasText: 'Create New Contact' });
    await drawer.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('[create] ✓ Create New Contact drawer open');

    // Fill client details
    await drawer.locator('input[name="firstName"]').fill(clientFirstName);
    await drawer.locator('input[name="lastName"]').fill(clientLastName);
    await drawer.locator('input[name="email"]').fill(clientEmail);
    // Contact ID is required
    await drawer.locator('input[name="uniqueKey"]').fill(contactId);

    console.log(`[create] client: ${clientFirstName} ${clientLastName} (${contactId})`);

    // Save the contact
    await drawer.locator('button[type="submit"]:has-text("Save Changes")').click();
    await page.waitForLoadState('networkidle');
    console.log('[create] ✓ client saved');

    // Verify client is now selected in Billed To
    await expect(
      page.locator('.disco-select__single-value, .disco-select-creatable__single-value')
        .filter({ hasText: clientFirstName })
        .first()
    ).toBeVisible({ timeout: 8_000 });
    console.log('[create] ✓ client set in Billed To');

    // ── Line items ────────────────────────────────────────────────────────────
    // The first row is pre-populated. Fill name, quantity, rate.
    const itemName = page.locator([
      'input[name="items[0].name"]',
      'input[placeholder*="Item" i]',
      'input[placeholder*="Description" i]',
    ].join(', ')).first();

    if (await itemName.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await itemName.fill('QA Test Service');

      const qty = page.locator('input[name="items[0].quantity"]').first();
      if (await qty.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await qty.click({ clickCount: 3 });
        await qty.fill('1');
      }

      const rate = page.locator('input[name="items[0].rate"]').first();
      if (await rate.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await rate.click({ clickCount: 3 });
        await rate.fill('1000');
      }

      console.log('[create] ✓ line item filled: QA Test Service × 1 @ ₹1000');
    } else {
      console.log('[create] ⚠ line item input not found — pause for manual inspection');
    }

    // ── Pause for visual inspection before saving ─────────────────────────────
    // Review the form, then press Resume to close.
    await page.pause();

    // ── Save the invoice ──────────────────────────────────────────────────────
    // Uncomment once the form is confirmed correct:
    // await clickFirst(page, [
    //   'button:has-text("Save")',
    //   'button:has-text("Save Invoice")',
    //   'button:has-text("Create Invoice")',
    //   'button[type="submit"]',
    // ]);
    // await page.waitForLoadState('networkidle');
    // console.log(`[create] ✓ invoice saved — at: ${page.url()}`);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Invoice Reports
// ─────────────────────────────────────────────────────────────────────────────

test.describe('4. Invoice reports', () => {

  test('navigate to reports section', async ({ page }) => {
    await page.goto(`/app/${urlKey}/invoices`);
    await page.waitForLoadState('networkidle');

    // Try to find a Reports nav link
    const reportsNav = page.locator([
      `a[href*="/${urlKey}/reports"]`,
      'a[href*="/reports"]',
      'a:has-text("Reports")',
      'nav a:has-text("Report")',
      'li a:has-text("Report")',
    ].join(', ')).first();

    if (await reportsNav.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reportsNav.click();
      await page.waitForLoadState('networkidle');
      console.log(`[reports] navigated to: ${page.url()}`);
    } else {
      await page.goto(`/app/${urlKey}/reports`);
      await page.waitForLoadState('networkidle');
      console.log(`[reports] direct nav to: ${page.url()}`);
    }

    // Pause to inspect the reports page structure
    await page.pause();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Quotation (placeholder — add flows after invoice is confirmed)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('5. Quotation', () => {

  test('navigate to quotations section', async ({ page }) => {
    await page.goto(`/app/${urlKey}/invoices`);
    await page.waitForLoadState('networkidle');

    const quotationNav = page.locator([
      `a[href*="/${urlKey}/quotation"]`,
      `a[href*="/${urlKey}/quotes"]`,
      'a:has-text("Quotation")',
      'a:has-text("Quote")',
      'nav a:has-text("Quotation")',
    ].join(', ')).first();

    if (await quotationNav.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await quotationNav.click();
      await page.waitForLoadState('networkidle');
      console.log(`[quotation] navigated to: ${page.url()}`);
    } else {
      await page.goto(`/app/${urlKey}/quotations`);
      await page.waitForLoadState('networkidle');
      console.log(`[quotation] direct nav to: ${page.url()}`);
    }

    await page.pause();
  });

});
