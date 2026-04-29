/**
 * Payment Factory
 *
 * Add and retrieve payments on an invoice via the Refrens API.
 *
 *   POST /businesses/:urlKey/invoices/:invoiceId/payments  → add payment
 *   GET  /businesses/:urlKey/invoices/:invoiceId/payments  → list payments
 *
 * All functions require `urlKey` from business and `_id` from invoice.
 */

import { ApiClient } from '../core/apiClient';

// ─── types ────────────────────────────────────────────────────────────────

export type PaymentMethod =
  | 'ACCOUNT_TRANSFER'
  | 'CASH'
  | 'CHEQUE'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'DD'
  | 'UPI';

export interface Payment {
  _id:               string;
  amount:            number;
  paymentDate:       string;
  paymentMethod:     PaymentMethod;
  tds?:              number;
  transactionCharge?: number;
  notes?:            string;
  refId?:            string;
  business?:         string;
  payerBusiness?:    string;
  isApproved?:       boolean;
  isRemoved?:        boolean;
  appId?:            string;
}

export interface PaymentInput {
  amount:            number;
  paymentDate:       string;   // ISO 8601
  paymentMethod:     PaymentMethod;
  tds?:              number;
  transactionCharge?: number;
  notes?:            string;
  refId?:            string;
}

export interface PaymentsResponse {
  payments: Payment[];
}

// ─── helpers ──────────────────────────────────────────────────────────────

function isoDate(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ─── factories ─────────────────────────────────────────────────────────────

/**
 * Record a payment against an invoice.
 *
 * @example
 *   const payment = await addPayment(api, business.urlKey, invoice._id, {
 *     amount:        5000,
 *     paymentDate:   '2024-12-01',
 *     paymentMethod: 'UPI',
 *   });
 *
 *   // Full payment with all fields:
 *   const payment = await addPayment(api, business.urlKey, invoice._id, {
 *     amount:            118000,
 *     paymentDate:       isoDate(),
 *     paymentMethod:     'ACCOUNT_TRANSFER',
 *     tds:               10000,
 *     transactionCharge: 50,
 *     notes:             'Final payment',
 *     refId:             'TXN-20241201',
 *   });
 */
export async function addPayment(
  api:       ApiClient,
  urlKey:    string,
  invoiceId: string,
  data:      PaymentInput,
): Promise<Payment> {
  console.log(
    `[factory:payment] adding ₹${data.amount} via ${data.paymentMethod}` +
    ` to invoice ${invoiceId}`,
  );

  const payment = await api.post<Payment>(
    `/businesses/${urlKey}/invoices/${invoiceId}/payments`,
    data,
  );

  console.log(`[factory:payment] ✓ _id=${payment._id}`);
  return payment;
}

/**
 * Retrieve all payments recorded against an invoice.
 *
 * @example
 *   const { payments } = await getPayments(api, business.urlKey, invoice._id);
 *   const total = payments.reduce((sum, p) => sum + p.amount, 0);
 */
export async function getPayments(
  api:       ApiClient,
  urlKey:    string,
  invoiceId: string,
): Promise<PaymentsResponse> {
  return api.get<PaymentsResponse>(
    `/businesses/${urlKey}/invoices/${invoiceId}/payments`,
  );
}

/**
 * Add a full payment for the invoice's outstanding amount in one call.
 * Convenience wrapper that sets today as the payment date.
 */
export async function payInFull(
  api:           ApiClient,
  urlKey:        string,
  invoiceId:     string,
  amount:        number,
  method:        PaymentMethod = 'ACCOUNT_TRANSFER',
  notes?:        string,
): Promise<Payment> {
  return addPayment(api, urlKey, invoiceId, {
    amount,
    paymentDate:   isoDate(),
    paymentMethod: method,
    notes,
  });
}
