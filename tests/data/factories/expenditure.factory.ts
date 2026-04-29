/**
 * Expenditure Factory
 *
 * CRUD for expenditures (purchase invoices / expenses) via the Refrens API.
 *
 * Flow: createVendor → POST /businesses/:urlKey/expenditures
 *
 * The factory auto-creates a vendor unless you pass `vendor` in the overrides.
 * The created vendor's _id is sent as the `vendor` field (required by the API).
 */

import { ApiClient } from '../core/apiClient';
import { createVendor, Client } from './client.factory';
import { faker } from '@faker-js/faker';

// ─── types ────────────────────────────────────────────────────────────────

export interface ExpenditureLineItem {
  name:         string;
  quantity:     number;
  rate:         number;
  gstRate?:     number;
  taxRate?:     number;
  description?: string;
}

export interface BilledParty {
  name:       string;
  country:    string;
  street?:    string;
  pincode?:   string;
  gstState?:  string;
  state?:     string;
  gstin?:     string;
  panNumber?: string;
  phone?:     string;
  email?:     string;
  [key: string]: unknown;
}

export interface Expenditure {
  _id:            string;
  expenseNumber?: string;
  invoiceNumber?: string;
  invoiceDate?:   string;
  currency?:      string;
  invoiceType?:   string;
  status:         string;
  billedBy:       BilledParty;
  billedTo?:      BilledParty;
  items:          ExpenditureLineItem[];
  finalTotal?: {
    total?:    number;
    subTotal?: number;
    tax?:      number;
    [key: string]: unknown;
  };
  share?: {
    viewLink?: string;
    pdfLink?:  string;
  };
  [key: string]: unknown;
}

export interface ExpenditureInput {
  /** Pre-created vendor. If omitted, createExpenditure will create one. */
  vendor?:        Client;
  expenseNumber?: string;
  invoiceDate?:   string;
  invoiceType?:   'INVOICE' | 'BOS';
  currency?:      string;
  taxType?:       string;
  placeOfSupply?: string;
  igst?:          boolean;
  dueInDays?:     number;
  billedTo?:      BilledParty;
  items?:         ExpenditureLineItem[];
}

export interface ExpenditureListResponse {
  total: number;
  limit: number;
  skip:  number;
  data:  Expenditure[];
}

// ─── defaults ─────────────────────────────────────────────────────────────

function isoDate(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const DEFAULT_ITEMS: ExpenditureLineItem[] = [
  { name: 'Office Supplies', quantity: 10, rate: 500, gstRate: 18 },
];

// ─── create ───────────────────────────────────────────────────────────────

/**
 * Create an expenditure for a business.
 *
 * A vendor is created automatically if `overrides.vendor` is not supplied.
 *
 * @example
 *   const exp = await createExpenditure(api, business.urlKey);
 *
 *   // With a pre-created vendor:
 *   const vendor = await createVendor(api, business.urlKey, { name: 'ACME' });
 *   const exp = await createExpenditure(api, business.urlKey, { vendor });
 */
export async function createExpenditure(
  api:       ApiClient,
  urlKey:    string,
  overrides: ExpenditureInput = {},
): Promise<Expenditure> {
  const vendor = overrides.vendor ?? await createVendor(api, urlKey, {
    name:     faker.company.name(),
    gstState: '27',
  });

  const invoiceDate = overrides.invoiceDate ?? isoDate();
  const dueInDays   = overrides.dueInDays   ?? 15;

  const payload: Record<string, unknown> = {
    taxType:       overrides.taxType       ?? 'INDIA',
    currency:      overrides.currency      ?? 'INR',
    invoiceType:   overrides.invoiceType   ?? 'INVOICE',
    billType:      'INVOICE',
    invoiceTitle:  'Expenditure',
    invoiceDate,
    dueInDays,
    dueDate:       isoDate(dueInDays),
    placeOfSupply: overrides.placeOfSupply ?? vendor.gstState ?? '27',
    igst:          overrides.igst          ?? false,
    reverseCharge: false,
    hideTaxes:     false,
    vendor:        vendor._id,
    billedBy: {
      _id:         vendor._id,
      name:        vendor.name,
      country:     vendor.country,
      clientType:  vendor.clientType ?? 'INDIVIDUAL',
      customFields: [],
    },
    items:         overrides.items ?? DEFAULT_ITEMS,
  };

  if (overrides.billedTo)      payload['billedTo']      = overrides.billedTo;
  if (overrides.expenseNumber) payload['expenseNumber'] = overrides.expenseNumber;

  console.log(`[factory:expenditure] creating expenditure — vendor="${vendor.name}" urlKey=${urlKey}`);

  const expenditure = await api.post<Expenditure>(`/businesses/${urlKey}/expenditures`, payload);
  console.log(`[factory:expenditure] ✓ _id=${expenditure._id}`);
  return expenditure;
}

// ─── read ─────────────────────────────────────────────────────────────────

export async function getExpenditure(
  api:           ApiClient,
  urlKey:        string,
  expenditureId: string,
): Promise<Expenditure> {
  return api.get<Expenditure>(`/businesses/${urlKey}/expenditures/${expenditureId}`);
}

export async function listExpenditures(
  api:    ApiClient,
  urlKey: string,
  params: { limit?: number; skip?: number } = {},
): Promise<ExpenditureListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set('$limit', String(params.limit));
  if (params.skip  !== undefined) qs.set('$skip',  String(params.skip));
  const query = qs.toString() ? `?${qs}` : '';
  return api.get<ExpenditureListResponse>(`/businesses/${urlKey}/expenditures${query}`);
}

// ─── update ───────────────────────────────────────────────────────────────

export async function updateExpenditure(
  api:           ApiClient,
  urlKey:        string,
  expenditureId: string,
  updates:       Partial<ExpenditureInput>,
): Promise<Expenditure> {
  console.log(`[factory:expenditure] updating ${expenditureId}`);
  return api.patch<Expenditure>(
    `/businesses/${urlKey}/expenditures/${expenditureId}`,
    updates,
  );
}
