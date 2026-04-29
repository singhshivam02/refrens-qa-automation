/**
 * Cleanup helpers
 *
 * Cancel entities created by scenarios after a test completes.
 * All functions are best-effort — they log errors rather than throwing,
 * so a cleanup failure never fails the test itself.
 *
 * Note: The Refrens API does not expose a DELETE endpoint for invoices.
 * Cleanup cancels the invoice instead (PATCH → status: CANCELED).
 * Businesses created during tests are not deleted (no API endpoint for that).
 *
 * Usage:
 *   test.afterEach(async () => {
 *     const api = await ApiClient.create();
 *     await cleanupScenario(api, testData);
 *   });
 */

import { ApiClient } from './apiClient';
import { cancelInvoice } from '../factories/invoice.factory';

// ─── types ────────────────────────────────────────────────────────────────

/** Minimal shape accepted by cleanup functions — any scenario result satisfies this. */
export interface CleanupTarget {
  business: { urlKey: string };
  invoice:  { _id: string };
}

// ─── helpers ──────────────────────────────────────────────────────────────

export async function cleanupInvoice(
  api:       ApiClient,
  urlKey:    string,
  invoiceId: string,
): Promise<void> {
  try {
    await cancelInvoice(api, urlKey, invoiceId, true);
    console.log(`[cleanup] ✓ cancelled invoice ${invoiceId}`);
  } catch (err) {
    console.warn(`[cleanup] could not cancel invoice ${invoiceId}: ${err}`);
  }
}

// ─── scenario-level cleanup ───────────────────────────────────────────────

/**
 * Cancel the invoice created by a scenario.
 *
 * @example
 *   test.afterEach(async () => {
 *     const api = await ApiClient.create();
 *     await cleanupScenario(api, testData);
 *   });
 */
export async function cleanupScenario(
  api:  ApiClient,
  data: CleanupTarget,
): Promise<void> {
  console.log('[cleanup] ── start ──────────────────────────────────────────');
  await cleanupInvoice(api, data.business.urlKey, data.invoice._id);
  console.log('[cleanup] ── done ───────────────────────────────────────────');
}
