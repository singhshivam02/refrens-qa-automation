/**
 * BaseDocumentPage
 *
 * Locale-aware base class for all document-generator POMs
 * (Invoice, Quotation, Proforma Invoice, Expense).
 *
 * Selector resilience:
 *  Many selectors are written as comma-separated multi-selectors so Playwright
 *  finds the first matching element. This handles cases where a field lacks a
 *  `name` attribute or the attribute differs between environments.
 */

import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { LocaleConfig, SupportedLocale, LOCALE_CONFIGS, getLocaleBaseUrl } from '../config/locales';
import { DocumentSelectors } from '../tests/selectors';
import { config } from '../config/environment';

// ============================================================================
// SHARED DATA INTERFACES
// ============================================================================

export interface PartyDetails {
  name: string;
  phone?: string;
  email?: string;
  /** Tax ID: GSTIN / VAT No. / TRN / ABN — locale-specific */
  taxId?: string;
  address?: string;
  city?: string;
  pincode?: string;
  /** State — only for locales with a state dropdown (en-in) */
  state?: string;
  pan?: string;
}

export interface LineItem {
  name?: string;
  hsnSac?: string;
  /** Tax rate string e.g. "18", "20" — omit for no-tax locales */
  taxRate?: string;
  quantity: string;
  rate: string;
  description?: string;
}

export interface DiscountConfig {
  type: 'total' | 'itemwise';
  value?: string;
  discountType?: 'percentage' | 'fixed';
  /** For itemwise: map of line-item index → discount value */
  itemDiscounts?: Record<number, string>;
}

export interface AdditionalChargeConfig {
  amount: string;
  taxType?: 'with' | 'without';
}

export interface DocumentFeatures {
  terms?: string;
  notes?: string;
  additionalInfo?: string;
  contactDetails?: boolean;
  logoFilePath?: string;
  signatureFilePath?: string;
  discount?: DiscountConfig;
  additionalCharge?: AdditionalChargeConfig;
  summariseTotalQty?: boolean;
  showShippedTo?: boolean;
}

export interface DocumentFormData {
  documentNumber?: string;
  currency?: string;
  business: PartyDetails;
  client: PartyDetails;
  items: LineItem[];
  features?: DocumentFeatures;
}

// ============================================================================
// BASE DOCUMENT PAGE
// ============================================================================

export abstract class BaseDocumentPage extends BasePage {

  protected readonly localeConfig: LocaleConfig;

  protected abstract get documentPath(): string;
  protected abstract get ctaButtonText(): string | RegExp;
  protected abstract get documentNumberField(): string;

  constructor(page: Page, locale: SupportedLocale = 'en-in') {
    super(page);
    this.localeConfig = LOCALE_CONFIGS[locale];
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  /**
   * Return the first visible element matching any of the given selectors.
   * Falls back to the last selector (which will fail with a meaningful error).
   */
  private async first(selectors: string | string[], timeout = 8000) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const loc = this.page.locator(sel).first();
        await loc.waitFor({ state: 'visible', timeout });
        return loc;
      } catch { /* try next */ }
    }
    return this.page.locator(list[list.length - 1]).first();
  }

  /**
   * Fill a field that might not have a name attribute.
   * Tries each selector in order; fills the first visible one.
   */
  protected async fillField(selectors: string | string[], value: string): Promise<void> {
    const el = await this.first(selectors);
    await el.waitFor({ state: 'visible' });
    await el.click({ clickCount: 3 });
    await el.fill(value);
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  async navigateToGenerator(): Promise<void> {
    const url = `${getLocaleBaseUrl(config.baseUrl, this.localeConfig.locale)}/${this.documentPath}`;
    await this.navigateTo(url);
  }

  async clickCreateCta(): Promise<void> {
    const btn = typeof this.ctaButtonText === 'string'
      ? this.page.getByRole('button', { name: this.ctaButtonText, exact: false }).first()
      : this.page.getByRole('button', { name: this.ctaButtonText }).first();
    await btn.waitFor({ state: 'visible', timeout: 15_000 });
    await btn.click();
    await this.wait(1500);
  }

  // ==========================================================================
  // DOCUMENT HEADER
  // ==========================================================================

  async fillDocumentNumber(number: string): Promise<void> {
    await this.fillField(`input[name="${this.documentNumberField}"]`, number);
  }

  async selectCurrency(currency: string): Promise<void> {
    await this.selectReactOption(DocumentSelectors.currencyControl, currency);
  }

  // ==========================================================================
  // LOGO
  // ==========================================================================

  async uploadLogo(filePath: string): Promise<void> {
    const fileInput = this.page.locator(DocumentSelectors.logoInput).first();
    await fileInput.setInputFiles(filePath);
    await this.wait(1500);
  }

  // ==========================================================================
  // BILLED BY
  // ==========================================================================

  async fillBusinessName(name: string): Promise<void> {
    await this.fillField(DocumentSelectors.businessName, name);
  }

  async fillBusinessPhone(phone: string): Promise<void> {
    const input = this.page.locator(DocumentSelectors.businessPhone);
    await input.waitFor({ state: 'visible' });
    await input.click({ clickCount: 3 });
    await input.fill(phone);
  }

  async fillBusinessEmail(email: string): Promise<void> {
    // Click "Add Email" — first occurrence = Billed By section
    const btn = this.page.locator(DocumentSelectors.addBusinessEmailBtn).first();
    const emailInput = this.page.locator(DocumentSelectors.businessEmail);
    // If field is already visible, skip the button click
    if (!(await emailInput.isVisible().catch(() => false))) {
      await btn.click();
      await this.wait(300);
    }
    await emailInput.fill(email);
  }

  async fillBusinessTaxId(taxId: string): Promise<void> {
    const field = this.localeConfig.taxSystem.businessTaxIdField;
    if (!field) return;
    await this.fillField(`input[name="${field}"]`, taxId);
    await this.wait(600); // allow GSTIN auto-fill to trigger
  }

  async fillBusinessAddress(address: string): Promise<void> {
    await this.fillField(DocumentSelectors.businessAddress, address);
  }

  async fillBusinessCity(city: string): Promise<void> {
    await this.fillField(DocumentSelectors.businessCity, city);
  }

  async fillBusinessPincode(pincode: string): Promise<void> {
    await this.fillField(DocumentSelectors.businessPincode, pincode);
  }

  async selectBusinessState(state: string): Promise<void> {
    const { businessStateWrapper, stateControlAriaLabel } = this.localeConfig.taxSystem;
    if (!businessStateWrapper || !stateControlAriaLabel) return;
    await this.selectReactOption(
      `input[aria-label="${stateControlAriaLabel}"]`,
      state,
      businessStateWrapper,
    );
  }

  async fillBusinessPan(pan: string): Promise<void> {
    const btn = this.page.locator(DocumentSelectors.addBusinessPanBtn).first();
    const panInput = this.page.locator(DocumentSelectors.businessPan);
    if (!(await panInput.isVisible().catch(() => false))) {
      await btn.click();
      await this.wait(300);
    }
    // await panInput.fill(pan);
  }

  async fillBusinessDetails(data: PartyDetails): Promise<void> {
    await this.fillBusinessName(data.name);
    if (data.phone)   await this.fillBusinessPhone(data.phone);
    if (data.taxId)   await this.fillBusinessTaxId(data.taxId);
    if (data.address) await this.fillBusinessAddress(data.address);
    if (data.city)    await this.fillBusinessCity(data.city);
    if (data.pincode) await this.fillBusinessPincode(data.pincode);
    // Skip state when GSTIN provided — it auto-fills
    if (data.state && !data.taxId) await this.selectBusinessState(data.state);
    if (data.email)   await this.fillBusinessEmail(data.email);
    if (data.pan)     await this.fillBusinessPan(data.pan);
  }

  // ==========================================================================
  // BILLED TO
  // ==========================================================================

  async fillClientName(name: string): Promise<void> {
    await this.fillField(DocumentSelectors.clientName, name);
  }

  async fillClientPhone(phone: string): Promise<void> {
    const input = this.page.locator(DocumentSelectors.clientPhone);
    await input.waitFor({ state: 'visible' });
    await input.click({ clickCount: 3 });
    await input.fill(phone);
  }

  async fillClientEmail(email: string): Promise<void> {
    // Last "Add Email" button on the page = Billed To
    const btn = this.page.locator(DocumentSelectors.addClientEmailBtn).last();
    const emailInput = this.page.locator(DocumentSelectors.clientEmail);
    if (!(await emailInput.isVisible().catch(() => false))) {
      await btn.click();
      await this.wait(300);
    }
    await emailInput.fill(email);
  }

  async fillClientTaxId(taxId: string): Promise<void> {
    const field = this.localeConfig.taxSystem.clientTaxIdField;
    if (!field) return;
    await this.fillField(`input[name="${field}"]`, taxId);
  }

  async fillClientAddress(address: string): Promise<void> {
    await this.fillField(DocumentSelectors.clientAddress, address);
  }

  async fillClientCity(city: string): Promise<void> {
    await this.fillField(DocumentSelectors.clientCity, city);
  }

  async fillClientPincode(pincode: string): Promise<void> {
    await this.fillField(DocumentSelectors.clientPincode, pincode);
  }

  async selectClientState(state: string): Promise<void> {
    const ts = this.localeConfig.taxSystem;
    if (!ts.clientStateWrapper || !ts.stateControlAriaLabel) return;
    await this.selectReactOption(
      `input[aria-label="${ts.stateControlAriaLabel.replace('billedBy', 'billedTo')}"]`,
      state,
      ts.clientStateWrapper,
    );
  }

  async fillClientPan(pan: string): Promise<void> {
    const btn = this.page.locator(DocumentSelectors.addClientPanBtn).last();
    const panInput = this.page.locator(DocumentSelectors.clientPan);
    if (!(await panInput.isVisible().catch(() => false))) {
      await btn.click();
      await this.wait(300);
    }
   // await panInput.fill(pan);
  }

  async fillClientDetails(data: PartyDetails): Promise<void> {
    await this.fillClientName(data.name);
    if (data.phone)   await this.fillClientPhone(data.phone);
    if (data.taxId)   await this.fillClientTaxId(data.taxId);
    if (data.address) await this.fillClientAddress(data.address);
    if (data.city)    await this.fillClientCity(data.city);
    if (data.pincode) await this.fillClientPincode(data.pincode);
    if (data.state && !data.taxId) await this.selectClientState(data.state);
    if (data.email)   await this.fillClientEmail(data.email);
    if (data.pan)     await this.fillClientPan(data.pan);
  }

  // ==========================================================================
  // LINE ITEMS
  // ==========================================================================

  async fillLineItem(index: number, item: LineItem): Promise<void> {
    const sel = DocumentSelectors.lineItemRow(index);

    // Item name (autocomplete — visible input found via sibling of hidden input)
    if (item.name) {
      const nameHiddenLoc = this.page.locator(sel.nameHidden);
      // Try visible autocomplete input first; fall back to the hidden input's container
      let nameInput = this.page.locator(`input[aria-autocomplete="list"]`).nth(index);
      if (!(await nameInput.isVisible().catch(() => false))) {
        nameInput = nameHiddenLoc.locator('xpath=ancestor::div[2]//input[@aria-autocomplete="list"]');
      }
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(item.name);
        await this.wait(400);
        await nameInput.press('Escape');
      }
    }

    // HSN/SAC — India only, silently skip if absent
    if (item.hsnSac) {
      const hsnInput = this.page.locator(sel.hsn);
      if (await hsnInput.isVisible().catch(() => false)) {
        await hsnInput.fill(item.hsnSac);
      }
    }

    // Tax rate — locale-specific field
    if (item.taxRate && this.localeConfig.taxSystem.lineItemTaxRateField) {
      const taxFieldName = this.localeConfig.taxSystem.lineItemTaxRateField(index);
      const taxInput = this.page.locator(`input[name="${taxFieldName}"]`);
      if (await taxInput.isVisible().catch(() => false)) {
        await taxInput.click({ clickCount: 3 });
        await taxInput.fill(item.taxRate);
      }
    }

    // Quantity
    const qty = this.page.locator(sel.quantity);
    await qty.waitFor({ state: 'visible' });
    await qty.click({ clickCount: 3 });
    await qty.fill(item.quantity);

    // Rate
    const rate = this.page.locator(sel.rate);
    await rate.waitFor({ state: 'visible' });
    await rate.click({ clickCount: 3 });
    await rate.fill(item.rate);

    // Description
    if (item.description) {
      const addDescBtn = this.page.locator(sel.anchor)
        .locator('xpath=ancestor::div[3]')
        .locator('button[aria-label="Add Description"]');
      if (await addDescBtn.isVisible().catch(() => false)) {
        await addDescBtn.click();
        await this.wait(400);
        const editor = this.page.locator(DocumentSelectors.toastEditorContenteditable).last();
        await editor.waitFor({ state: 'visible' });
        await editor.click();
        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.type(item.description);
      }
    }

    await this.wait(200);
  }

  async addNewLineItem(): Promise<void> {
    await this.page.locator(DocumentSelectors.addNewLineBtn).first().click();
    await this.wait(600);
  }

  async fillLineItems(items: LineItem[]): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      if (i > 0) await this.addNewLineItem();
      await this.fillLineItem(i, items[i]);
    }
  }

  async editLineItemField(
    index: number,
    field: 'quantity' | 'rate' | 'hsnSac' | 'taxRate',
    value: string,
  ): Promise<void> {
    const sel = DocumentSelectors.lineItemRow(index);
    let input;
    if (field === 'quantity') {
      input = this.page.locator(sel.quantity);
    } else if (field === 'rate') {
      input = this.page.locator(sel.rate);
    } else if (field === 'hsnSac') {
      input = this.page.locator(sel.hsn);
    } else {
      const taxFieldName = this.localeConfig.taxSystem.lineItemTaxRateField?.(index);
      if (!taxFieldName) return;
      input = this.page.locator(`input[name="${taxFieldName}"]`);
    }
    await input.waitFor({ state: 'visible' });
    await input.click({ clickCount: 3 });
    await input.fill(value);
    await this.wait(300);
  }

  async deleteLineItem(index: number): Promise<void> {
    const removeBtn = this.page.locator(DocumentSelectors.lineItemRow(index).remove);
    await removeBtn.waitFor({ state: 'visible' });
    await removeBtn.click();
    await this.wait(600);
  }

  // ==========================================================================
  // DISCOUNTS
  // ==========================================================================

  async applyItemWiseDiscount(itemDiscounts: Record<number, string>): Promise<void> {
    await this.page.locator(DocumentSelectors.addDiscountsBtn).first().click();
    await this.wait(300);
    await this.page.locator(DocumentSelectors.giveItemWiseDiscountOption).first().click();
    await this.wait(400);
    for (const [index, value] of Object.entries(itemDiscounts)) {
      const input = this.page.locator(DocumentSelectors.itemWiseDiscountInput(Number(index)));
      await input.waitFor({ state: 'visible' });
      await input.click({ clickCount: 3 });
      await input.fill(value);
      await this.wait(200);
    }
  }

  // ==========================================================================
  // SHIPPING SECTION
  // ==========================================================================

  async enableShowShippedTo(): Promise<void> {
    const checkbox = this.page.locator(DocumentSelectors.showShippedToCheckbox).first();
    await checkbox.waitFor({ state: 'visible' });
    const isChecked = await checkbox.isChecked().catch(() => false);
    if (!isChecked) await checkbox.click();
    await this.wait(800);
  }

  async clickSameAsBusinessInShipping(): Promise<void> {
    const el = this.page.locator(DocumentSelectors.shippedToSameAsBusinessCheckbox).first();
    await el.waitFor({ state: 'visible', timeout: 8_000 });
    await el.click();
    await this.wait(600);
  }

  async clickSameAsClientInShipping(): Promise<void> {
    const el = this.page.locator(DocumentSelectors.shippedToSameAsClientCheckbox).first();
    await el.waitFor({ state: 'visible', timeout: 8_000 });
    await el.click();
    await this.wait(600);
  }

  // ==========================================================================
  // ADDITIONAL FEATURES
  // ==========================================================================

  private async fillToastEditor(addBtnSelector: string, text: string): Promise<void> {
    const btn = this.page.locator(addBtnSelector).first();
    // Only click "add" button if the editor isn't already open
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await btn.click();
      await this.wait(500);
    }
    const editor = this.page.locator(DocumentSelectors.toastEditorContenteditable).last();
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    await editor.click();
    await this.wait(200);
    await this.page.keyboard.press('Control+a');
    await this.page.keyboard.type(text);
    await this.wait(200);
  }

  async addNotes(notes: string): Promise<void> {
    await this.fillToastEditor(DocumentSelectors.addNotesBtn, notes);
  }

  async addTerms(terms: string): Promise<void> {
    await this.fillToastEditor(DocumentSelectors.addTermsBtn, terms);
  }

  async addAdditionalInfo(info: string): Promise<void> {
    await this.fillToastEditor(DocumentSelectors.addAdditionalInfoBtn, info);
  }

  async addContactDetails(): Promise<void> {
    await this.page.locator(DocumentSelectors.addContactDetailsBtn).first().click();
    await this.wait(500);
  }

  async uploadSignature(filePath: string): Promise<void> {
    await this.page.locator(DocumentSelectors.addSignatureBtn).first().click();
    await this.wait(500);
    const fileInput = this.page.locator('input[type="file"][accept*="image"]').last();
    await fileInput.setInputFiles(filePath);
    await this.wait(1000);
  }

  async enableSummariseTotalQty(): Promise<void> {
    const cb = this.page.locator(DocumentSelectors.summariseTotalQtyCheckbox).first();
    if (!(await cb.isChecked().catch(() => false))) await cb.click();
  }

  // ==========================================================================
  // SUBMISSION
  // ==========================================================================

  async clickSaveAndContinue(): Promise<void> {
    const btn = this.page.locator(DocumentSelectors.saveAndContinueBtn).first();
    await btn.scrollIntoViewIfNeeded();
    await this.wait(500);
    await btn.click();
    await this.wait(1500);
  }

  async loginAfterSave(password: string, captchaWaitMs = 90_000): Promise<void> {
    await this.page.locator(DocumentSelectors.loginPasswordInput).fill(password);
    if (captchaWaitMs > 0) {
      await this.waitForManualCaptcha(captchaWaitMs);
    }
    await this.page.locator(DocumentSelectors.loginSubmitBtn).click();
    await this.waitForNetworkIdle();
  }

  // ==========================================================================
  // ALL-IN-ONE FORM FILL
  // ==========================================================================

  async fillForm(data: DocumentFormData): Promise<void> {
    console.log(`\n📄 Filling ${this.documentPath} [${this.localeConfig.locale}]`);

    if (data.documentNumber) {
      console.log('  → Document number');
      await this.fillDocumentNumber(data.documentNumber);
    }

    if (data.currency) {
      console.log('  → Currency:', data.currency);
      await this.selectCurrency(data.currency);
    }

    await this.scrollBy(0, 200);

    if (data.features?.logoFilePath) {
      console.log('  → Logo upload');
      await this.uploadLogo(data.features.logoFilePath);
    }

    console.log('  → Business details');
    await this.fillBusinessDetails(data.business);

    await this.scrollBy(0, 300);

    console.log('  → Client details');
    await this.fillClientDetails(data.client);

    await this.scrollBy(0, 400);

    console.log('  → Line items');
    await this.fillLineItems(data.items);

    await this.scrollBy(0, 300);

    if (data.features) {
      const f = data.features;

      if (f.discount?.type === 'itemwise' && f.discount.itemDiscounts) {
        console.log('  → Item-wise discount');
        await this.applyItemWiseDiscount(f.discount.itemDiscounts);
      }

      if (f.showShippedTo) {
        console.log('  → Shipping section');
        await this.enableShowShippedTo();
      }

      if (f.summariseTotalQty) await this.enableSummariseTotalQty();

      await this.scrollBy(0, 300);

      if (f.notes)             { console.log('  → Notes');           await this.addNotes(f.notes); }
      if (f.terms)             { console.log('  → Terms');           await this.addTerms(f.terms); }
      if (f.additionalInfo)    { console.log('  → Additional info'); await this.addAdditionalInfo(f.additionalInfo); }
      if (f.contactDetails)    { console.log('  → Contact details'); await this.addContactDetails(); }
      if (f.signatureFilePath) { console.log('  → Signature');       await this.uploadSignature(f.signatureFilePath); }
    }

    console.log('  ✅ Form filled.\n');
  }

  // ==========================================================================
  // HELPERS (protected)
  // ==========================================================================

  protected async selectReactOption(
    controlSelector: string,
    optionText?: string,
    wrapperSelector?: string,
  ): Promise<void> {
    const clickTarget = wrapperSelector
      ? this.page.locator(wrapperSelector)
      : this.page.locator(controlSelector);
    await clickTarget.waitFor({ state: 'visible' });
    await clickTarget.click();
    await this.wait(300);

    if (optionText) {
      const control = this.page.locator(controlSelector);
      await control.fill(optionText);
      await this.wait(400);
      const option = this.page.locator(
        `.disco-select__option:has-text("${optionText}"), .disco-select-creatable__option:has-text("${optionText}")`
      ).first();
      await option.waitFor({ state: 'visible', timeout: 5_000 });
      await option.click();
    } else {
      const option = this.page.locator(
        '.disco-select__option, .disco-select-creatable__option'
      ).first();
      await option.waitFor({ state: 'visible', timeout: 5_000 });
      await option.click();
    }
    await this.wait(200);
  }
}
