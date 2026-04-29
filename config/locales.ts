/**
 * Locale Configurations
 *
 * Each supported locale has a distinct:
 *  - URL prefix  (empty string = root, i.e. India en-in)
 *  - Tax system  (GST / VAT / SST / none)
 *  - Tax identity fields for Billed By & Billed To
 *  - Line-item tax-rate field / label
 *  - State / region field behaviour
 *  - Default currency
 *
 * When a tax-id field is absent (taxSystem.type === 'none') the POM simply
 * skips those steps, so the same test data shape works across all locales.
 *
 * NOTE: field names for non-India locales (vatNumber, trn, abn, etc.) should
 * be verified against the live DOM for each locale before running tests.
 */

export type SupportedLocale =
  | 'en-in'   // India           — GST / GSTIN
  | 'en'      // Global (intl)   — no tax by default
  | 'en-us'   // United States   — no VAT; optional EIN
  | 'en-gb'   // United Kingdom  — VAT
  | 'en-ae'   // UAE             — VAT / TRN
  | 'en-au'   // Australia       — GST / ABN
  | 'en-ca'   // Canada          — GST/HST
  | 'en-sg'   // Singapore       — GST / UEN
  | 'en-za'   // South Africa    — VAT
  | 'en-ng'   // Nigeria         — VAT / TIN
  | 'en-ke'   // Kenya           — VAT / PIN
  | 'en-my';  // Malaysia        — SST / GST

export type TaxType = 'GST' | 'VAT' | 'SST' | 'none';

export interface TaxSystem {
  type: TaxType;
  /** label shown in the form, e.g. "GSTIN", "VAT No.", "TRN" */
  taxIdLabel: string;
  /** react-hook-form field name for business tax id, e.g. "billedBy.gstin" */
  businessTaxIdField: string | null;
  /** react-hook-form field name for client tax id */
  clientTaxIdField: string | null;
  /** name attribute of the per-line-item tax rate input; null = no tax column */
  lineItemTaxRateField: ((index: number) => string) | null;
  /** Column header label e.g. "GST Rate", "VAT %" */
  lineItemTaxRateLabel: string | null;
  /** Whether a state/region dropdown is shown (GST State for India) */
  hasStateDropdown: boolean;
  /** aria-label of the visible state control input */
  stateControlAriaLabel: string | null;
  /** data-test-id wrapper for Billed By state dropdown */
  businessStateWrapper: string | null;
  /** data-test-id wrapper for Billed To state dropdown */
  clientStateWrapper: string | null;
}

export interface LocaleConfig {
  locale: SupportedLocale;
  /** Human-readable country name */
  country: string;
  /** ISO-4217 default currency code */
  currency: string;
  /**
   * URL segment prefix.
   * India uses the root path (no prefix).
   * Others use their locale code, e.g. "en-gb".
   */
  urlPrefix: string;
  taxSystem: TaxSystem;
}

// ---------------------------------------------------------------------------
// Helper: no-tax system (used for en / en-us)
// ---------------------------------------------------------------------------

function noTax(): TaxSystem {
  return {
    type: 'none',
    taxIdLabel: '',
    businessTaxIdField: null,
    clientTaxIdField: null,
    lineItemTaxRateField: null,
    lineItemTaxRateLabel: null,
    hasStateDropdown: false,
    stateControlAriaLabel: null,
    businessStateWrapper: null,
    clientStateWrapper: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: VAT-based system (UK, UAE, South Africa, Nigeria, Kenya)
// The tax-id field names are tentative — verify against live DOM.
// ---------------------------------------------------------------------------

function vatSystem(
  taxIdLabel: string,
  businessField: string,
  clientField: string,
): TaxSystem {
  return {
    type: 'VAT',
    taxIdLabel,
    businessTaxIdField: businessField,
    clientTaxIdField: clientField,
    lineItemTaxRateField: (i) => `items[${i}].vatRate`,
    lineItemTaxRateLabel: 'VAT Rate',
    hasStateDropdown: false,
    stateControlAriaLabel: null,
    businessStateWrapper: null,
    clientStateWrapper: null,
  };
}

// ---------------------------------------------------------------------------
// LOCALE DEFINITIONS
// ---------------------------------------------------------------------------

export const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {

  // ── India ─────────────────────────────────────────────────────────────────
  'en-in': {
    locale: 'en-in',
    country: 'India',
    currency: 'INR',
    urlPrefix: '',   // root path — no locale segment
    taxSystem: {
      type: 'GST',
      taxIdLabel: 'GSTIN',
      businessTaxIdField: 'billedBy.gstin',
      clientTaxIdField: 'billedTo.gstin',
      lineItemTaxRateField: (i) => `items[${i}].gstRate`,
      lineItemTaxRateLabel: 'GST Rate',
      hasStateDropdown: true,
      stateControlAriaLabel: 'billedBy.gstState',
      businessStateWrapper: '[data-test-id="state-dropdown-billed-by"]',
      clientStateWrapper: '[data-test-id="state-dropdown-billed-to"]',
    },
  },

  // ── Global (international, no country) ───────────────────────────────────
  'en': {
    locale: 'en',
    country: 'Global',
    currency: 'USD',
    urlPrefix: 'en',
    taxSystem: noTax(),
  },

  // ── United States ─────────────────────────────────────────────────────────
  'en-us': {
    locale: 'en-us',
    country: 'United States',
    currency: 'USD',
    urlPrefix: 'en-us',
    taxSystem: noTax(),
  },

  // ── United Kingdom ────────────────────────────────────────────────────────
  // NOTE: vatNumber field name must be verified against live DOM
  'en-gb': {
    locale: 'en-gb',
    country: 'United Kingdom',
    currency: 'GBP',
    urlPrefix: 'en-gb',
    taxSystem: vatSystem('VAT No.', 'billedBy.vatNumber', 'billedTo.vatNumber'),
  },

  // ── UAE ───────────────────────────────────────────────────────────────────
  // NOTE: TRN field name must be verified against live DOM
  'en-ae': {
    locale: 'en-ae',
    country: 'UAE',
    currency: 'AED',
    urlPrefix: 'en-ae',
    taxSystem: vatSystem('TRN', 'billedBy.trn', 'billedTo.trn'),
  },

  // ── Australia ────────────────────────────────────────────────────────────
  // NOTE: ABN & gstRate field names must be verified against live DOM
  'en-au': {
    locale: 'en-au',
    country: 'Australia',
    currency: 'AUD',
    urlPrefix: 'en-au',
    taxSystem: {
      type: 'GST',
      taxIdLabel: 'ABN',
      businessTaxIdField: 'billedBy.abn',
      clientTaxIdField: 'billedTo.abn',
      lineItemTaxRateField: (i) => `items[${i}].gstRate`,
      lineItemTaxRateLabel: 'GST Rate',
      hasStateDropdown: false,
      stateControlAriaLabel: null,
      businessStateWrapper: null,
      clientStateWrapper: null,
    },
  },

  // ── Canada ────────────────────────────────────────────────────────────────
  'en-ca': {
    locale: 'en-ca',
    country: 'Canada',
    currency: 'CAD',
    urlPrefix: 'en-ca',
    taxSystem: {
      type: 'GST',
      taxIdLabel: 'GST/HST No.',
      businessTaxIdField: 'billedBy.gstNumber',
      clientTaxIdField: 'billedTo.gstNumber',
      lineItemTaxRateField: (i) => `items[${i}].gstRate`,
      lineItemTaxRateLabel: 'GST Rate',
      hasStateDropdown: false,
      stateControlAriaLabel: null,
      businessStateWrapper: null,
      clientStateWrapper: null,
    },
  },

  // ── Singapore ─────────────────────────────────────────────────────────────
  'en-sg': {
    locale: 'en-sg',
    country: 'Singapore',
    currency: 'SGD',
    urlPrefix: 'en-sg',
    taxSystem: {
      type: 'GST',
      taxIdLabel: 'UEN',
      businessTaxIdField: 'billedBy.uen',
      clientTaxIdField: 'billedTo.uen',
      lineItemTaxRateField: (i) => `items[${i}].gstRate`,
      lineItemTaxRateLabel: 'GST Rate',
      hasStateDropdown: false,
      stateControlAriaLabel: null,
      businessStateWrapper: null,
      clientStateWrapper: null,
    },
  },

  // ── South Africa ──────────────────────────────────────────────────────────
  'en-za': {
    locale: 'en-za',
    country: 'South Africa',
    currency: 'ZAR',
    urlPrefix: 'en-za',
    taxSystem: vatSystem('VAT No.', 'billedBy.vatNumber', 'billedTo.vatNumber'),
  },

  // ── Nigeria ───────────────────────────────────────────────────────────────
  'en-ng': {
    locale: 'en-ng',
    country: 'Nigeria',
    currency: 'NGN',
    urlPrefix: 'en-ng',
    taxSystem: vatSystem('TIN', 'billedBy.tin', 'billedTo.tin'),
  },

  // ── Kenya ─────────────────────────────────────────────────────────────────
  'en-ke': {
    locale: 'en-ke',
    country: 'Kenya',
    currency: 'KES',
    urlPrefix: 'en-ke',
    taxSystem: vatSystem('PIN', 'billedBy.pin', 'billedTo.pin'),
  },

  // ── Malaysia ──────────────────────────────────────────────────────────────
  'en-my': {
    locale: 'en-my',
    country: 'Malaysia',
    currency: 'MYR',
    urlPrefix: 'en-my',
    taxSystem: {
      type: 'SST',
      taxIdLabel: 'GST/SST No.',
      businessTaxIdField: 'billedBy.gstNumber',
      clientTaxIdField: 'billedTo.gstNumber',
      lineItemTaxRateField: (i) => `items[${i}].gstRate`,
      lineItemTaxRateLabel: 'SST Rate',
      hasStateDropdown: false,
      stateControlAriaLabel: null,
      businessStateWrapper: null,
      clientStateWrapper: null,
    },
  },
};

/** Resolve the base URL for a locale using the configured base URL. */
export function getLocaleBaseUrl(baseUrl: string, locale: SupportedLocale): string {
  const { urlPrefix } = LOCALE_CONFIGS[locale];
  return urlPrefix ? `${baseUrl}/${urlPrefix}` : baseUrl;
}
