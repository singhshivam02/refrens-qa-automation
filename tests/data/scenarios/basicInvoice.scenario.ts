/**
 * Basic Invoice Scenario
 *
 * Creates a complete data set for a global (no-tax) invoice test:
 *   business (POST /businesses)
 *   → invoice (POST /businesses/:urlKey/invoices, currency=USD, no tax)
 *
 * Usage:
 *   import { test, expect } from '../fixtures/dataFixtures';
 *
 *   let data: BasicInvoiceScenarioResult;
 *
 *   test.beforeEach(async ({ getTestData }) => {
 *     data = await getTestData('basic');
 *   });
 *
 *   test('shows invoice number', async ({ page }) => {
 *     await page.goto(data.url);
 *     await expect(page.getByText(data.invoice.invoiceNumber)).toBeVisible();
 *   });
 */

import { ApiClient } from '../core/apiClient';
import { createBusiness, Business, BusinessInput } from '../factories/business.factory';
import { buildBasicClient, BilledTo, ClientInput } from '../factories/client.factory';
import { createBasicInvoice, Invoice, InvoiceInput, invoiceViewUrl } from '../factories/invoice.factory';

// ─── types ────────────────────────────────────────────────────────────────

export interface BasicInvoiceScenarioResult {
  business: Business;
  billedTo: BilledTo;
  invoice:  Invoice;
  /** Public share URL — pass directly to page.goto() */
  url: string;
}

export interface BasicInvoiceScenarioOptions {
  business?: Partial<BusinessInput>;
  client?:   ClientInput;
  invoice?:  InvoiceInput;
}

// ─── scenario ─────────────────────────────────────────────────────────────

/**
 * @example
 *   const data = await createBasicInvoiceScenario(api);
 *
 *   // With overrides:
 *   const data = await createBasicInvoiceScenario(api, {
 *     client:  { name: 'Acme Corp', country: 'US' },
 *     invoice: { currency: 'GBP', items: [{ name: 'Design', quantity: 1, rate: 3000 }] },
 *   });
 */
export async function createBasicInvoiceScenario(
  api:     ApiClient,
  options: BasicInvoiceScenarioOptions = {},
): Promise<BasicInvoiceScenarioResult> {
  console.log('[scenario:basicInvoice] ── start ─────────────────────────────');

  const business = await createBusiness(api, options.business);
  const billedTo = buildBasicClient(options.client);

  const invoice  = await createBasicInvoice(api, business.urlKey, {
    ...options.invoice,
    billedTo: options.invoice?.billedTo ?? billedTo,
  });

  const url = invoiceViewUrl(invoice);

  console.log(`[scenario:basicInvoice] ✓ url=${url}`);
  console.log('[scenario:basicInvoice] ── done ──────────────────────────────');

  return { business, billedTo, invoice, url };
}
