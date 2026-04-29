/**
 * DocumentSelectors
 *
 * All selectors for Refrens document-generator pages (Invoice, Quotation,
 * Proforma Invoice, Expense).
 *
 * Strategy (in priority order):
 *  1. name attribute  — most stable, tied to React Hook Form field names
 *  2. data-test-id    — explicit test hooks added by the team
 *  3. aria-label      — accessibility attributes, stable in React-Select
 *  4. placeholder     — last resort; may change with copy updates
 *
 * Where a field might lack a name attribute (e.g. date pickers, rich-text
 * editors), we provide a comma-separated multi-selector so Playwright finds
 * the first matching element.
 *
 * Last Updated: April 2026 — target env: qa01.bizsuggest.com
 */

import { Page } from '@playwright/test';

/**
 * Try a list of selectors in order and return the first one that matches
 * a visible element on the page. Useful for fields where the exact selector
 * is uncertain across environments.
 *
 * Usage (inside a test or POM method):
 *   const loc = await resilientLocator(page, [
 *     'input[name="invoiceDate"]',
 *     'input[placeholder="Invoice Date"]',
 *     '[data-test-id="invoice-date"] input',
 *   ]);
 */
export async function resilientLocator(page: Page, selectors: string[], timeout = 5000) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout });
      return loc;
    } catch {
      // try next
    }
  }
  // Return last selector as fallback (will fail at usage time with a clear error)
  return page.locator(selectors[selectors.length - 1]).first();
}

export const DocumentSelectors = {

  // ==========================================================================
  // DOCUMENT HEADER
  // ==========================================================================

  invoiceNumber:   'input[name="invoiceNumber"]',
  quotationNumber: 'input[name="quotationNumber"]',

  // Invoice date — may be a custom date-picker with no name attr
  invoiceDate: [
    'input[name="invoiceDate"]',
    '[data-test-id="invoice-date"] input',
    'input[placeholder*="Invoice Date" i]',
    'input[placeholder*="Date" i]',
  ].join(', '),

  // Due date — toggled by "Add due date" button first
  addDueDateBtn: [
    'button:has-text("Add due date")',
    'button:has-text("Add Due Date")',
    '[data-test-id="add-due-date-btn"]',
  ].join(', '),

  dueDate: [
    'input[name="dueDate"]',
    '[data-test-id="due-date"] input',
    'input[placeholder*="Due Date" i]',
  ].join(', '),

  // ==========================================================================
  // CURRENCY
  // ==========================================================================

  currencyControl: 'input[aria-label="Currency"]',
  currencyHidden:  'input[name="currency"]',

  // ==========================================================================
  // LOGO
  // ==========================================================================

  logoInput: [
    'input[name="logo"]',
    'input[type="file"][accept*="image"]',
    '[data-test-id="logo-upload"] input',
  ].join(', '),

  // ==========================================================================
  // BILLED BY (Business)
  // ==========================================================================

  businessName:    'input[name="billedBy.name"]',
  businessPhone:   'input[name="billedBy.phone"]',   // react-tel-input — triple-click first
  businessGstin:   'input[name="billedBy.gstin"]',
  businessAddress: 'input[name="billedBy.street"]',
  businessCity:    'input[name="billedBy.city"]',
  businessPincode: 'input[name="billedBy.pincode"]',

  businessStateWrapper: '[data-test-id="state-dropdown-billed-by"]',
  businessStateControl: 'input[aria-label="billedBy.gstState"]',

  // "Add Email" is shared text — first occurrence = Billed By
  addBusinessEmailBtn: 'button:has-text("Add Email")',
  businessEmail:       'input[name="billedBy.email"]',

  addBusinessPanBtn: 'button:has-text("Add PAN")',
  businessPan:       'input[name="billedBy.pan"]',

  businessCountryControl: 'input[aria-label="billedBy Country"]',
  businessCountryHidden:  'input[name="billedBy.country"]',

  // ==========================================================================
  // BILLED TO (Client)
  // ==========================================================================

  clientName:    'input[name="billedTo.name"]',
  clientPhone:   'input[name="billedTo.phone"]',
  clientGstin:   'input[name="billedTo.gstin"]',
  clientAddress: 'input[name="billedTo.street"]',
  clientCity:    'input[name="billedTo.city"]',
  clientPincode: 'input[name="billedTo.pincode"]',

  clientStateWrapper: '[data-test-id="state-dropdown-billed-to"]',
  clientStateControl: 'input[aria-label="billedTo.gstState"]',

  // Second "Add Email" on the page = Billed To
  addClientEmailBtn: 'button:has-text("Add Email")',
  clientEmail:       'input[name="billedTo.email"]',

  addClientPanBtn: 'button:has-text("Add PAN")',
  clientPan:       'input[name="billedTo.pan"]',

  billedToCountryControl: 'input[aria-label="billedTo Country"]',
  billedToCountryHidden:  'input[name="billedTo.country"]',

  // ==========================================================================
  // LINE ITEMS
  // ==========================================================================

  addNewLineBtn: [
    'button:has-text("Add New Line")',
    'button:has-text("Add Line")',
    '[data-test-id="add-line-item-btn"]',
  ].join(', '),

  lineItemRow: (index: number) => ({
    anchor:     `button#line-item-copy-${index}`,
    hsn:        `input[name="items[${index}].hsn"]`,
    gstRate:    `input[name="items[${index}].gstRate"]`,
    quantity:   `input[name="items[${index}].quantity"]`,
    rate:       `input[name="items[${index}].rate"]`,
    discount:   `input[name="items[${index}].discount"]`,
    desc:       `textarea[name="items[${index}].description"]`,
    nameHidden: `input[name="items[${index}].name"]`,
    duplicate:  `button#line-item-copy-${index}`,
    remove:     `button#line-item-remove-${index}`,
  }),

  // ==========================================================================
  // DISCOUNTS
  // ==========================================================================

  addDiscountsBtn: [
    'button.discount-dropdown-btn',
    '[data-test-id="add-discount-btn"]',
    'button:has-text("Add Discount")',
  ].join(', '),

  giveItemWiseDiscountOption: [
    'button:has-text("Give Item Wise Discount")',
    'li:has-text("Item Wise Discount")',
    '[data-test-id="item-wise-discount-option"]',
  ].join(', '),

  giveDiscountOnTotalOption: [
    'button:has-text("Give Discount on Total")',
    'li:has-text("Discount on Total")',
  ].join(', '),

  discountTotalInput:     'input[name="discountValue"]',
  discountTotalTypeSelect: 'input[aria-label="Discount Type"]',

  itemWiseDiscountInput: (itemIndex: number) => `input[name="items[${itemIndex}].discount.amount"]`,

  // ==========================================================================
  // ADDITIONAL CHARGES
  // ==========================================================================

  addAdditionalChargesBtn: [
    'button[data-test-id="add-additional-charges-btn"]',
    'button:has-text("Add Additional Charge")',
    'button:has-text("Add Charge")',
  ].join(', '),

  // ==========================================================================
  // TOTALS SECTION
  // ==========================================================================

  summariseTotalQtyCheckbox: [
    'input[name="showTotalsRow"]',
    '[data-test-id="summarise-total-qty"] input',
  ].join(', '),

  roundUpBtn:   'button:has-text("Round Up")',
  roundDownBtn: 'button:has-text("Round Down")',

  showTotalInPdfBtn:   '#show-pdf-visibility-for-total-section',
  showTotalInWordsBtn: '#show-pdf-visibility-for-total-in-words-section',

  // Grand total text — read with .textContent()
  grandTotalAmount: [
    '[data-test-id="grand-total-value"]',
    '[data-test-id="grand-total-amount"]',
    '[data-test-id="total-amount"]',
    '.grand-total-value',
    'span:has-text("Total") + span',
  ].join(', '),

  subtotalAmount: [
    '[data-test-id="subtotal-value"]',
    '[data-test-id="sub-total-amount"]',
  ].join(', '),

  taxTotalAmount: [
    '[data-test-id="tax-total-value"]',
    '[data-test-id="tax-amount"]',
  ].join(', '),

  // ==========================================================================
  // SHIPPING DETAILS
  // The "Shipping Details" section is toggled by a checkbox.
  // Inside the section are two quick-fill checkboxes.
  // ==========================================================================

  showShippedToCheckbox: [
    'input[name="showShippedTo"]',
    'label:has-text("Add shipping details")',
    '[data-test-id="show-shipped-to"] input',
    'input[name="shippingDetails"]',
  ].join(', '),

  /** Label / checkbox: "Same as your business address" */
  shippedToSameAsBusinessCheckbox: [
    'input[name="shippedTo.sameAsBilledBy"]',
    'label:has-text("Same as your business address")',
    'label:has-text("same as business")',
    '[data-test-id="shipped-to-same-as-business"]',
  ].join(', '),

  /** Label / checkbox: "Same as client's address" */
  shippedToSameAsClientCheckbox: [
    'input[name="shippedTo.sameAsBilledTo"]',
    'label:has-text("same as client")',
    'label:has-text("Same as client")',
    '[data-test-id="shipped-to-same-as-client"]',
  ].join(', '),

  shippedToName:    'input[name="shippedTo.name"]',
  shippedToAddress: 'input[name="shippedTo.street"]',
  shippedToCity:    'input[name="shippedTo.city"]',
  shippedToPincode: 'input[name="shippedTo.pincode"]',

  // ==========================================================================
  // ADDITIONAL FEATURES — data-test-id (explicit test hooks)
  // ==========================================================================

  addSignatureBtn:      'button[data-test-id="add-signature-btn"]',
  addTermsBtn:          'button[data-test-id="add-terms-btn"]',
  addNotesBtn:          'button[data-test-id="add-notes-btn"]',
  addAttachmentsBtn:    'button[data-test-id="add-attachments-btn"]',
  addAdditionalInfoBtn: 'button[data-test-id="add-additional-info-btn"]',
  addContactDetailsBtn: 'button[data-test-id="add-contact-details-btn"]',

  toastEditorContenteditable: 'div.toastui-editor-contents[contenteditable="true"]',

  // ==========================================================================
  // FORM SUBMISSION
  // ==========================================================================

  saveAndContinueBtn: [
    'button:has-text("Save & Continue")',
    'button:has-text("Save and Continue")',
  ].join(', '),

  // ==========================================================================
  // LOGIN POPUP
  // ==========================================================================

  loginEmailInput:    'input[type="email"]',
  loginPasswordInput: 'input[type="password"]',
  loginSubmitBtn:     'button:has-text("Login")',

  // ==========================================================================
  // REACT-SELECT DROPDOWN OPTION (generic)
  // ==========================================================================

  dropdownOption: (text: string) =>
    `.disco-select__option:has-text("${text}"), .disco-select-creatable__option:has-text("${text}")`,
};

/** Backwards-compatible alias */
export const InvoiceSelectors = DocumentSelectors;
export default DocumentSelectors;
