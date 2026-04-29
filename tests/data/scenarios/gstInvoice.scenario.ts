/**
 * GST Invoice Scenario
 *
 * Creates a complete data set for an Indian GST invoice test:
 *   business (POST /businesses)
 *   → invoice (POST /businesses/:urlKey/invoices, currency=INR, 18% GST)
 *
 * Usage:
 *   import { test, expect } from '../fixtures/dataFixtures';
 *
 *   let data: GSTInvoiceScenarioResult;
 *
 *   test.beforeEach(async ({ getTestData }) => {
 *     data = await getTestData('gst');
 *   });
 *
 *   test('shows invoice number', async ({ page }) => {
 *     await page.goto(data.url);
 *     await expect(page.getByText(data.invoice.invoiceNumber)).toBeVisible();
 *   });
 */

import { ApiClient } from '../core/apiClient';
import { createBusiness, Business, BusinessInput } from '../factories/business.factory';
import { buildGSTClient, BilledTo, ClientInput } from '../factories/client.factory';
import { createGSTInvoice, Invoice, InvoiceInput, invoiceViewUrl } from '../factories/invoice.factory';

// ─── types ────────────────────────────────────────────────────────────────

export interface GSTInvoiceScenarioResult {
  business: Business;
  billedTo: BilledTo;
  invoice:  Invoice;
  /** Public share URL — pass directly to page.goto() */
  url: string;
}

export interface GSTInvoiceScenarioOptions {
  business?: Partial<BusinessInput>;
  client?:   ClientInput;
  invoice?:  InvoiceInput;
}

// ─── scenario ─────────────────────────────────────────────────────────────

/**
 * @example
 *   const data = await createGSTInvoiceScenario(api);
 *
 *   // With overrides:
 *   const data = await createGSTInvoiceScenario(api, {
 *     client:  { name: 'Acme India', gstin: '27ZZZZZ9999Z1Z5' },
 *     invoice: { items: [{ name: 'Web Design', quantity: 1, rate: 40000, gstRate: 18 }] },
 *   });
 */
export async function createGSTInvoiceScenario(
  api:     ApiClient,
  options: GSTInvoiceScenarioOptions = {},
): Promise<GSTInvoiceScenarioResult> {
  console.log('[scenario:gstInvoice] ── start ──────────────────────────────');

  const business = await createBusiness(api, options.business);
  const billedTo = buildGSTClient(options.client);

  const invoice  = await createGSTInvoice(api, business.urlKey, {
    ...options.invoice,
    billedTo: options.invoice?.billedTo ?? billedTo,
  });

  const url = invoiceViewUrl(invoice);

  console.log(`[scenario:gstInvoice] ✓ url=${url}`);
  console.log('[scenario:gstInvoice] ── done ───────────────────────────────');

  return { business, billedTo, invoice, url };
}
