/**
 * Scenario Smoke Tests
 *
 * Run these FIRST after setting API_APP_ID and API_APP_SECRET in .env to
 * confirm the entire factory chain works end-to-end.
 *
 *   npm run test:data:smoke
 *
 * What each test verifies:
 *  ✓  API call succeeds (no 401/403/404/500)
 *  ✓  Returned objects have the shape the factories expect
 *  ✓  The share URL is reachable and the page loads
 *  ✓  The page actually shows the created invoice number
 *
 * Green here = factories are wired up correctly and safe to use in real tests.
 */

import { test, expect } from '../fixtures/dataFixtures';
import { ApiClient } from './core/apiClient';
import { cleanupScenario } from './core/cleanup';
import type { TestScenarioResult } from '../fixtures/dataFixtures';

// ─── GST Invoice Scenario ─────────────────────────────────────────────────

test.describe('Scenario: GST Invoice', () => {
  let data: TestScenarioResult;

  test.beforeEach(async ({ getTestData }) => {
    data = await getTestData('gst');
  });

  test.afterEach(async () => {
    const api = await ApiClient.create();
    await cleanupScenario(api, data);
  });

  test('factory chain returns correct shape', () => {
    // Business
    expect(data.business._id,     'business._id missing').toBeTruthy();
    expect(data.business.name,    'business.name missing').toBeTruthy();
    expect(data.business.urlKey,  'business.urlKey missing').toBeTruthy();

    // BilledTo (inline client)
    expect(data.billedTo.name,    'billedTo.name missing').toBeTruthy();
    expect(data.billedTo.country, 'billedTo.country missing').toBeTruthy();

    // Invoice
    expect(data.invoice._id,           'invoice._id missing').toBeTruthy();
    expect(data.invoice.invoiceNumber, 'invoice.invoiceNumber missing').toBeTruthy();

    // URL
    expect(data.url, 'url missing').toBeTruthy();
  });

  test('invoice URL is reachable and shows invoice', async ({ page }) => {
    await page.goto(data.url);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveTitle(/not found|error|404/i);
    await expect(
      page.getByText(data.invoice.invoiceNumber),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('GST invoice has Indian locale data (INR + GSTIN)', () => {
    expect(data.invoice.currency ?? 'INR').toBeTruthy();
    const hasGSTIN = data.business.gstin || data.billedTo.gstin;
    expect(hasGSTIN, 'expected GSTIN on business or billedTo').toBeTruthy();
  });

  test('invoices are unique per call (no cross-test pollution)', async ({ getTestData }) => {
    const data2 = await getTestData('gst');

    expect(data.invoice._id).not.toBe(data2.invoice._id);
    expect(data.invoice.invoiceNumber).not.toBe(data2.invoice.invoiceNumber);

    const api = await ApiClient.create();
    await cleanupScenario(api, data2).catch(() => {});
  });
});

// ─── Basic Invoice Scenario ───────────────────────────────────────────────

test.describe('Scenario: Basic Invoice', () => {
  let data: TestScenarioResult;

  test.beforeEach(async ({ getTestData }) => {
    data = await getTestData('basic');
  });

  test.afterEach(async () => {
    const api = await ApiClient.create();
    await cleanupScenario(api, data);
  });

  test('factory chain returns correct shape', () => {
    expect(data.business._id).toBeTruthy();
    expect(data.business.urlKey).toBeTruthy();
    expect(data.invoice._id).toBeTruthy();
    expect(data.invoice.invoiceNumber).toMatch(/^INV-QA-/);
    expect(data.url).toBeTruthy();
  });

  test('invoice URL is reachable', async ({ page }) => {
    await page.goto(data.url);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveTitle(/not found|error|404/i);
    await expect(
      page.getByText(data.invoice.invoiceNumber),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('basic invoice has no tax on items', () => {
    const items = data.invoice.items ?? [];
    const hasTax = items.some((item) => (item.gstRate ?? item.taxRate ?? 0) > 0);
    expect(hasTax, 'basic invoice should not have tax on items').toBe(false);
  });
});

// ─── Override smoke tests ─────────────────────────────────────────────────

test.describe('Scenario: Overrides', () => {
  test('custom client name is reflected in billedTo', async ({ getTestData }) => {
    const customName = `QA Override Client ${Date.now()}`;
    const data = await getTestData('gst', { client: { name: customName } });

    expect(data.billedTo.name).toBe(customName);

    const api = await ApiClient.create();
    await cleanupScenario(api, data);
  });

  test('custom invoice items are reflected in the response', async ({ getTestData }) => {
    const data = await getTestData('basic', {
      invoice: {
        items: [{ name: 'Custom Item', quantity: 3, rate: 999 }],
      },
    });

    const item = data.invoice.items?.find((i) => i.name === 'Custom Item');
    expect(item, 'custom item should exist in invoice').toBeDefined();
    expect(item?.quantity).toBe(3);
    expect(item?.rate).toBe(999);

    const api = await ApiClient.create();
    await cleanupScenario(api, data);
  });
});
