import { Page } from '@playwright/test';
import { BaseDocumentPage } from './BaseDocumentPage';
import { SupportedLocale } from '../config/locales';

/**
 * InvoiceGeneratorPage
 *
 * Handles the free-online-invoice-generator for any supported locale.
 * All form-filling logic lives in BaseDocumentPage.
 *
 * Usage:
 *   const invoice = new InvoiceGeneratorPage(page, 'en-in');
 *   await invoice.navigateToGenerator();
 *   await invoice.clickCreateCta();
 *   await invoice.fillForm(data);
 *   await invoice.clickSaveAndContinue();
 */
export class InvoiceGeneratorPage extends BaseDocumentPage {

  protected get documentPath(): string {
    return 'free-online-invoice-generator';
  }

  protected get ctaButtonText(): RegExp {
    return /create your first invoice/i;
  }

  protected get documentNumberField(): string {
    return 'invoiceNumber';
  }

  constructor(page: Page, locale: SupportedLocale = 'en-in') {
    super(page, locale);
  }
}

// Re-export shared data interfaces so existing imports from this file keep working
export type {
  DocumentFormData as InvoiceFormData,
  PartyDetails as BusinessDetails,
  PartyDetails as ClientDetails,
  LineItem as LineItemData,
  DocumentFeatures as AdditionalFeatures,
  DiscountConfig,
  AdditionalChargeConfig,
} from './BaseDocumentPage';
