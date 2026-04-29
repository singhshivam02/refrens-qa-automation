/**
 * Client Factory
 *
 * Handles both:
 *   1. Building inline billedTo objects for invoices/expenditures
 *   2. Creating standalone client entities via POST /businesses/:urlKey/clients
 */

import { ApiClient } from '../core/apiClient';
import { faker } from '@faker-js/faker';

// ─── billedTo types (used inline in invoices) ─────────────────────────────

export interface BilledTo {
  name:       string;
  country:    string;    // ISO 3166-1 alpha-2, e.g. "IN", "US"
  street?:    string;
  pincode?:   string;
  gstState?:  string;   // required when country = "IN"
  state?:     string;
  gstin?:     string;
  panNumber?: string;
  phone?:     string;
  email?:     string;
  [key: string]: unknown;
}

export type ClientInput = Partial<BilledTo>;

// ─── standalone client types (POST /businesses/:urlKey/clients) ───────────

export interface Client {
  _id:                 string;
  name:                string;
  country:             string;
  urlKey?:             string;
  email?:              string;
  phone?:              string;
  city?:               string;
  state?:              string;
  gstState?:           string;
  clientType?:         string;
  isClient?:           boolean;
  balance?:            { currency: string };
  createdAt?:          string;
  updatedAt?:          string;
  [key: string]:       unknown;
}

export interface ClientCreateInput {
  name:                 string;
  country:              string;
  clientType?:          string;
  email?:               string;
  emailShowInInvoice?:  boolean;
  phone?:               string;
  phoneShowInInvoice?:  boolean;
  city?:                string;
  state?:               string;
  street?:              string;
  pincode?:             string;
  gstState?:            string;
  gstin?:               string;
  industry?:            string;
  domain?:              string;
  logo?:                string;
  isClient?:            boolean;
  isVendor?:            boolean;
  uniqueKey?:           number;
  balance?:             { currency: string };
  bankAccounts?:        unknown[];
  shippingDetails?:     unknown[];
  customFields?:        unknown[];
  additionalIds?:       unknown[];
  files?:               unknown[];
}

// ─── billedTo defaults (used inline in invoices) ──────────────────────────

export const DEFAULT_GST_CLIENT: BilledTo = {
  name:      'QA Test Client',
  country:   'IN',
  gstState:  '27',
  gstin:     '27AAPBT1234H1Z6',
  street:    '456 Test Avenue',
  pincode:   '400001',
};

export const DEFAULT_BASIC_CLIENT: BilledTo = {
  name:    'QA Global Client',
  country: 'US',
};

// ─── standalone client defaults ───────────────────────────────────────────

const DEFAULT_CLIENT_IN: Omit<ClientCreateInput, 'name'> = {
  country:              'IN',
  clientType:           'INDIVIDUAL',
  gstState:             '27',
  state:                'Maharashtra',
  city:                 'Mumbai',
  street:               '456 Test Avenue',
  pincode:              '400001',
  phone:                '+919876543210',
  phoneShowInInvoice:   true,
  email:                'qa-client@yopmail.com',
  emailShowInInvoice:   true,
  industry:             'Architecture & Planning',
  domain:               '',
  logo:                 '',
  isClient:             true,
  balance:              { currency: 'INR' },
  bankAccounts:         [],
  shippingDetails:      [],
  customFields:         [],
  additionalIds:        [],
  files:                [],
};

// ─── billedTo builders (used inline in invoices) ──────────────────────────

/**
 * Build a BilledTo for an Indian GST-registered client.
 */
export function buildGSTClient(overrides: ClientInput = {}): BilledTo {
  return {
    ...DEFAULT_GST_CLIENT,
    ...overrides,
    name: overrides.name ?? faker.company.name(),
  };
}

/**
 * Build a BilledTo for a global (non-India, no GST) client.
 */
export function buildBasicClient(overrides: ClientInput = {}): BilledTo {
  return {
    ...DEFAULT_BASIC_CLIENT,
    ...overrides,
    name: overrides.name ?? faker.company.name(),
  };
}

// ─── standalone client factory ────────────────────────────────────────────

/**
 * Create a standalone client entity via POST /businesses/:urlKey/clients.
 *
 * @example
 *   const client = await createClient(api, 'peaky-blinders');
 *   const client = await createClient(api, 'peaky-blinders', { name: 'Acme Corp', gstState: '29' });
 */
export async function createClient(
  api:       ApiClient,
  urlKey:    string,
  overrides: Partial<ClientCreateInput> = {},
): Promise<Client> {
  const name  = overrides.name  ?? faker.company.name();
  const email = overrides.email ?? faker.internet.email();
  const phone = overrides.phone ?? '+91' + faker.string.numeric(10);

  const payload: ClientCreateInput = {
    ...DEFAULT_CLIENT_IN,
    ...overrides,
    name,
    email,
    phone,
    uniqueKey: overrides.uniqueKey ?? Date.now(),
  };

  console.log(`[factory:client] creating client: "${payload.name}" for ${urlKey}`);

  const client = await api.post<Client>(`/businesses/${urlKey}/clients`, payload);

  console.log(`[factory:client] ✓ _id=${client._id}  name="${client.name}"`);
  return client;
}

/**
 * Create a vendor (supplier) entity via POST /businesses/:urlKey/clients with isVendor=true.
 *
 * @example
 *   const vendor = await createVendor(api, 'peaky-blinders');
 *   const vendor = await createVendor(api, 'peaky-blinders', { name: 'Office Depot', gstState: '29' });
 */
export async function createVendor(
  api:       ApiClient,
  urlKey:    string,
  overrides: Partial<ClientCreateInput> = {},
): Promise<Client> {
  return createClient(api, urlKey, {
    ...overrides,
    isVendor: true,
    isClient: overrides.isClient ?? false,
  });
}
