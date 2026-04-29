/**
 * Invoice Factory
 *
 * Real payload structure from live network inspection.
 * Item totals (amount, igst, cgst, sgst, total) are computed locally before sending.
 *
 * Endpoints:
 *   POST   /businesses/:urlKey/invoices          → create
 *   GET    /businesses/:urlKey/invoices           → list
 *   GET    /businesses/:urlKey/invoices/:id       → get one
 *   PATCH  /businesses/:urlKey/invoices/:id       → update / cancel
 */

import { ApiClient } from '../core/apiClient';
import { faker } from '@faker-js/faker';

// ─── types ────────────────────────────────────────────────────────────────

export interface BilledBy {
  name:                 string;
  country:              string;
  gstin?:               string;
  panNumber?:           string;
  stateCode?:           string;
  gstState?:            string | null;
  state?:               string;
  city?:                string;
  street?:              string;
  pincode?:             string;
  phone?:               string;
  email?:               string;
  vatLabel?:            string;
  clientType?:          string;
  customFields?:        unknown[];
  additionalIds?:       unknown[];
  bankAccounts?:        unknown[];
  shippingDetails?:     unknown[];
  attachments?:         unknown[];
  emailShowInInvoice?:  boolean;
  phoneShowInInvoice?:  boolean;
  [key: string]:        unknown;
}

/** Human-supplied fields only — computed totals are added automatically. */
export interface InvoiceLineItemInput {
  name:         string;
  quantity:     number;
  rate:         number;
  gstRate?:     number;
  taxRate?:     number;   // alias for gstRate accepted by smoke tests
  description?: string;
  hsn?:         string;
  itemType?:    'service' | 'product';
}

/** Full item object sent to the API (includes computed totals). */
export interface InvoiceLineItem extends InvoiceLineItemInput {
  classification: string;
  subTotal:       number;
  discount:       { discountType: 'PERCENTAGE'; amount: 0 };
  amount:         number;
  igst:           number;
  cgst:           number;
  sgst:           number;
  total:          number;
  custom:         Record<string, unknown>;
  group:          false;
  isStockManaged: false;
  ledgerId:       string;
  ledgerName:     string;
  totalRoundOff:  0;
  amountRoundOff: 0;
  params:         { isPackage: false; packageItems: [] };
  itc:            null;
  trackingMethod: 'NONE';
  showSku:        boolean;
  allocations:    null;
}

export interface TransportDetails {
  vehicleNumber?: string;
  transportName?: string;
  lrNumber?:      string;
  challanNumber?: string;
  challanDate?:   string;
}

export interface ShippingAddress {
  name?:    string;
  street?:  string;
  city?:    string;
  state?:   string;
  pincode?: string;
  country?: string;
}

export interface Invoice {
  _id:           string;
  invoiceNumber: string;
  status:        string;
  currency?:     string;
  invoiceDate?:  string;
  dueDate?:      string;
  items?:        InvoiceLineItem[];
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

export interface InvoiceInput {
  invoiceNumber?: string;
  invoiceDate?:   string;
  dueDate?:       string;
  dueInDays?:     number;
  currency?:      string;
  locale?:        string;
  invoiceType?:   'INVOICE' | 'BOS';
  billedBy?:      BilledBy;
  billedTo?:      Record<string, unknown>;
  client?:        string;
  bankAccount?:   string;
  placeOfSupply?: string;
  items?:         InvoiceLineItemInput[];
  shipping?: boolean | {
    from?:      ShippingAddress;
    to?:        ShippingAddress;
    transport?: TransportDetails;
  };
  [key: string]: unknown;
}

export interface InvoiceListResponse {
  total: number;
  limit: number;
  skip:  number;
  data:  Invoice[];
}

// ─── helpers ──────────────────────────────────────────────────────────────

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function ddmmyyyy(iso: string): string {
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
}

function uniqueInvoiceNumber(prefix = 'INV'): string {
  return `${prefix}-QA-${Date.now()}`;
}

function computeItem(input: InvoiceLineItemInput): InvoiceLineItem {
  const amount = input.quantity * input.rate;
  const gst    = input.gstRate ?? 0;
  const igst   = parseFloat(((amount * gst) / 100).toFixed(2));
  const half   = parseFloat((igst / 2).toFixed(2));
  return {
    ...input,
    description:    input.description ?? '',
    hsn:            input.hsn ?? '',
    classification: '',
    itemType:       input.itemType ?? 'service',
    gstRate:        gst,
    subTotal:       amount,
    discount:       { discountType: 'PERCENTAGE', amount: 0 },
    amount,
    igst,
    cgst:           half,
    sgst:           half,
    total:          parseFloat((amount + igst).toFixed(2)),
    custom:         {},
    group:          false,
    isStockManaged: false,
    ledgerId:       '',
    ledgerName:     '',
    totalRoundOff:  0,
    amountRoundOff: 0,
    params:         { isPackage: false, packageItems: [] },
    itc:            null,
    trackingMethod: 'NONE',
    showSku:        false,
    allocations:    null,
  };
}

/** Sum of all item totals — used for full-payment amount when finalTotal is absent. */
export function computeInvoiceTotal(items: InvoiceLineItemInput[]): number {
  return parseFloat(
    items
      .map((i) => {
        const amt = i.quantity * i.rate;
        return amt + (amt * (i.gstRate ?? 0)) / 100;
      })
      .reduce((a, b) => a + b, 0)
      .toFixed(2),
  );
}

// ─── column definitions ───────────────────────────────────────────────────

const COL = (key: string, label: string, dataType: string) => ({
  key, label, isHidden: false, system: true, dataType,
  private: false, summarise: false, isCessColumn: false, fxReturnType: 'number' as const,
});

const GST_COLUMNS = [
  COL('name',     'Item',     'text'),
  COL('hsn',      'HSN/SAC',  'number'),
  COL('gstRate',  'GST Rate', 'number'),
  COL('quantity', 'Quantity', 'number'),
  COL('rate',     'Rate',     'currency'),
  COL('discount', 'Discount', 'number'),
  COL('amount',   'Amount',   'number'),
  COL('igst',     'IGST',     'number'),
  COL('cgst',     'CGST',     'number'),
  COL('sgst',     'SGST',     'number'),
  COL('total',    'Total',    'number'),
];

const BASIC_COLUMNS = [
  COL('name',     'Item',     'text'),
  COL('quantity', 'Quantity', 'number'),
  COL('rate',     'Rate',     'currency'),
  COL('discount', 'Discount', 'number'),
  COL('amount',   'Amount',   'number'),
  COL('total',    'Total',    'number'),
];

// ─── defaults ─────────────────────────────────────────────────────────────

const DEFAULT_BILLED_BY: BilledBy = {
  name:               faker.company.name(),
  country:            'IN',
  gstin:              '',
  panNumber:          '',
  gstState:           '27',
  stateCode:          '',
  state:              'Maharashtra',
  city:               'Mumbai',
  street:             faker.location.streetAddress(),
  pincode:            '400001',
  phone:              '+91' + faker.string.numeric(10),
  email:              faker.internet.email(),
  vatLabel:           'VAT Number',
  clientType:         'INDIVIDUAL',
  bankAccounts:       [],
  shippingDetails:    [],
  attachments:        [],
  customFields:       [],
  additionalIds:      [],
  emailShowInInvoice: true,
  phoneShowInInvoice: true,
};

const DEFAULT_BILLED_TO_IN: Record<string, unknown> = {
  name:               faker.company.name(),
  country:            'IN',
  street:             faker.location.streetAddress(),
  city:               'Mumbai',
  pincode:            '400001',
  state:              'Maharashtra',
  stateCode:          'MH',
  gstState:           '27',
  gstin:              '',
  panNumber:          null,
  vatLabel:           'VAT Number',
  taxPayerType:       'B2C',
  clientType:         'INDIVIDUAL',
  phone:              '+91' + faker.string.numeric(10),
  phoneShowInInvoice: true,
  email:              faker.internet.email(),
  emailShowInInvoice: true,
  customFields:       [],
  additionalIds:      [],
  contactPerson:      null,
};

const DEFAULT_BILLED_TO_GLOBAL: Record<string, unknown> = {
  name:               faker.company.name(),
  country:            'US',
  street:             faker.location.streetAddress(),
  city:               'New York',
  state:              'New York',
  pincode:            '10001',
  vatLabel:           'VAT Number',
  taxPayerType:       'B2C',
  clientType:         'INDIVIDUAL',
  phone:              '+1' + faker.string.numeric(10),
  phoneShowInInvoice: true,
  email:              faker.internet.email(),
  emailShowInInvoice: true,
  customFields:       [],
  additionalIds:      [],
  contactPerson:      null,
};

const DEFAULT_GST_ITEMS: InvoiceLineItemInput[] = [
  { name: 'Consulting Services', quantity: 1, rate: 10000, gstRate: 18, itemType: 'service' },
];

const DEFAULT_BASIC_ITEMS: InvoiceLineItemInput[] = [
  { name: 'Consulting Services', quantity: 1, rate: 1000, itemType: 'service' },
];

const DEFAULT_TRANSPORT: TransportDetails = {
  vehicleNumber: 'MH01AB1234',
  transportName: 'QA Logistics',
  lrNumber:      `LR-QA-${Date.now()}`,
  challanNumber: `CH-QA-${Date.now()}`,
  challanDate:   isoDate(),
};

const DEFAULT_SHIPPED_FROM: ShippingAddress = {
  name:    faker.person.fullName(),
  street:  faker.location.streetAddress(),
  city:    'Delhi',
  state:   'Delhi',
  pincode: '110001',
  country: 'IN',
};

const DEFAULT_SHIPPED_TO: ShippingAddress = {
  name:    faker.person.fullName(),
  street:  faker.location.streetAddress(),
  city:    'Mumbai',
  state:   'Maharashtra',
  pincode: '400001',
  country: 'IN',
};

function resolveShipping(shipping: InvoiceInput['shipping']): {
  transportDetails: TransportDetails | null;
  shippedFrom:      ShippingAddress  | null;
  shippedTo:        ShippingAddress  | null;
} {
  if (!shipping) return { transportDetails: null, shippedFrom: null, shippedTo: null };
  if (shipping === true) {
    return {
      transportDetails: DEFAULT_TRANSPORT,
      shippedFrom:      DEFAULT_SHIPPED_FROM,
      shippedTo:        DEFAULT_SHIPPED_TO,
    };
  }
  return {
    transportDetails: shipping.transport ?? DEFAULT_TRANSPORT,
    shippedFrom:      shipping.from      ?? DEFAULT_SHIPPED_FROM,
    shippedTo:        shipping.to        ?? DEFAULT_SHIPPED_TO,
  };
}

function basePayload(
  urlKey:      string,
  invoiceDate: string,
  dueDate:     string,
  dueInDays:   number,
  invoiceNumber: string,
  items:       InvoiceLineItemInput[],
  overrides:   InvoiceInput,
  columns:     typeof GST_COLUMNS,
  isGST:       boolean,
) {
  void urlKey;
  const { transportDetails, shippedFrom, shippedTo } = resolveShipping(overrides.shipping);
  const knownKeys = new Set([
    'items','billedBy','billedTo','client','bankAccount',
    'invoiceDate','dueDate','invoiceNumber','currency','locale',
    'invoiceType','placeOfSupply','dueInDays','shipping',
  ]);
  const extras = Object.fromEntries(
    Object.entries(overrides).filter(([k]) => !knownKeys.has(k)),
  );

  return {
    taxType:      isGST ? 'INDIA' : undefined,
    locale:       overrides.locale ?? (isGST ? 'en-IN' : 'en'),
    currency:     overrides.currency ?? (isGST ? 'INR' : 'USD'),
    invoiceType:  overrides.invoiceType ?? 'INVOICE',
    billType:     'INVOICE',
    invoiceNumber,
    invoiceTitle: 'Invoice',
    invoiceDate,
    invoiceDateUserInput: ddmmyyyy(invoiceDate),
    dueDate,
    dueInDays,
    ...(isGST ? {
      taxName:       'GST',
      igst:          false,
      placeOfSupply: overrides.placeOfSupply ?? '27',
      supplyType:    'B2C',
      reverseCharge: false,
    } : {}),
    hideTaxes:        false,
    hideTotals:       false,
    showTotalsRow:    false,
    hideTotalInWords: false,
    saveDueInDays:    false,
    discount:         { discountMethod: 'EQUAL', discountType: 'PERCENTAGE' },
    advanceOptions: {
      hideCountryOfSupply:           false,
      showCreatorInInvoice:          false,
      showHSNSummaryInInvoice:       false,
      showPaymentsTable:             false,
      showStockSummary:              false,
      isBatchRequired:               false,
      hsnView:                       'DEFAULT',
      taxSummaryView:                'NONE',
      showThumbnailAsColumn:         false,
      isDescriptionFullWidth:        false,
      unitColumn:                    'MERGE_QUANTITY',
      hideGroupSubTotal:             false,
      showSkuInInvoice:              false,
      showSerialNumbersInDescription: true,
      showBatchColumnsInInvoice:     false,
    },
    recurringInvoice: { status: 'DRAFT', frequency: 'None' },
    billedBy:         overrides.billedBy ?? (isGST ? DEFAULT_BILLED_BY : undefined),
    billedTo:         overrides.billedTo ?? (isGST ? DEFAULT_BILLED_TO_IN : DEFAULT_BILLED_TO_GLOBAL),
    ...(overrides.client      ? { client:      overrides.client }      : {}),
    ...(overrides.bankAccount ? { bankAccount: overrides.bankAccount } : {}),
    columns,
    items:            items.map(computeItem),
    cesses:           [],
    attachments:      [],
    terms:            [],
    extraTotalFields:  [],
    additionalCharges: [],
    customFooters:    [],
    customHeaders:    [],
    linkedInvoices:   [],
    transportDetails,
    shippedFrom,
    shippedTo,
    signature:        null,
    contact: {
      phone: overrides.billedBy?.phone ?? '',
      email: overrides.billedBy?.email ?? '',
    },
    reminders:        { replyTo: {}, to: {} },
    paymentOptions: {
      accountTransfer:       true,
      smartTransfer:         false,
      creditCards:           false,
      debitCards:            false,
      netBanking:            false,
      upi:                   false,
      pgUPI:                 false,
      smartUPI:              false,
      wallets:               false,
      foreignCards:          false,
      tazapayDirect:         false,
      tazapayCards:          false,
      vendorAccountTransfer: false,
      meta: {
        allowPartialPayment:      false,
        createInvoiceOnPayment:   false,
        allowCardPayment:         false,
        allowTDS:                 true,
      },
    },
    customLabels: {
      invoiceNumber:        'Invoice No',
      invoiceDate:          'Invoice Date',
      dueDate:              'Due Date',
      purchaseOrderNumber:  'PO Number',
      quotationNumber:      'Quotation No.',
      terms:                'Terms and Conditions',
      notes:                'Additional Notes',
      billedBy:             'Billed By',
      billedTo:             'Billed To',
      expenseNumber:        'Expense No',
      shippedTo:            'Shipped To',
      shippedFrom:          'Shipped From',
      transport:            'Transport Details',
      attachment:           'Attachments',
      signature:            'Authorised Signatory',
      taxName:              'GST',
      total:                'Total',
      subTotal:             'Sub Total',
      totalInWords:         'Total (in words)',
      transportName:        'Transport',
      challanDate:          'Challan Date',
      challanNumber:        'Challan Number',
      transportExtraInfo:   'Extra Information',
      contact:              'For any enquiry, reach out via',
      contactEmail:         'email at',
      contactPhone:         'call on',
      dueAmount:            'Due Amount',
      paymentRecord:        'Payment Record',
      invoiceDetails:       'Invoice Details',
      paidAmount:           'Paid Amount',
    },
    ...extras,
  };
}

// ─── create ───────────────────────────────────────────────────────────────

/**
 * Create an India GST invoice (INR, 18% GST, IGST flow).
 *
 * @example
 *   const invoice = await createGSTInvoice(api, 'peaky-blinders');
 *   const invoice = await createGSTInvoice(api, 'peaky-blinders', {
 *     items:    [{ name: 'Web Dev', quantity: 1, rate: 50000, gstRate: 18 }],
 *     shipping: true,
 *   });
 */
export async function createGSTInvoice(
  api:       ApiClient,
  urlKey:    string,
  overrides: InvoiceInput = {},
): Promise<Invoice> {
  const invoiceDate   = overrides.invoiceDate  ?? isoDate();
  const dueInDays     = overrides.dueInDays    ?? 15;
  const dueDate       = overrides.dueDate      ?? isoDate(dueInDays);
  const invoiceNumber = overrides.invoiceNumber ?? uniqueInvoiceNumber('GST');
  const items         = overrides.items        ?? DEFAULT_GST_ITEMS;

  const payload = basePayload(
    urlKey, invoiceDate, dueDate, dueInDays, invoiceNumber, items,
    overrides, GST_COLUMNS, true,
  );

  console.log(`[invoice] creating GST invoice "${invoiceNumber}" for ${urlKey}`);
  const invoice = await api.post<Invoice>(`/businesses/${urlKey}/invoices`, payload);
  console.log(`[invoice] ✓ _id=${invoice._id}  number="${invoice.invoiceNumber}"`);
  return invoice;
}

/**
 * Create a global invoice (USD, no GST).
 */
export async function createBasicInvoice(
  api:       ApiClient,
  urlKey:    string,
  overrides: InvoiceInput = {},
): Promise<Invoice> {
  const invoiceDate   = overrides.invoiceDate  ?? isoDate();
  const dueInDays     = overrides.dueInDays    ?? 15;
  const dueDate       = overrides.dueDate      ?? isoDate(dueInDays);
  const invoiceNumber = overrides.invoiceNumber ?? uniqueInvoiceNumber('INV');
  const items         = overrides.items        ?? DEFAULT_BASIC_ITEMS;

  const payload = basePayload(
    urlKey, invoiceDate, dueDate, dueInDays, invoiceNumber, items,
    overrides, BASIC_COLUMNS, false,
  );

  console.log(`[invoice] creating basic invoice "${invoiceNumber}" for ${urlKey}`);
  const invoice = await api.post<Invoice>(`/businesses/${urlKey}/invoices`, payload);
  console.log(`[invoice] ✓ _id=${invoice._id}  number="${invoice.invoiceNumber}"`);
  return invoice;
}

// ─── read ─────────────────────────────────────────────────────────────────

export async function getInvoice(
  api:       ApiClient,
  urlKey:    string,
  invoiceId: string,
): Promise<Invoice> {
  return api.get<Invoice>(`/businesses/${urlKey}/invoices/${invoiceId}`);
}

export async function listInvoices(
  api:    ApiClient,
  urlKey: string,
  params: { limit?: number; skip?: number; sort?: Partial<Record<string, 1 | -1>> } = {},
): Promise<InvoiceListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set('$limit', String(params.limit));
  if (params.skip  !== undefined) qs.set('$skip',  String(params.skip));
  if (params.sort) {
    for (const [field, dir] of Object.entries(params.sort)) {
      qs.set(`$sort[${field}]`, String(dir));
    }
  }
  const q = qs.toString() ? `?${qs}` : '';
  return api.get<InvoiceListResponse>(`/businesses/${urlKey}/invoices${q}`);
}

// ─── cancel ───────────────────────────────────────────────────────────────

export async function cancelInvoice(
  api:          ApiClient,
  urlKey:       string,
  invoiceId:    string,
  cancelPayment = false,
): Promise<Invoice> {
  return api.patch<Invoice>(
    `/businesses/${urlKey}/invoices/${invoiceId}`,
    { status: 'CANCELED' },
    cancelPayment ? { cancelPayment: 'true' } : undefined,
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

export function invoiceViewUrl(invoice: Invoice): string {
  return invoice.share?.viewLink ?? '';
}
