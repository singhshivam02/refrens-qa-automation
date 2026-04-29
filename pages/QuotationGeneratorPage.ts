import { Page } from '@playwright/test';
import { BaseDocumentPage } from './BaseDocumentPage';
import { SupportedLocale } from '../config/locales';

/**
 * QuotationGeneratorPage
 *
 * Handles the free-online-quotation-generator for any supported locale.
 *
 * Usage:
 *   const quotation = new QuotationGeneratorPage(page, 'en-in');
 *   await quotation.navigateToGenerator();
 *   await quotation.clickCreateCta();
 *   await quotation.fillForm(data);
 *   await quotation.clickSaveAndContinue();
 */
export class QuotationGeneratorPage extends BaseDocumentPage {

  protected get documentPath(): string {
    return 'free-online-quotation-generator';
  }

  protected get ctaButtonText(): RegExp {
    return /create your first quotation/i;
  }

  protected get documentNumberField(): string {
    // The "Quotation No" field shares the same DOM name as the invoice field
    return 'invoiceNumber';
  }

  constructor(page: Page, locale: SupportedLocale = 'en-in') {
    super(page, locale);
  }
}
