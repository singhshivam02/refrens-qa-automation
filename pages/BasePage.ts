import { Page, Locator } from '@playwright/test';
import { config } from '../config/environment';
import * as localeData from '../config/locales/en.json';

/**
 * BasePage
 *
 * Core Page Object Model class. All page-specific POMs extend this class.
 * Provides:
 *  - Locale management
 *  - Navigation helpers
 *  - Unified element interactions (fill, click, wait, scroll)
 *  - Dropdown / combobox support
 */
export class BasePage {
  protected page: Page;
  protected locale: typeof localeData;

  constructor(page: Page) {
    this.page    = page;
    this.locale  = localeData;
  }

  // ==========================================================================
  // LOCALE HELPERS
  // ==========================================================================

  /** Resolve a dot-notation path like "buttons.addNotes" → locale string */
  getLocalizedText(path: string): string {
    const keys  = path.split('.');
    let   value: any = this.locale;
    for (const key of keys) value = value?.[key];
    return typeof value === 'string' ? value : path;
  }

  getPlaceholder(key: string): string {
    return (this.locale as any).placeholders?.[key] ?? key;
  }

  getInvoiceLabel(key: string): string {
    return (this.locale as any).invoice?.[key] ?? key;
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  async navigateTo(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async navigateToInvoiceGenerator(): Promise<void> {
    await this.navigateTo(`${config.baseUrl}/free-online-invoice-generator`);
  }

  // ==========================================================================
  // ELEMENT INTERACTIONS
  // ==========================================================================

  /** Resolve a string selector or existing Locator to a Locator */
  private resolve(locator: string | Locator): Locator {
    return typeof locator === 'string' ? this.page.locator(locator) : locator;
  }

  async fillInput(locator: string | Locator, text: string): Promise<void> {
    const el = this.resolve(locator);
    await el.waitFor({ state: 'visible', timeout: config.timeout });
    await el.fill(text);
  }

  async clickElement(locator: string | Locator): Promise<void> {
    const el = this.resolve(locator);
    await el.waitFor({ state: 'visible', timeout: config.timeout });
    await el.click();
  }

  async fillByPlaceholder(placeholder: string, text: string): Promise<void> {
    await this.fillInput(`//input[@placeholder="${placeholder}"]`, text);
  }

  async fillByName(name: string, text: string): Promise<void> {
    await this.fillInput(`input[name="${name}"]`, text);
  }

  async clickButtonByText(text: string): Promise<void> {
    await this.clickElement(`//button[normalize-space()="${text}"]`);
  }

  /**
   * Select a combobox / autocomplete option.
   * 1. Focus + type in the input to trigger the dropdown.
   * 2. Wait for the matching option in the dropdown list.
   * 3. Click the option.
   */
  async selectDropdownOption(inputLocator: string | Locator, optionText: string): Promise<void> {
    await this.fillInput(inputLocator, optionText);

    // Try both common dropdown-option patterns
    const option = this.page.locator(
      `//div[@role="option" and contains(normalize-space(),"${optionText}")] | ` +
      `//li[contains(normalize-space(),"${optionText}")]`
    ).first();

    await option.waitFor({ state: 'visible', timeout: config.timeout });
    await option.click();
  }

  // ==========================================================================
  // ELEMENT STATE
  // ==========================================================================

  async waitForElement(locator: string | Locator): Promise<void> {
    await this.resolve(locator).waitFor({ state: 'visible', timeout: config.timeout });
  }

  async isElementVisible(locator: string | Locator): Promise<boolean> {
    try {
      return await this.resolve(locator).isVisible();
    } catch {
      return false;
    }
  }

  async getElementText(locator: string | Locator): Promise<string> {
    return (await this.resolve(locator).textContent()) ?? '';
  }

  async getInputValue(locator: string | Locator): Promise<string> {
    return await this.resolve(locator).inputValue();
  }

  // ==========================================================================
  // SCROLLING
  // ==========================================================================

  async scrollBy(x = 0, y = 500): Promise<void> {
    await this.page.evaluate(([px, py]) => window.scrollBy(px, py), [x, y] as [number, number]);
  }

  async scrollToElement(locator: string): Promise<void> {
    await this.page.locator(locator).scrollIntoViewIfNeeded();
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }

  // ==========================================================================
  // WAITS
  // ==========================================================================

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * A small, deliberate pause.
   * Prefer element-based waits; use this only where the app has no
   * observable DOM change to wait for (e.g. animation settle).
   */
  async wait(ms = 500): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Wait for a CAPTCHA to be solved manually.
   * Prints a countdown to the console so the tester knows time remaining.
   * @param timeoutMs  Total wait time in ms (default 90 s)
   */
  async waitForManualCaptcha(timeoutMs = 90_000): Promise<void> {
    const seconds = Math.ceil(timeoutMs / 1000);
    console.log(`\n🔐 CAPTCHA REQUIRED — you have ${seconds} seconds to solve it.`);
    console.log('   Switch to the browser window, solve the CAPTCHA, then wait...\n');

    const tickInterval = 10_000; // log every 10 s
    let elapsed = 0;
    while (elapsed < timeoutMs) {
      await this.page.waitForTimeout(tickInterval);
      elapsed += tickInterval;
      const remaining = Math.ceil((timeoutMs - elapsed) / 1000);
      if (remaining > 0) {
        console.log(`   ⏳ ${remaining}s remaining for CAPTCHA...`);
      }
    }
    console.log('   ✅ CAPTCHA wait complete — continuing.\n');
  }
}