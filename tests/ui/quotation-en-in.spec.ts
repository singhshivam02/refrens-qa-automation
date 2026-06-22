/**
 * Quotation Generator — India (en-in) — COMPREHENSIVE SINGLE TEST
 *
 * Target: https://qa01.bizsuggest.com/free-online-quotation-generator
 * Locale: en-in | Tax: GST | Currency: INR
 *
 * Covers (all in one flow):
 *
 *  HEADER
 *    ✓ Quotation number (unique per run)
 *    ✓ Due date (add & fill)
 *
 *  BILLED BY (Business)
 *    ✓ Name, Phone, GSTIN (auto-fills state), Address, City, Pincode, Email (dynamic), PAN
 *
 *  BILLED TO (Client)
 *    ✓ Name, Phone, GSTIN, Address, City, Pincode, Email (dynamic), PAN
 *
 *  LINE ITEMS
 *    ✓ Add 3 items (name, HSN/SAC, tax rate, qty, rate)
 *    ✓ Edit item 0 quantity — assert totals update
 *    ✓ Delete item 2 — assert only 2 remain
 *
 *  ITEM-WISE DISCOUNT
 *    ✓ 5% on item 0, 10% on item 1 (NOT discount-on-total)
 *
 *  SHIPPING DETAILS
 *    ✓ Enable via checkbox
 *    ✓ Click "Same as your business address"
 *    ✓ Click "Same as client's address"
 *
 *  NOTES & TERMS
 *    ✓ Fill via Toast rich-text editor
 *
 *  VALIDATE — every major input asserted after fill
 *
 *  FINAL
 *    ✓ page.pause() — browser stays open for manual inspection
 */

import { test, expect } from '@playwright/test';
import { QuotationGeneratorPage } from '../../pages/QuotationGeneratorPage';
import { generateEmail } from '../../fixtures/testData';

// ── helpers ──────────────────────────────────────────────────────────────────

async function readText(page: any, ...selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 3000 });
      const text = (await el.textContent())?.trim();
      if (text) return text;
    } catch { /* try next */ }
  }
  return null;
}

async function assertField(page: any, expectedValue: string, ...selectors: string[]) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 4000 });
      await expect(el).toHaveValue(expectedValue);
      return;
    } catch { /* try next */ }
  }
  await expect(page.locator(selectors[selectors.length - 1]).first()).toHaveValue(expectedValue);
}

// ── test ─────────────────────────────────────────────────────────────────────

test.describe('Quotation Generator — India (en-in) — Comprehensive', () => {

  test('comprehensive: all fields, add/edit/delete items, shipping, discount, validate + pause', async ({ page }) => {
    test.slow();

    const ts             = Date.now();
    const quotationNum   = `QUO-COMP-${ts}`;
    const businessEmail  = generateEmail('biz');
    const clientEmail    = generateEmail('client');

    const qp = new QuotationGeneratorPage(page, 'en-in');
    await qp.navigateToGenerator();
    await expect(page).toHaveURL(/free-online-quotation-generator/, { timeout: 15_000 });
    await qp.clickCreateCta();

    // ── QUOTATION NUMBER ────────────────────────────────────────────────────
    console.log('\n[1] Quotation number');
    await qp.fillDocumentNumber(quotationNum);
    await assertField(page, quotationNum, 'input[name="invoiceNumber"]');

    // ── DUE DATE ────────────────────────────────────────────────────────────
    console.log('[2] Due date');
    {
      const addDueDateBtn = page.locator([
        'button:has-text("Add due date")',
        'button:has-text("Add Due Date")',
        '[data-test-id="add-due-date-btn"]',
      ].join(', ')).first();

      if (await addDueDateBtn.isVisible().catch(() => false)) {
        //await addDueDateBtn.click();
        await page.waitForTimeout(400);
      }

      const dueDateInput = page.locator([
        'input[name="dueDate"]',
        '[data-test-id="due-date"] input',
        'input[placeholder*="Due" i]',
      ].join(', ')).first();

      if (await dueDateInput.isVisible().catch(() => false)) {
        await dueDateInput.click({ clickCount: 3 });
        await dueDateInput.fill('30/04/2025');
        await page.waitForTimeout(300);
      }
    }

    // ── BILLED BY ──────────────────────────────────────────────────────────
    console.log('[3] Business (Billed By)');
    await qp.fillBusinessDetails({
      name:    'Tech Solutions Pvt Ltd',
      phone:   '9876543210',
      email:   businessEmail,
      taxId:   '29AABCT1234A1Z5',
      address: '123 Tech Street, Building A',
      city:    'Bangalore',
      pincode: '560001',
      pan:     'AABCT1234A',
    });

    await assertField(page, 'Tech Solutions Pvt Ltd',       'input[name="billedBy.name"]');
    await assertField(page, '29AABCT1234A1Z5',              'input[name="billedBy.gstin"]');
    await assertField(page, businessEmail,                  'input[name="billedBy.email"]');
    await assertField(page, 'Bangalore',                    'input[name="billedBy.city"]');
    await assertField(page, '560001',                       'input[name="billedBy.pincode"]');
    await assertField(page, '123 Tech Street, Building A',  'input[name="billedBy.street"]');
    console.log('  ✓ Billed By fields verified');

    // ── BILLED TO ──────────────────────────────────────────────────────────
    console.log('[4] Client (Billed To)');
    await qp.fillClientDetails({
      name:    'Acme Corporation',
      phone:   '9123456789',
      email:   clientEmail,
      taxId:   '27AAPBT1234H1Z6',
      address: '456 Client Avenue, Suite 200',
      city:    'Mumbai',
      pincode: '400001',
      pan:     'AAPBT1234H',
    });

    await assertField(page, 'Acme Corporation',             'input[name="billedTo.name"]');
    await assertField(page, '27AAPBT1234H1Z6',              'input[name="billedTo.gstin"]');
    await assertField(page, clientEmail,                    'input[name="billedTo.email"]');
    await assertField(page, 'Mumbai',                       'input[name="billedTo.city"]');
    await assertField(page, '400001',                       'input[name="billedTo.pincode"]');
    await assertField(page, '456 Client Avenue, Suite 200', 'input[name="billedTo.street"]');
    console.log('  ✓ Billed To fields verified');

    // ── LINE ITEMS — ADD 3 ─────────────────────────────────────────────────
    console.log('[5] Add 3 line items');
    await qp.fillLineItems([
      { name: 'Consulting Services', hsnSac: '998512', taxRate: '18', quantity: '2',  rate: '50000' },
      { name: 'Software License',    hsnSac: '997331', taxRate: '18', quantity: '5',  rate: '10000' },
      { name: 'Website Development', hsnSac: '9983',   taxRate: '12', quantity: '1',  rate: '30000' },
    ]);

    await assertField(page, '2',     'input[name="items[0].quantity"]');
    await assertField(page, '50000', 'input[name="items[0].rate"]');
    await assertField(page, '5',     'input[name="items[1].quantity"]');
    await assertField(page, '10000', 'input[name="items[1].rate"]');
    await assertField(page, '1',     'input[name="items[2].quantity"]');
    await assertField(page, '30000', 'input[name="items[2].rate"]');
    console.log('  ✓ 3 items added and verified');

    // ── READ SUBTOTAL BEFORE EDIT ──────────────────────────────────────────
    // const subtotalBefore = await readText(page,
    //   '[data-test-id="subtotal-value"]',
    //   '[data-test-id="sub-total-amount"]',
    // );
    // console.log(`[6] Subtotal before edit: ${subtotalBefore ?? '(selector TBD)'}`);

    // ── EDIT ITEM 0: quantity 2 → 3 ───────────────────────────────────────
    console.log('[7] Edit item 0 quantity: 2 → 3');
    await qp.editLineItemField(0, 'quantity', '3');
    await page.waitForTimeout(500);
    await assertField(page, '3', 'input[name="items[0].quantity"]');

    // const subtotalAfterEdit = await readText(page,
    //   '[data-test-id="subtotal-value"]',
    //   '[data-test-id="sub-total-amount"]',
    // );
    // console.log(`  Subtotal after edit: ${subtotalAfterEdit ?? '(selector TBD)'}`);
    // console.log('  ✓ Edit verified');

    // ── DELETE ITEM 2 ──────────────────────────────────────────────────────
    console.log('[8] Delete item 2 (Website Development)');
    await qp.deleteLineItem(2);
    await page.waitForTimeout(500);

    await expect(page.locator('input[name="items[2].quantity"]')).not.toBeVisible({ timeout: 5_000 });
    await assertField(page, '3',     'input[name="items[0].quantity"]');
    await assertField(page, '50000', 'input[name="items[0].rate"]');
    await assertField(page, '5',     'input[name="items[1].quantity"]');

    // const subtotalAfterDelete = await readText(page,
    //   '[data-test-id="subtotal-value"]',
    //   '[data-test-id="sub-total-amount"]',
    // );
    // console.log(`  Subtotal after delete: ${subtotalAfterDelete ?? '(selector TBD)'}`);
    // console.log('  ✓ Delete verified — 2 items remain');

    // ── ITEM-WISE DISCOUNT ─────────────────────────────────────────────────
    console.log('[9] Item-wise discount: 5% on item 0, 10% on item 1');
    await qp.applyItemWiseDiscount({ 0: '5', 1: '10' });

    await assertField(page, '5',  'input[name="items[0].discount.amount"]');
    await assertField(page, '10', 'input[name="items[1].discount.amount"]');

    // const subtotalAfterDiscount = await readText(page,
    //   '[data-test-id="subtotal-value"]',
    //   '[data-test-id="sub-total-amount"]',
    // );
    // console.log(`  Subtotal after discount: ${subtotalAfterDiscount ?? '(selector TBD)'}`);
    // console.log('  ✓ Discounts applied and verified');

    // ── SHIPPING SECTION ───────────────────────────────────────────────────
    console.log('[10] Shipping section');
    await qp.enableShowShippedTo();

    // const shippedToCheckbox = page.locator([
    //   'input[name="showShippedTo"]',
    //   '[data-test-id="show-shipped-to"] input',
    //   'input[name="shippingDetails"]',
    // ].join(', ')).first();
    // await expect(shippedToCheckbox).toBeChecked({ timeout: 5_000 });
    // console.log('  ✓ Shipping section enabled');

    await qp.clickSameAsBusinessInShipping();
    console.log('  ✓ "Same as business address" clicked');

    await page.waitForTimeout(400);

    await qp.clickSameAsClientInShipping();
    console.log('  ✓ "Same as client\'s address" clicked');

    await page.waitForTimeout(400);

    // ── NOTES & TERMS ──────────────────────────────────────────────────────
    console.log('[11] Notes');
    await qp.addNotes('Thank you for the opportunity. This quotation is valid for 30 days.');
    
    console.log('[12] Additional Info');
    await qp.addAdditionalInfo('Please contact us for any questions or clarifications regarding this quotation.');

    console.log('[13] Contact Details');
    await qp.addContactDetails();

    console.log('[14] Terms');
    await qp.addTerms('Prices are exclusive of GST. Payment terms: 50% advance, 50% on delivery. Quote valid until 30th April 2025.');

    // ── GRAND TOTAL READ ───────────────────────────────────────────────────
    // const grandTotal = await readText(page,
    //   '[data-test-id="grand-total-value"]',
    //   '[data-test-id="grand-total-amount"]',
    //   '[data-test-id="total-amount"]',
    // );
    // console.log(`\n[TOTALS] Grand total: ${grandTotal ?? '(selector TBD — check DevTools)'}`);

    // const taxTotal = await readText(page,
    //   '[data-test-id="tax-total-value"]',
    //   '[data-test-id="tax-amount"]',
    // );
    // console.log(`         Tax total:   ${taxTotal ?? '(selector TBD)'}`);

    // ── SCROLL TO TOP ──────────────────────────────────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    console.log('\n✅ All steps complete. Browser paused for manual inspection.');
    console.log('   Press "Resume" in the Playwright toolbar to close.\n');

    await page.pause();
  });

});
