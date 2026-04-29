/**
 * Invoice Service
 *
 * Orchestration layer: creates invoices and applies post-creation steps
 * (payments, etc.) through the modifier engine.
 *
 * This is the correct place for "create invoice + pay it" logic —
 * not the factory (entity creation only) and not the CLI (UI only).
 *
 * CLI → InvoiceService → InvoiceFactory + PaymentFactory → API
 *
 * Usage:
 *   const result = await createInvoice(api, urlKey, {
 *     type:      'gst',
 *     modifiers: { paid: true, shipping: true },
 *     input:     { items: [{ name: 'Design', quantity: 1, rate: 30000, gstRate: 18 }] },
 *   });
 *
 *   const results = await createInvoiceBulk(api, urlKey, 5, {
 *     type:      'basic',
 *     modifiers: { overdue: true },
 *   });
 */

import { ApiClient }     from '../core/apiClient';
import {
  createGSTInvoice,
  createBasicInvoice,
  Invoice,
  InvoiceInput,
  invoiceViewUrl,
  computeInvoiceTotal,
} from '../factories/invoice.factory';
import { addPayment, PaymentMethod } from '../factories/payment.factory';
import { applyInputModifiers, InvoiceModifiers } from './modifier.service';

// ─── types ────────────────────────────────────────────────────────────────

export interface CreateInvoiceOptions {
  type?:          'gst' | 'basic';
  modifiers?:     InvoiceModifiers;
  input?:         InvoiceInput;
  paymentMethod?: PaymentMethod;
}

export interface InvoiceResult {
  invoice:       Invoice;
  url:           string;
  paymentAmount: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
}

// ─── service ──────────────────────────────────────────────────────────────

const DEFAULT_GST_ITEMS  = [{ name: 'Consulting Services', quantity: 1, rate: 10000, gstRate: 18 }];
const DEFAULT_BASIC_ITEMS = [{ name: 'Consulting Services', quantity: 1, rate: 1000 }];

/**
 * Create a single invoice and apply post-creation modifiers (payments).
 */
export async function createInvoice(
  api:     ApiClient,
  urlKey:  string,
  options: CreateInvoiceOptions = {},
): Promise<InvoiceResult> {
  const {
    type          = 'gst',
    modifiers     = {},
    input         = {},
    paymentMethod = 'ACCOUNT_TRANSFER',
  } = options;

  const resolvedInput = applyInputModifiers(input as Record<string, unknown>, modifiers) as InvoiceInput;

  const createFn = type === 'basic' ? createBasicInvoice : createGSTInvoice;
  const invoice  = await createFn(api, urlKey, resolvedInput);

  let paymentAmount = 0;
  let paymentStatus: InvoiceResult['paymentStatus'] = 'UNPAID';

  if (!modifiers.draft) {
    if (modifiers.paid) {
      paymentAmount = (invoice.finalTotal?.total as number | undefined)
        ?? computeInvoiceTotal(input.items ?? (type === 'basic' ? DEFAULT_BASIC_ITEMS : DEFAULT_GST_ITEMS));

      await addPayment(api, urlKey, invoice._id, {
        amount:        paymentAmount,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod,
        notes:         'QA full payment',
      });
      paymentStatus = 'PAID';

    } else if (modifiers.partial && modifiers.partial > 0) {
      paymentAmount = modifiers.partial;
      await addPayment(api, urlKey, invoice._id, {
        amount:        paymentAmount,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod,
        notes:         'QA partial payment',
      });
      paymentStatus = 'PARTIAL';
    }
  }

  return { invoice, url: invoiceViewUrl(invoice), paymentAmount, paymentStatus };
}

/**
 * Create N invoices with the same options. Logs progress for count > 1.
 */
export async function createInvoiceBulk(
  api:     ApiClient,
  urlKey:  string,
  count:   number,
  options: CreateInvoiceOptions = {},
): Promise<InvoiceResult[]> {
  const results: InvoiceResult[] = [];
  for (let i = 0; i < count; i++) {
    if (count > 1) console.log(`\n[invoice.service] [${i + 1}/${count}]`);
    results.push(await createInvoice(api, urlKey, options));
  }
  return results;
}
