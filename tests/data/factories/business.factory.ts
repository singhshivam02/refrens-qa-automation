/**
 * Business Factory
 *
 * Creates a new business entity via POST /businesses.
 * The returned `urlKey` is required for all business-scoped API calls
 * (invoices, expenditures, payments).
 */

import { ApiClient } from '../core/apiClient';
import { faker } from '@faker-js/faker';

// ─── types ────────────────────────────────────────────────────────────────

export interface Business {
  _id:        string;
  name:       string;
  country:    string;
  urlKey:     string;    // used in every business-scoped endpoint path
  alias?:     string;
  gstin?:     string;
  currency?:  string;
  billedTo?:  Record<string, unknown>;
  users?:     unknown[];
  createdAt?: string;
  updatedAt?: string;
}

/** Full business profile returned by GET /businesses/:urlKey */
export interface BusinessProfile {
  _id:                 string;
  name:                string;
  country:             string;
  urlKey?:             string;
  gstin?:              string;
  gstState?:           string;
  state?:              string;
  stateCode?:          string;
  city?:               string;
  street?:             string;
  pincode?:            string;
  phone?:              string;
  email?:              string;
  phoneShowInInvoice?: boolean;
  emailShowInInvoice?: boolean;
  panNumber?:          string;
  vatLabel?:           string;
  clientType?:         string;
  bankAccounts?:       unknown[];
  shippingDetails?:    unknown[];
  attachments?:        unknown[];
  customFields?:       unknown[];
  additionalIds?:      unknown[];
  [key: string]:       unknown;
}

interface StatisticColumn {
  key:        string;
  label:      string;
  autoUpdate: boolean;
  isHidden:   boolean;
  editable:   boolean;
  value:      number;
}

export interface BusinessInput {
  name:              string;
  country:           string;
  alias?:            string;
  currency?:         string;
  primaryNob?:       string;
  creationReason?:   string;
  usingRefrensFor?:  string[];
  statisticColumns?: StatisticColumn[];
  billedTo?: {
    phone?:     string;
    vatNumber?: string;
    name?:      string;
    email?:     string;
    country?:   string;
    gstState?:  string;
    pincode?:   string;
    city?:      string;
    street?:    string;
    gstin?:     string;
  };
}

// ─── defaults ─────────────────────────────────────────────────────────────

const DEFAULT_STATISTIC_COLUMNS: StatisticColumn[] = [
  { key: 'clients',         label: 'Clients',           autoUpdate: true,  isHidden: false, editable: true,  value: 0 },
  { key: 'teamMembers',     label: 'Team Members',       autoUpdate: false, isHidden: false, editable: true,  value: 5 },
  { key: 'projects',        label: 'Projects',           autoUpdate: true,  isHidden: false, editable: true,  value: 0 },
  { key: 'yearsInBusiness', label: 'Years In Business',  autoUpdate: true,  isHidden: false, editable: true,  value: 0 },
  { key: 'rating',          label: 'Average Rating',     autoUpdate: true,  isHidden: false, editable: false, value: 0 },
];

const DEFAULT_BUSINESS: Omit<BusinessInput, 'name'> = {
  country:          'IN',
  currency:         'INR',
  primaryNob:       'Manufacturing',
  creationReason:   'User: Have Different Branch/Business to Manage',
  usingRefrensFor:  ['End-to-end accounting'],
  statisticColumns: DEFAULT_STATISTIC_COLUMNS,
  billedTo: {
    phone:     '+919876543210',
    vatNumber: '',
  },
};

// ─── factory ──────────────────────────────────────────────────────────────

export async function getBusinessProfile(
  api:    ApiClient,
  urlKey: string,
): Promise<BusinessProfile> {
  return api.get<BusinessProfile>(`/businesses/${urlKey}`);
}

/**
 * Create a new business via POST /businesses.
 *
 * A unique timestamp suffix is appended to the name to avoid collisions.
 *
 * @example
 *   const biz = await createBusiness(api);
 *   const biz = await createBusiness(api, { name: 'Acme Corp', country: 'IN' });
 */
export async function createBusiness(
  api:       ApiClient,
  overrides: Partial<BusinessInput> = {},
): Promise<Business> {
  const name = overrides.name ?? faker.company.name();

  const payload: BusinessInput = {
    ...DEFAULT_BUSINESS,
    ...overrides,
    name,
    country: overrides.country ?? DEFAULT_BUSINESS.country ?? 'IN',
    billedTo: {
      ...(DEFAULT_BUSINESS.billedTo ?? {}),
      ...(overrides.billedTo ?? {}),
    },
    statisticColumns: overrides.statisticColumns ?? DEFAULT_STATISTIC_COLUMNS,
  };

  console.log(`[factory:business] creating business: "${payload.name}"`);

  const business = await api.post<Business>('/businesses', payload);

  console.log(`[factory:business] ✓ _id=${business._id}  urlKey=${business.urlKey}`);
  return business;
}
