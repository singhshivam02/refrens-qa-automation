import { Page } from '@playwright/test';
import { BaseDocumentPage } from './BaseDocumentPage';
import { SupportedLocale } from '../config/locales';

/**
 * ProformaInvoicePage
 *
 * Handles the proforma-invoice-templates generator for any supported locale.
 *
 * Usage:
 *   const pi = new ProformaInvoicePage(page, 'en-in');
 *   await pi.navigateToGenerator();
 *   await pi.clickCreateCta();
 *   await pi.fillForm(data);
 *   await pi.clickSaveAndContinue();
 */
export class ProformaInvoicePage extends BaseDocumentPage {

  protected get documentPath(): string {
    return 'proforma-invoice-templates';
  }

  protected get ctaButtonText(): RegExp {
    return /create your first proforma invoice/i;
  }

  protected get documentNumberField(): string {
    return 'invoiceNumber';
  }

  constructor(page: Page, locale: SupportedLocale = 'en-in') {
    super(page, locale);
  }
}
