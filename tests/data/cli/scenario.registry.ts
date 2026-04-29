/**
 * Scenario Registry
 *
 * Central map of scenario name → async function.
 * Used by the CLI (`qa scenario <name>`) and by Playwright fixtures.
 *
 * ── Available scenarios ──────────────────────────────────────────────────
 *
 *  Foundational (full setup: new business + invoice)
 *    gst / gst-invoice          Indian GST invoice (INR, 18% tax)
 *    basic / basic-invoice      Global invoice (USD, no tax)
 *
 *  Invoice states  (new business + GST invoice with modifier applied)
 *    paid-invoice               GST invoice — full payment recorded
 *    overdue-invoice            GST invoice — due date 30 days ago
 *    invoice-with-shipping      GST invoice — shipping details included
 *    draft-invoice              GST invoice — created, no payment step
 *    premium-invoice            GST invoice — paid + shipping
 *    basic-paid                 Basic invoice — full payment recorded
 *
 * ── Adding a new scenario ────────────────────────────────────────────────
 *   Option A — full scenario file:
 *     1. Create tests/data/scenarios/myScenario.scenario.ts
 *     2. Import and add to SCENARIOS below
 *
 *   Option B — inline lambda (simple modifier variants):
 *     Add a lambda under "── modifier-based scenarios ──" below.
 */

import type { ApiClient } from '../core/apiClient';
import { createGSTInvoiceScenario }   from '../scenarios/gstInvoice.scenario';
import { createBasicInvoiceScenario } from '../scenarios/basicInvoice.scenario';
import { createBusiness }             from '../factories/business.factory';
import { createInvoice }              from '../services/invoice.service';
import type { InvoiceModifiers }      from '../services/modifier.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScenarioFn = (api: ApiClient, options?: any) => Promise<unknown>;

// ── helper: build a lambda scenario around a modifier set ─────────────────

function gstScenarioWith(modifiers: InvoiceModifiers): ScenarioFn {
  return async (api: ApiClient) => {
    const business = await createBusiness(api);
    const result   = await createInvoice(api, business.urlKey, { type: 'gst', modifiers });
    return { business, ...result };
  };
}

function basicScenarioWith(modifiers: InvoiceModifiers): ScenarioFn {
  return async (api: ApiClient) => {
    const business = await createBusiness(api);
    const result   = await createInvoice(api, business.urlKey, { type: 'basic', modifiers });
    return { business, ...result };
  };
}

// ── registry ──────────────────────────────────────────────────────────────

export const SCENARIOS: Record<string, ScenarioFn> = {
  // Foundational — full scenario files (business + invoice)
  'gst':                    createGSTInvoiceScenario,
  'gst-invoice':            createGSTInvoiceScenario,
  'basic':                  createBasicInvoiceScenario,
  'basic-invoice':          createBasicInvoiceScenario,

  // ── modifier-based scenarios ───────────────────────────────────────────
  'paid-invoice':           gstScenarioWith({ paid: true }),
  'overdue-invoice':        gstScenarioWith({ overdue: true }),
  'invoice-with-shipping':  gstScenarioWith({ shipping: true }),
  'draft-invoice':          gstScenarioWith({ draft: true }),
  'premium-invoice':        gstScenarioWith({ paid: true, shipping: true }),
  'basic-paid':             basicScenarioWith({ paid: true }),
  'basic-overdue':          basicScenarioWith({ overdue: true }),
};

/**
 * Look up a scenario by name, throwing a clear error if not found.
 */
export function getScenario(name: string): ScenarioFn {
  const fn = SCENARIOS[name];
  if (!fn) {
    const available = Object.keys(SCENARIOS).join(', ');
    throw new Error(`Unknown scenario: "${name}". Available: ${available}`);
  }
  return fn;
}
