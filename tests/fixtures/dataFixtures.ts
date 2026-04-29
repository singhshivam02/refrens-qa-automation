/**
 * Extended Playwright test fixture
 *
 * Adds a `getTestData` helper to every test.  Import `test` from this
 * file instead of `@playwright/test` to get the extra fixture.
 *
 * Auth is handled via API key (API_APP_ID + API_APP_SECRET in .env).
 * No browser session or storageState.json required for data creation.
 *
 * Usage:
 *
 *   import { test, expect } from '../fixtures/dataFixtures';
 *
 *   test('view GST invoice', async ({ page, getTestData }) => {
 *     const data = await getTestData('gst');
 *     await page.goto(data.url);
 *     await expect(page.locator('h1')).toContainText(data.invoice.invoiceNumber);
 *   });
 *
 *   // Or with beforeEach:
 *   let data: TestScenarioResult;
 *   test.beforeEach(async ({ getTestData }) => {
 *     data = await getTestData('basic');
 *   });
 *
 * Scenarios
 * ─────────
 *   'gst'   → Indian GST invoice (INR, 18% tax, Indian client)
 *   'basic' → Global invoice (USD, no tax, global client)
 */

import { test as base, expect } from '@playwright/test';
import { ApiClient } from '../data/core/apiClient';
import {
  createGSTInvoiceScenario,
  GSTInvoiceScenarioResult,
  GSTInvoiceScenarioOptions,
} from '../data/scenarios/gstInvoice.scenario';
import {
  createBasicInvoiceScenario,
  BasicInvoiceScenarioResult,
  BasicInvoiceScenarioOptions,
} from '../data/scenarios/basicInvoice.scenario';

// ─── types ────────────────────────────────────────────────────────────────

export type ScenarioType = 'gst' | 'basic';
export type TestScenarioResult = GSTInvoiceScenarioResult | BasicInvoiceScenarioResult;

type ScenarioOptions<T extends ScenarioType> = T extends 'gst'
  ? GSTInvoiceScenarioOptions
  : BasicInvoiceScenarioOptions;

// ─── shared API client ────────────────────────────────────────────────────

// One ApiClient per process; authenticated at most once (token is cached).
let _sharedApi: ApiClient | null = null;

async function getSharedApi(): Promise<ApiClient> {
  if (!_sharedApi) _sharedApi = await ApiClient.create();
  return _sharedApi;
}

// ─── fixture definition ───────────────────────────────────────────────────

type DataFixtures = {
  /**
   * Create a named scenario and return the ready-to-use data bundle.
   *
   * @example
   *   const data = await getTestData('gst');
   *   const data = await getTestData('basic', { client: { name: 'Custom Corp' } });
   */
  getTestData: <T extends ScenarioType>(
    scenario: T,
    options?: ScenarioOptions<T>,
  ) => Promise<TestScenarioResult>;
};

export const test = base.extend<DataFixtures>({
  getTestData: async ({}, use) => {
    const api = await getSharedApi();

    const helper = async <T extends ScenarioType>(
      scenario: T,
      options:  ScenarioOptions<T> = {} as ScenarioOptions<T>,
    ): Promise<TestScenarioResult> => {
      switch (scenario) {
        case 'gst':
          return createGSTInvoiceScenario(api, options as GSTInvoiceScenarioOptions);
        case 'basic':
          return createBasicInvoiceScenario(api, options as BasicInvoiceScenarioOptions);
        default:
          throw new Error(
            `[getTestData] unknown scenario: "${scenario}". Use 'gst' or 'basic'.`,
          );
      }
    };

    await use(helper);
  },
});

export { expect };
