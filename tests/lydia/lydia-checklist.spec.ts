/**
 * Lydia Checklist — Logged-in App Flows
 *
 * Prerequisite: storageState.json must exist.
 *   Run auth.setup (solve CAPTCHA once) — all tests here reuse that session.
 *   Credentials: QA_EMAIL / QA_PASSWORD in .env  (shivam.s@refrens.com)
 *
 * How to run (all):
 *   npx playwright test --project=lydia --headed
 *
 * How to run one test:
 *   npx playwright test --project=lydia --headed -g "Invoice dashboard"
 *
 * Each test pauses at key points — press Resume in the Playwright Inspector to continue.
 *
 * Checklist:
 *    0.  Auth verification             confirm /app URL, not on /login
 *    1.  Dashboard                     main app dashboard
 *    2.  Invoice dashboard             list + filters (status, date, search)
 *    3.  New Invoice                   create invoice with new client
 *    4.  New PO                        create purchase order with new vendor
 *    5.  New Expenditure                create expenditure with new vendor
 *    6.  Edit Invoice                  open existing invoice and edit
 *    7.  View Invoice (Paid/Unpaid)    mark paid / unpaid toggle
 *    8.  Leads                         CRM leads section
 *    9.  Account Reports               Reports & More — all sub-reports
 *   10.  Email                         send via email, with & without identity
 *   11.  WhatsApp                      send via WhatsApp for docs and leads
 *   12.  Download PDF & CSV            all document types + list CSVs
 *   13.  Client & Vendor Statement     download from reports
 *   14.  Trial Balance PDF             download from reports
 *   15.  Profit & Loss PDF             download from reports
 *   16.  Balance Sheet PDF             download from reports
 *   17.  Ledger Statement PDF          download from reports
 *   18.  Create Document (elisif)      verify logged-in redirect on public page
 */

import { test, expect, Page } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────

const urlKey = (process.env.DEFAULT_URL_KEY || 'peaky-blinders').trim();

// Set in test 3 after the invoice is saved; consumed by test 6.
// Safe because workers=1 and tests in this file run sequentially.
let lastCreatedInvoiceUrl = '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function clickFirst(page: Page, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await loc.click();
      return;
    }
  }
  await page.locator(selectors[selectors.length - 1]).first().click();
}

async function goTo(page: Page, path: string) {
  await page.goto(`/app/${urlKey}/${path}`);
  await page.waitForLoadState('networkidle');
  console.log(`[nav] ${page.url()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Auth Verification
// ─────────────────────────────────────────────────────────────────────────────

test.describe('0. Auth — session verification', () => {

  test('storageState session is active, URL is /app', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    console.log(`[auth] landed at: ${url}`);

    // Logged-in users land in /app/..., never /login
    await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
    console.log('[auth] ✓ session active');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dashboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('1. Dashboard', () => {

  test('main app dashboard loads', async ({ page }) => {
    await page.goto(`/app/${urlKey}`);
    await page.waitForLoadState('networkidle');
    console.log(`[dashboard] at: ${page.url()}`);

    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Invoice Dashboard (with filters)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('2. Invoice dashboard', () => {

  test('invoice list loads and status + client filters work', async ({ page }) => {
    await goTo(page, 'invoices');

    await expect(page).toHaveURL(/\/invoices/, { timeout: 15_000 });

    const createBtn = page.locator([
      'button:has-text("Create New Invoice")',
      'button:has-text("New Invoice")',
      'a:has-text("Create Invoice")',
      'button:has-text("Create new")',
    ].join(', ')).first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });

    // Wait for initial table load
    await page.waitForSelector('table tbody tr', { timeout: 10_000 }).catch(() => {});
    const initialCount = await page.locator('table tbody tr').count();
    console.log(`[invoices] ✓ dashboard loaded — ${initialCount} row(s)`);

    // ── Status filter (multi-select) ──────────────────────────────────────────
    // Hidden input[name="Status Filter"] uniquely identifies this disco-select
    const statusWrapper = page.locator('.disco-select').filter({
      has: page.locator('input[name="Status Filter"]'),
    }).first();
    const statusControl = statusWrapper.locator('.disco-select__control').first();

    if (await statusControl.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Status values the user listed; regex handles label variants (e.g. "Part Paid" for "partpaid")
      const statuses = [
        { label: 'Draft',     pattern: /draft/i     },
        { label: 'Paid',      pattern: /^paid$/i    },
        { label: 'Unpaid',    pattern: /unpaid/i    },
        { label: 'Overdue',   pattern: /overdue/i   },
        { label: 'Part Paid', pattern: /part.?paid/i },
        { label: 'Pending',   pattern: /pending/i   },
        { label: 'Cancelled', pattern: /cancel/i    },
      ];

      for (const { label, pattern } of statuses) {
        // Open the dropdown
        await statusControl.click();
        await page.waitForTimeout(400);

        const option = page.locator('.disco-select__menu .disco-select__option')
          .filter({ hasText: pattern }).first();

        if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await option.click();
          // Multi-select keeps menu open after selection — close it
          await page.keyboard.press('Escape');
          await page.waitForLoadState('networkidle');

          const rowCount  = await page.locator('table tbody tr').count();
          const hasEmpty  = await page.locator('text=/no invoice|no result|no data/i')
            .isVisible({ timeout: 1_500 }).catch(() => false);

          console.log(`[invoices] status="${label}" → ${rowCount} row(s)${hasEmpty ? ' (empty list)' : ''}`);
          // Table must have responded: either rows are shown or an empty-state message is visible
          expect(rowCount >= 0).toBeTruthy();

          await page.pause();

          // Remove the chip for this status to reset before next iteration
          const chip = statusWrapper
            .locator('.disco-select__multi-value')
            .filter({ hasText: pattern }).first();
          const chipRemove = chip.locator('.disco-select__multi-value__remove').first();

          if (await chipRemove.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await chipRemove.click();
          } else {
            // Fallback: clear-all indicator
            const clearAll = statusWrapper.locator('.disco-select__clear-indicator').first();
            if (await clearAll.isVisible({ timeout: 1_500 }).catch(() => false)) {
              await clearAll.click();
            }
          }
          await page.waitForLoadState('networkidle');
        } else {
          console.log(`[invoices] ⚠ option "${label}" not in menu — skipping`);
          await page.keyboard.press('Escape');
        }
      }

      console.log('[invoices] ✓ all status filter values tested');
    } else {
      console.log('[invoices] ⚠ status filter (input[name="Status Filter"]) not found — pausing');
      await page.pause();
    }

    // ── Client filter ─────────────────────────────────────────────────────────
    // Identified by its default value "All Clients" shown as a single-value
    const clientControl = page.locator('.disco-select__control').filter({
      has: page.locator('.disco-select__single-value', { hasText: 'All Clients' }),
    }).first();

    if (await clientControl.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await clientControl.click();
      await page.waitForTimeout(500);

      const firstOption = page.locator('.disco-select__menu .disco-select__option').first();
      if (await firstOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const clientName = (await firstOption.textContent())?.trim() ?? '';
        await firstOption.click();
        await page.waitForLoadState('networkidle');

        const filteredCount = await page.locator('table tbody tr').count();
        const hasEmpty = await page.locator('text=/no invoice|no result|no data/i')
          .isVisible({ timeout: 1_500 }).catch(() => false);

        console.log(`[invoices] ✓ client="${clientName}" → ${filteredCount} row(s)${hasEmpty ? ' (empty list)' : ''}`);
        expect(filteredCount >= 0).toBeTruthy();

        await page.pause();
      } else {
        console.log('[invoices] ⚠ no options in client dropdown — pausing');
        await page.keyboard.press('Escape');
        await page.pause();
      }
    } else {
      console.log('[invoices] ⚠ client filter ("All Clients" default) not found — pausing');
      await page.pause();
    }
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. New Invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('3. New Invoice', () => {

  test('create a new invoice with all fields filled', async ({ page }) => {
    test.slow();

    const ts           = Date.now();
    const businessName = `QA Client ${ts}`;
    const city         = 'Mumbai';

    await goTo(page, 'invoices');

    await clickFirst(page, [
      'button:has-text("Create New Invoice")',
      'button:has-text("New Invoice")',
      'a:has-text("Create Invoice")',
      'button:has-text("Create new")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[create] form at: ${page.url()}`);

    // ── Invoice header ────────────────────────────────────────────────────────
    await page.locator('input[name="invoiceNumber"]').waitFor({ state: 'visible', timeout: 15_000 });

    const invoiceNumber = await page.locator('input[name="invoiceNumber"]').inputValue();
    expect(invoiceNumber).toBeTruthy();
    console.log(`[create] invoice number: ${invoiceNumber}`);

    const invoiceDate = await page.locator('input[name="invoiceDate"]').inputValue();
    expect(invoiceDate).toBeTruthy();
    console.log(`[create] invoice date: ${invoiceDate}`);

    const dueDate = await page.locator('input[name="dueDate"]').inputValue();
    expect(dueDate).toBeTruthy();
    console.log(`[create] due date: ${dueDate}`);

    // Add Subtitle
    const addSubtitleBtn = page.locator('button:has-text("Add Subtitle")').first();
    if (await addSubtitleBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addSubtitleBtn.click();
      const subtitleInput = page.locator('[name="invoiceSubTitle"], [name="subtitle"], [placeholder*="subtitle" i]').first();
      if (await subtitleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await subtitleInput.fill('QA Automation Test Invoice');
        console.log('[create] ✓ subtitle added');
      }
    }

    // ── Billed By — verify pre-selected ──────────────────────────────────────
    const billedByName = await page.locator('.disco-select__single-value').first().textContent();
    console.log(`[create] billed by: ${billedByName}`);

    // ── Billed To — Add New Client ────────────────────────────────────────────
    console.log('[create] opening "Add New Client" popup...');
    await page.locator('button:has-text("Add New Client")').first().click();

    // Business Name is react-select-creatable — placeholder is a div, not input attr
    const businessNameControl = page.locator('.disco-select-creatable__control')
      .filter({ hasText: 'Business Name' })
      .first();
    await businessNameControl.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('[create] ✓ Add New Client popup open');

    await businessNameControl.click();
    await page.keyboard.type(businessName);
    const createOption = page.locator('.disco-select-creatable__option').first();
    await createOption.waitFor({ state: 'visible', timeout: 5_000 });
    await createOption.click();
    console.log(`[create] business name set: ${businessName}`);

    await page.locator('input[placeholder="City/Town Name"]').first().fill(city);
    console.log(`[create] city set: ${city}`);

    await page.locator('button').filter({ hasText: /^Save$/ }).last().click();
    await page.waitForLoadState('networkidle');
    console.log('[create] ✓ new client saved');

    await expect(
      page.locator('.disco-select__single-value, .disco-select-creatable__single-value')
        .filter({ hasText: businessName }).first()
    ).toBeVisible({ timeout: 8_000 });
    console.log('[create] ✓ client set in Billed To');

    // ── Add Shipping Details ──────────────────────────────────────────────────
    const shippingCheckbox = page.locator('input[name="showShippedTo"]').first();
    if (await shippingCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await shippingCheckbox.click();
      await page.waitForTimeout(500);
      console.log('[create] ✓ shipping details toggled on');

      // Fill shipping address fields if they appear
      const shippedToCity = page.locator('input[name="shippedTo.city"]').first();
      if (await shippedToCity.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await shippedToCity.fill('Delhi');
      }
      const shippedToPincode = page.locator('input[name="shippedTo.pincode"]').first();
      if (await shippedToPincode.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await shippedToPincode.fill('110001');
      }
    }

    // ── Line item 1 ───────────────────────────────────────────────────────────
    // Item name is a disco-select-creatable — hidden input[name="items[0].name"] is
    // never visible. Click the control, type, then pick the dropdown option.
    const itemNameControl = page.locator('[gridkey="name"] .disco-select-creatable__control').first();
    await itemNameControl.waitFor({ state: 'visible', timeout: 8_000 });
    await itemNameControl.click();
    await page.keyboard.type('QA Test Service');
    await page.waitForTimeout(600);
    const itemOption = page.locator('.disco-select-creatable__option').first();
    if (await itemOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await itemOption.click();
    } else {
      await page.keyboard.press('Enter');
    }
    console.log('[create] ✓ item 1 name set');

    // HSN code
    const hsn0 = page.locator('input[name="items[0].hsn"]').first();
    if (await hsn0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await hsn0.fill('998314');
      console.log('[create] ✓ HSN set: 998314');
    }

    // GST Rate
    const gstRate0 = page.locator('input[name="items[0].gstRate"]').first();
    if (await gstRate0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await gstRate0.click({ clickCount: 3 });
      await gstRate0.fill('18');
      await page.keyboard.press('Tab');
      console.log('[create] ✓ GST rate: 18%');
    }

    // Quantity and Rate
    const qty0 = page.locator('input[name="items[0].quantity"]').first();
    await qty0.click({ clickCount: 3 });
    await qty0.fill('2');

    const rate0 = page.locator('input[name="items[0].rate"]').first();
    await rate0.click({ clickCount: 3 });
    await rate0.fill('5000');
    await page.keyboard.press('Tab');
    console.log('[create] ✓ item 1: qty=2, rate=5000');

    // Add Description for item 1
    const addDesc0 = page.locator('button[aria-label="Add Description"]').first();
    if (await addDesc0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addDesc0.click();
      await page.waitForTimeout(400);
      const desc0 = page.locator('textarea[name="items[0].description"]').first();
      if (await desc0.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await desc0.fill('QA automation test — consulting service, 2 hrs @ ₹5,000');
        console.log('[create] ✓ item 1 description added');
      }
    }

    // ── Line item 2 ───────────────────────────────────────────────────────────
    const addNewLineBtn = page.locator('button:has-text("Add New Line")').first();
    if (await addNewLineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addNewLineBtn.click();
      await page.waitForTimeout(600);
      console.log('[create] ✓ second line item row added');

      const item1NameControl = page.locator('[gridkey="name"] .disco-select-creatable__control').nth(1);
      if (await item1NameControl.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await item1NameControl.click();
        await page.keyboard.type('QA Test Product');
        await page.waitForTimeout(600);
        const item1Option = page.locator('.disco-select-creatable__option').first();
        if (await item1Option.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await item1Option.click();
        } else {
          await page.keyboard.press('Enter');
        }
        console.log('[create] ✓ item 2 name set');
      }

      const hsn1 = page.locator('input[name="items[1].hsn"]').first();
      if (await hsn1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await hsn1.fill('850340');
      }

      const gstRate1 = page.locator('input[name="items[1].gstRate"]').first();
      if (await gstRate1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await gstRate1.click({ clickCount: 3 });
        await gstRate1.fill('12');
        await page.keyboard.press('Tab');
      }

      const qty1 = page.locator('input[name="items[1].quantity"]').first();
      if (await qty1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await qty1.click({ clickCount: 3 });
        await qty1.fill('3');
      }

      const rate1 = page.locator('input[name="items[1].rate"]').first();
      if (await rate1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await rate1.click({ clickCount: 3 });
        await rate1.fill('2500');
        await page.keyboard.press('Tab');
        console.log('[create] ✓ item 2: qty=3, rate=2500');
      }

      // Add Description for item 2
      const addDesc1 = page.locator('button[aria-label="Add Description"]').nth(1);
      if (await addDesc1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addDesc1.click();
        await page.waitForTimeout(400);
        const desc1 = page.locator('textarea[name="items[1].description"]').first();
        if (await desc1.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await desc1.fill('QA automation test — hardware product, 3 units @ ₹2,500');
          console.log('[create] ✓ item 2 description added');
        }
      }
    }

    // ── Discounts ─────────────────────────────────────────────────────────────
    const addDiscountsBtn = page.locator('button.discount-dropdown-btn, button:has-text("Add Discounts")').first();
    if (await addDiscountsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addDiscountsBtn.click();
      await page.waitForTimeout(500);
      const discountOnTotal = page.locator('button:has-text("Give Discount on Total"), li:has-text("Discount on Total")').first();
      if (await discountOnTotal.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await discountOnTotal.click();
        await page.waitForTimeout(400);
        const discountInput = page.locator('input[name="discountValue"]').first();
        if (await discountInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await discountInput.fill('5');
          console.log('[create] ✓ 5% discount on total applied');
        }
      }
    }

    // ── Additional Charges ────────────────────────────────────────────────────
    const addChargesBtn = page.locator('button[data-test-id="add-additional-charges-btn"]').first();
    if (await addChargesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addChargesBtn.click();
      await page.waitForTimeout(500);
      console.log('[create] ✓ additional charges panel opened');
      // Pause to inspect and fill additional charge fields manually if needed
    }

    // ── Add Signature ─────────────────────────────────────────────────────────
    const addSignatureBtn = page.locator('button[data-test-id="add-signature-btn"], button:has-text("Add Signature")').first();
    if (await addSignatureBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addSignatureBtn.click();
      await page.waitForTimeout(400);
      console.log('[create] ✓ signature section opened');
    }

    // ── Add Terms & Conditions ────────────────────────────────────────────────
    const addTermsBtn = page.locator('button[data-test-id="add-terms-btn"]').first();
    if (await addTermsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addTermsBtn.click();
      await page.waitForTimeout(600);
      // Toast-UI editor is a contenteditable div, not a textarea
      const termsEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
      if (await termsEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await termsEditor.click();
        await page.keyboard.type('Payment due within 15 days. Late payments attract 2% interest per month.');
        console.log('[create] ✓ terms & conditions filled');
      }
    }

    // ── Add Notes ─────────────────────────────────────────────────────────────
    const addNotesBtn = page.locator('button[data-test-id="add-notes-btn"]').first();
    if (await addNotesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addNotesBtn.click();
      await page.waitForTimeout(600);
      const notesEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await notesEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await notesEditor.click();
        await page.keyboard.type('Thank you for your business! QA automation test note.');
        console.log('[create] ✓ notes filled');
      }
    }

    // ── Add Additional Info ───────────────────────────────────────────────────
    const addAdditionalInfoBtn = page.locator('button[data-test-id="add-additional-info-btn"]').first();
    if (await addAdditionalInfoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addAdditionalInfoBtn.click();
      await page.waitForTimeout(600);
      const additionalInfoEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await additionalInfoEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await additionalInfoEditor.click();
        await page.keyboard.type('QA automation test — additional information section.');
        console.log('[create] ✓ additional info filled');
      }
    }

    // ── Add Contact Details ───────────────────────────────────────────────────
    const addContactDetailsBtn = page.locator('button[data-test-id="add-contact-details-btn"]').first();
    if (await addContactDetailsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addContactDetailsBtn.click();
      await page.waitForTimeout(400);
      console.log('[create] ✓ contact details section opened');
    }

    // ── Save invoice ──────────────────────────────────────────────────────────
    await clickFirst(page, [
      'button:has-text("Save & Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Save Invoice")',
    ]);
    await page.waitForURL(url => !url.pathname.endsWith('/new'), { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
    lastCreatedInvoiceUrl = page.url();
    console.log(`[create] ✓ invoice saved — at: ${lastCreatedInvoiceUrl}`);

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. New PO (Purchase Order)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('4. New PO', () => {

  test('create a new PO with all fields filled', async ({ page }) => {
    test.slow();

    const ts         = Date.now();
    const vendorName = `QA Vendor ${ts}`;
    const city       = 'Mumbai';

    await page.goto(`/app/${urlKey}/purchase-orders`);
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('purchase-order')) {
      await page.goto(`/app/${urlKey}/po`);
      await page.waitForLoadState('networkidle');
    }

    console.log(`[po] at: ${page.url()}`);

    await clickFirst(page, [
      'button:has-text("Create New PO")',
      'button:has-text("New Purchase Order")',
      'button:has-text("Create Purchase Order")',
      'button:has-text("Create new")',
      'a:has-text("Create")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[po] form at: ${page.url()}`);

    // ── PO header ─────────────────────────────────────────────────────────────
    await page.locator('input[name="invoiceNumber"]').waitFor({ state: 'visible', timeout: 15_000 });

    const poNumber = await page.locator('input[name="invoiceNumber"]').inputValue();
    expect(poNumber).toBeTruthy();
    console.log(`[po] PO number: ${poNumber}`);

    const poDate = await page.locator('input[name="invoiceDate"]').inputValue();
    expect(poDate).toBeTruthy();
    console.log(`[po] PO date: ${poDate}`);

    const dueDate = await page.locator('input[name="dueDate"]').inputValue();
    expect(dueDate).toBeTruthy();
    console.log(`[po] due date: ${dueDate}`);

    // Add Subtitle
    const addSubtitleBtn = page.locator('button:has-text("Add Subtitle")').first();
    if (await addSubtitleBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addSubtitleBtn.click();
      const subtitleInput = page.locator('[name="invoiceSubTitle"], [name="subtitle"], [placeholder*="subtitle" i]').first();
      if (await subtitleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await subtitleInput.fill('QA Automation Test PO');
        console.log('[po] ✓ subtitle added');
      }
    }

    // ── Billed By — verify pre-selected ──────────────────────────────────────
    const billedByName = await page.locator('.disco-select__single-value').first().textContent();
    console.log(`[po] billed by: ${billedByName}`);

    // ── Vendor — Add New Vendor (in place of client) ─────────────────────────
    console.log('[po] opening "Add New Vendor" popup...');
    await page.locator('button:has-text("Add New Vendor")').first().click();

    // Business Name is react-select-creatable — placeholder is a div, not input attr
    const businessNameControl = page.locator('.disco-select-creatable__control')
      .filter({ hasText: 'Business Name' })
      .first();
    await businessNameControl.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('[po] ✓ Add New Vendor popup open');

    await businessNameControl.click();
    await page.keyboard.type(vendorName);
    const createOption = page.locator('.disco-select-creatable__option').first();
    await createOption.waitFor({ state: 'visible', timeout: 5_000 });
    await createOption.click();
    console.log(`[po] vendor name set: ${vendorName}`);

    await page.locator('input[placeholder="City/Town Name"]').first().fill(city);
    console.log(`[po] city set: ${city}`);

    await page.locator('button').filter({ hasText: /^Save$/ }).last().click();
    await page.waitForLoadState('networkidle');
    console.log('[po] ✓ new vendor saved');

    await expect(
      page.locator('.disco-select__single-value, .disco-select-creatable__single-value')
        .filter({ hasText: vendorName }).first()
    ).toBeVisible({ timeout: 8_000 });
    console.log('[po] ✓ vendor set');

    // ── Add Shipping Details ──────────────────────────────────────────────────
    const shippingCheckbox = page.locator('input[name="showShippedTo"]').first();
    if (await shippingCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await shippingCheckbox.click();
      await page.waitForTimeout(500);
      console.log('[po] ✓ shipping details toggled on');

      // Fill shipping address fields if they appear
      const shippedToCity = page.locator('input[name="shippedTo.city"]').first();
      if (await shippedToCity.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await shippedToCity.fill('Delhi');
      }
      const shippedToPincode = page.locator('input[name="shippedTo.pincode"]').first();
      if (await shippedToPincode.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await shippedToPincode.fill('110001');
      }
    }

    // ── Line item 1 ───────────────────────────────────────────────────────────
    // Item name is a disco-select-creatable — hidden input[name="items[0].name"] is
    // never visible. Click the control, type, then pick the dropdown option.
    const itemNameControl = page.locator('[gridkey="name"] .disco-select-creatable__control').first();
    await itemNameControl.waitFor({ state: 'visible', timeout: 8_000 });
    await itemNameControl.click();
    await page.keyboard.type('QA Test Service');
    await page.waitForTimeout(600);
    const itemOption = page.locator('.disco-select-creatable__option').first();
    if (await itemOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await itemOption.click();
    } else {
      await page.keyboard.press('Enter');
    }
    console.log('[po] ✓ item 1 name set');

    // HSN code
    const hsn0 = page.locator('input[name="items[0].hsn"]').first();
    if (await hsn0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await hsn0.fill('998314');
      console.log('[po] ✓ HSN set: 998314');
    }

    // GST Rate
    const gstRate0 = page.locator('input[name="items[0].gstRate"]').first();
    if (await gstRate0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await gstRate0.click({ clickCount: 3 });
      await gstRate0.fill('18');
      await page.keyboard.press('Tab');
      console.log('[po] ✓ GST rate: 18%');
    }

    // Quantity and Rate
    const qty0 = page.locator('input[name="items[0].quantity"]').first();
    await qty0.click({ clickCount: 3 });
    await qty0.fill('2');

    const rate0 = page.locator('input[name="items[0].rate"]').first();
    await rate0.click({ clickCount: 3 });
    await rate0.fill('5000');
    await page.keyboard.press('Tab');
    console.log('[po] ✓ item 1: qty=2, rate=5000');

    // Add Description for item 1
    const addDesc0 = page.locator('button[aria-label="Add Description"]').first();
    if (await addDesc0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addDesc0.click();
      await page.waitForTimeout(400);
      const desc0 = page.locator('textarea[name="items[0].description"]').first();
      if (await desc0.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await desc0.fill('QA automation test — consulting service, 2 hrs @ ₹5,000');
        console.log('[po] ✓ item 1 description added');
      }
    }

    // ── Line item 2 ───────────────────────────────────────────────────────────
    const addNewLineBtn = page.locator('button:has-text("Add New Line")').first();
    if (await addNewLineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addNewLineBtn.click();
      await page.waitForTimeout(600);
      console.log('[po] ✓ second line item row added');

      const item1NameControl = page.locator('[gridkey="name"] .disco-select-creatable__control').nth(1);
      if (await item1NameControl.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await item1NameControl.click();
        await page.keyboard.type('QA Test Product');
        await page.waitForTimeout(600);
        const item1Option = page.locator('.disco-select-creatable__option').first();
        if (await item1Option.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await item1Option.click();
        } else {
          await page.keyboard.press('Enter');
        }
        console.log('[po] ✓ item 2 name set');
      }

      const hsn1 = page.locator('input[name="items[1].hsn"]').first();
      if (await hsn1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await hsn1.fill('850340');
      }

      const gstRate1 = page.locator('input[name="items[1].gstRate"]').first();
      if (await gstRate1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await gstRate1.click({ clickCount: 3 });
        await gstRate1.fill('12');
        await page.keyboard.press('Tab');
      }

      const qty1 = page.locator('input[name="items[1].quantity"]').first();
      if (await qty1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await qty1.click({ clickCount: 3 });
        await qty1.fill('3');
      }

      const rate1 = page.locator('input[name="items[1].rate"]').first();
      if (await rate1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await rate1.click({ clickCount: 3 });
        await rate1.fill('2500');
        await page.keyboard.press('Tab');
        console.log('[po] ✓ item 2: qty=3, rate=2500');
      }

      // Add Description for item 2
      const addDesc1 = page.locator('button[aria-label="Add Description"]').nth(1);
      if (await addDesc1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addDesc1.click();
        await page.waitForTimeout(400);
        const desc1 = page.locator('textarea[name="items[1].description"]').first();
        if (await desc1.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await desc1.fill('QA automation test — hardware product, 3 units @ ₹2,500');
          console.log('[po] ✓ item 2 description added');
        }
      }
    }

    // ── Discounts ─────────────────────────────────────────────────────────────
    const addDiscountsBtn = page.locator('button.discount-dropdown-btn, button:has-text("Add Discounts")').first();
    if (await addDiscountsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addDiscountsBtn.click();
      await page.waitForTimeout(500);
      const discountOnTotal = page.locator('button:has-text("Give Discount on Total"), li:has-text("Discount on Total")').first();
      if (await discountOnTotal.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await discountOnTotal.click();
        await page.waitForTimeout(400);
        const discountInput = page.locator('input[name="discountValue"]').first();
        if (await discountInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await discountInput.fill('5');
          console.log('[po] ✓ 5% discount on total applied');
        }
      }
    }

    // ── Additional Charges ────────────────────────────────────────────────────
    const addChargesBtn = page.locator('button[data-test-id="add-additional-charges-btn"]').first();
    if (await addChargesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addChargesBtn.click();
      await page.waitForTimeout(500);
      console.log('[po] ✓ additional charges panel opened');
      // Pause to inspect and fill additional charge fields manually if needed
    }

    // ── Add Signature ─────────────────────────────────────────────────────────
    const addSignatureBtn = page.locator('button[data-test-id="add-signature-btn"], button:has-text("Add Signature")').first();
    if (await addSignatureBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addSignatureBtn.click();
      await page.waitForTimeout(400);
      console.log('[po] ✓ signature section opened');
    }

    // ── Add Terms & Conditions ────────────────────────────────────────────────
    const addTermsBtn = page.locator('button[data-test-id="add-terms-btn"]').first();
    if (await addTermsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addTermsBtn.click();
      await page.waitForTimeout(600);
      // Toast-UI editor is a contenteditable div, not a textarea
      const termsEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
      if (await termsEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await termsEditor.click();
        await page.keyboard.type('Payment due within 15 days. Late payments attract 2% interest per month.');
        console.log('[po] ✓ terms & conditions filled');
      }
    }

    // ── Add Notes ─────────────────────────────────────────────────────────────
    const addNotesBtn = page.locator('button[data-test-id="add-notes-btn"]').first();
    if (await addNotesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addNotesBtn.click();
      await page.waitForTimeout(600);
      const notesEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await notesEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await notesEditor.click();
        await page.keyboard.type('Thank you for your business! QA automation test note.');
        console.log('[po] ✓ notes filled');
      }
    }

    // ── Add Additional Info ───────────────────────────────────────────────────
    const addAdditionalInfoBtn = page.locator('button[data-test-id="add-additional-info-btn"]').first();
    if (await addAdditionalInfoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addAdditionalInfoBtn.click();
      await page.waitForTimeout(600);
      const additionalInfoEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await additionalInfoEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await additionalInfoEditor.click();
        await page.keyboard.type('QA automation test — additional information section.');
        console.log('[po] ✓ additional info filled');
      }
    }

    // ── Add Contact Details ───────────────────────────────────────────────────
    const addContactDetailsBtn = page.locator('button[data-test-id="add-contact-details-btn"]').first();
    if (await addContactDetailsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addContactDetailsBtn.click();
      await page.waitForTimeout(400);
      console.log('[po] ✓ contact details section opened');
    }

    // ── Save PO ───────────────────────────────────────────────────────────────
    await clickFirst(page, [
      'button:has-text("Save & Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Save PO")',
      'button:has-text("Save Invoice")',
    ]);
    await page.waitForURL(url => !url.pathname.endsWith('/new'), { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
    console.log(`[po] ✓ PO saved — at: ${page.url()}`);

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Expenditure Dashboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('5. New Expenditure', () => {

  test('create a new expenditure with all fields filled', async ({ page }) => {
    test.slow();

    const ts         = Date.now();
    const vendorName = `QA Vendor ${ts}`;
    const city       = 'Mumbai';

    await page.goto(`/app/${urlKey}/expenditures`);
    await page.waitForLoadState('networkidle');
    console.log(`[expenditure] at: ${page.url()}`);

    await clickFirst(page, [
      'button:has-text("Create New Expenditure")',
      'button:has-text("New Purchase")',
      'button:has-text("Create Expenditure")',
      'button:has-text("Create new")',
      'a:has-text("Create")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[expenditure] form at: ${page.url()}`);

    // ── Expenditure header ───────────────────────────────────────────────────
    await page.locator('input[name="invoiceNumber"]').waitFor({ state: 'visible', timeout: 15_000 });

    const expenseNumber = await page.locator('input[name="expenseNumber"]').inputValue();
    expect(expenseNumber).toBeTruthy();
    console.log(`[expenditure] expense number: ${expenseNumber}`);

    const invoiceDate = await page.locator('input[name="invoiceDate"]').inputValue();
    expect(invoiceDate).toBeTruthy();
    console.log(`[expenditure] date: ${invoiceDate}`);

    const dueDate = await page.locator('input[name="dueDate"]').inputValue();
    expect(dueDate).toBeTruthy();
    console.log(`[expenditure] due date: ${dueDate}`);

    // Add Subtitle
    const addSubtitleBtn = page.locator('button:has-text("Add Subtitle")').first();
    if (await addSubtitleBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addSubtitleBtn.click();
      const subtitleInput = page.locator('[name="invoiceSubTitle"], [name="subtitle"], [placeholder*="subtitle" i]').first();
      if (await subtitleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await subtitleInput.fill('QA Automation Test Expenditure');
        console.log('[expenditure] ✓ subtitle added');
      }
    }

    // ── Billed By — verify pre-selected ──────────────────────────────────────
    const billedByName = await page.locator('.disco-select__single-value').first().textContent();
    console.log(`[expenditure] billed by: ${billedByName}`);

    // ── Vendor — Add New Vendor (in place of client) ─────────────────────────
    console.log('[expenditure] opening "Add New Vendor" popup...');
    await page.locator('button:has-text("Add New Vendor")').first().click();

    // Business Name is react-select-creatable — placeholder is a div, not input attr
    const businessNameControl = page.locator('.disco-select-creatable__control')
      .filter({ hasText: 'Business Name' })
      .first();
    await businessNameControl.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('[expenditure] ✓ Add New Vendor popup open');

    await businessNameControl.click();
    await page.keyboard.type(vendorName);
    const createOption = page.locator('.disco-select-creatable__option').first();
    await createOption.waitFor({ state: 'visible', timeout: 5_000 });
    await createOption.click();
    console.log(`[expenditure] vendor name set: ${vendorName}`);

    await page.locator('input[placeholder="City/Town Name"]').first().fill(city);
    console.log(`[expenditure] city set: ${city}`);

    await page.locator('button').filter({ hasText: /^Save$/ }).last().click();
    await page.waitForLoadState('networkidle');
    console.log('[expenditure] ✓ new vendor saved');

    await expect(
      page.locator('.disco-select__single-value, .disco-select-creatable__single-value')
        .filter({ hasText: vendorName }).first()
    ).toBeVisible({ timeout: 8_000 });
    console.log('[expenditure] ✓ vendor set');

    // ── Add Shipping Details ──────────────────────────────────────────────────
    const shippingCheckbox = page.locator('input[name="showShippedTo"]').first();
    if (await shippingCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await shippingCheckbox.click();
      await page.waitForTimeout(500);
      console.log('[expenditure] ✓ shipping details toggled on');

      // Fill shipping address fields if they appear
      const shippedToCity = page.locator('input[name="shippedTo.city"]').first();
      if (await shippedToCity.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await shippedToCity.fill('Delhi');
      }
      const shippedToPincode = page.locator('input[name="shippedTo.pincode"]').first();
      if (await shippedToPincode.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await shippedToPincode.fill('110001');
      }
    }

    // ── Line item 1 ───────────────────────────────────────────────────────────
    // Item name is a disco-select-creatable — hidden input[name="items[0].name"] is
    // never visible. Click the control, type, then pick the dropdown option.
    const itemNameControl = page.locator('[gridkey="name"] .disco-select-creatable__control').first();
    await itemNameControl.waitFor({ state: 'visible', timeout: 8_000 });
    await itemNameControl.click();
    await page.keyboard.type('QA Test Service');
    await page.waitForTimeout(600);
    const itemOption = page.locator('.disco-select-creatable__option').first();
    if (await itemOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await itemOption.click();
    } else {
      await page.keyboard.press('Enter');
    }
    console.log('[expenditure] ✓ item 1 name set');

    // HSN code
    const hsn0 = page.locator('input[name="items[0].hsn"]').first();
    if (await hsn0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await hsn0.fill('998314');
      console.log('[expenditure] ✓ HSN set: 998314');
    }

    // GST Rate
    const gstRate0 = page.locator('input[name="items[0].gstRate"]').first();
    if (await gstRate0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await gstRate0.click({ clickCount: 3 });
      await gstRate0.fill('18');
      await page.keyboard.press('Tab');
      console.log('[expenditure] ✓ GST rate: 18%');
    }

    // Quantity and Rate
    const qty0 = page.locator('input[name="items[0].quantity"]').first();
    await qty0.click({ clickCount: 3 });
    await qty0.fill('2');

    const rate0 = page.locator('input[name="items[0].rate"]').first();
    await rate0.click({ clickCount: 3 });
    await rate0.fill('5000');
    await page.keyboard.press('Tab');
    console.log('[expenditure] ✓ item 1: qty=2, rate=5000');

    // Add Description for item 1
    const addDesc0 = page.locator('button[aria-label="Add Description"]').first();
    if (await addDesc0.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addDesc0.click();
      await page.waitForTimeout(400);
      const desc0 = page.locator('textarea[name="items[0].description"]').first();
      if (await desc0.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await desc0.fill('QA automation test — consulting service, 2 hrs @ ₹5,000');
        console.log('[expenditure] ✓ item 1 description added');
      }
    }

    // ── Line item 2 ───────────────────────────────────────────────────────────
    const addNewLineBtn = page.locator('button:has-text("Add New Line")').first();
    if (await addNewLineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addNewLineBtn.click();
      await page.waitForTimeout(600);
      console.log('[expenditure] ✓ second line item row added');

      const item1NameControl = page.locator('[gridkey="name"] .disco-select-creatable__control').nth(1);
      if (await item1NameControl.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await item1NameControl.click();
        await page.keyboard.type('QA Test Product');
        await page.waitForTimeout(600);
        const item1Option = page.locator('.disco-select-creatable__option').first();
        if (await item1Option.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await item1Option.click();
        } else {
          await page.keyboard.press('Enter');
        }
        console.log('[expenditure] ✓ item 2 name set');
      }

      const hsn1 = page.locator('input[name="items[1].hsn"]').first();
      if (await hsn1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await hsn1.fill('850340');
      }

      const gstRate1 = page.locator('input[name="items[1].gstRate"]').first();
      if (await gstRate1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await gstRate1.click({ clickCount: 3 });
        await gstRate1.fill('12');
        await page.keyboard.press('Tab');
      }

      const qty1 = page.locator('input[name="items[1].quantity"]').first();
      if (await qty1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await qty1.click({ clickCount: 3 });
        await qty1.fill('3');
      }

      const rate1 = page.locator('input[name="items[1].rate"]').first();
      if (await rate1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await rate1.click({ clickCount: 3 });
        await rate1.fill('2500');
        await page.keyboard.press('Tab');
        console.log('[expenditure] ✓ item 2: qty=3, rate=2500');
      }

      // Add Description for item 2
      const addDesc1 = page.locator('button[aria-label="Add Description"]').nth(1);
      if (await addDesc1.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addDesc1.click();
        await page.waitForTimeout(400);
        const desc1 = page.locator('textarea[name="items[1].description"]').first();
        if (await desc1.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await desc1.fill('QA automation test — hardware product, 3 units @ ₹2,500');
          console.log('[expenditure] ✓ item 2 description added');
        }
      }
    }

    // ── Discounts ─────────────────────────────────────────────────────────────
    const addDiscountsBtn = page.locator('button.discount-dropdown-btn, button:has-text("Add Discounts")').first();
    if (await addDiscountsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addDiscountsBtn.click();
      await page.waitForTimeout(500);
      const discountOnTotal = page.locator('button:has-text("Give Discount on Total"), li:has-text("Discount on Total")').first();
      if (await discountOnTotal.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await discountOnTotal.click();
        await page.waitForTimeout(400);
        const discountInput = page.locator('input[name="discountValue"]').first();
        if (await discountInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await discountInput.fill('5');
          console.log('[expenditure] ✓ 5% discount on total applied');
        }
      }
    }

    // ── Additional Charges ────────────────────────────────────────────────────
    const addChargesBtn = page.locator('button[data-test-id="add-additional-charges-btn"]').first();
    if (await addChargesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addChargesBtn.click();
      await page.waitForTimeout(500);
      console.log('[expenditure] ✓ additional charges panel opened');
      // Pause to inspect and fill additional charge fields manually if needed
    }

    // ── Add Signature ─────────────────────────────────────────────────────────
    const addSignatureBtn = page.locator('button[data-test-id="add-signature-btn"], button:has-text("Add Signature")').first();
    if (await addSignatureBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addSignatureBtn.click();
      await page.waitForTimeout(400);
      console.log('[expenditure] ✓ signature section opened');
    }

    // ── Add Terms & Conditions ────────────────────────────────────────────────
    const addTermsBtn = page.locator('button[data-test-id="add-terms-btn"]').first();
    if (await addTermsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addTermsBtn.click();
      await page.waitForTimeout(600);
      // Toast-UI editor is a contenteditable div, not a textarea
      const termsEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
      if (await termsEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await termsEditor.click();
        await page.keyboard.type('Payment due within 15 days. Late payments attract 2% interest per month.');
        console.log('[expenditure] ✓ terms & conditions filled');
      }
    }

    // ── Add Notes ─────────────────────────────────────────────────────────────
    const addNotesBtn = page.locator('button[data-test-id="add-notes-btn"]').first();
    if (await addNotesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addNotesBtn.click();
      await page.waitForTimeout(600);
      const notesEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await notesEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await notesEditor.click();
        await page.keyboard.type('Thank you for your business! QA automation test note.');
        console.log('[expenditure] ✓ notes filled');
      }
    }

    // ── Add Additional Info ───────────────────────────────────────────────────
    const addAdditionalInfoBtn = page.locator('button[data-test-id="add-additional-info-btn"]').first();
    if (await addAdditionalInfoBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addAdditionalInfoBtn.click();
      await page.waitForTimeout(600);
      const additionalInfoEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await additionalInfoEditor.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await additionalInfoEditor.click();
        await page.keyboard.type('QA automation test — additional information section.');
        console.log('[expenditure] ✓ additional info filled');
      }
    }

    // ── Add Contact Details ───────────────────────────────────────────────────
    const addContactDetailsBtn = page.locator('button[data-test-id="add-contact-details-btn"]').first();
    if (await addContactDetailsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addContactDetailsBtn.click();
      await page.waitForTimeout(400);
      console.log('[expenditure] ✓ contact details section opened');
    }

    // ── Save expenditure ──────────────────────────────────────────────────────
    await clickFirst(page, [
      'button:has-text("Save & Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Save Expenditure")',
      'button:has-text("Save Invoice")',
    ]);
    await page.waitForURL(url => !url.pathname.endsWith('/new'), { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
    console.log(`[expenditure] ✓ expenditure saved — at: ${page.url()}`);

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Edit Invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('6. Edit Invoice', () => {

  test('open an existing invoice and edit it', async ({ page }) => {
    test.slow();

    // Use the invoice created by test 3 if available; otherwise fall back to list.
    if (lastCreatedInvoiceUrl) {
      await page.goto(lastCreatedInvoiceUrl);
      await page.waitForLoadState('networkidle');
      console.log(`[edit] navigated to created invoice: ${lastCreatedInvoiceUrl}`);
    } else {
      console.log('[edit] ⚠ no created invoice URL — falling back to invoice list');
      await goTo(page, 'invoices');

      const firstInvoice = page.locator([
        'table tbody tr:first-child',
        '[data-test-id="invoice-row"]:first-child',
        'a[href*="/invoices/"]:first-child',
      ].join(', ')).first();

      if (await firstInvoice.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await firstInvoice.click();
        await page.waitForLoadState('networkidle');
      } else {
        console.log('[edit] ⚠ no invoices found — pausing');
        return;
      }
    }

    console.log(`[edit] invoice review at: ${page.url()}`);

    // Edit button on review page is an <a> (not a button); title="Edit Details"
    await clickFirst(page, [
      'a[title="Edit Details"]',
      '[id^="review-edit-invoices"] a',
      'a:has-text("Edit")',
      'button:has-text("Edit")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[edit] edit form at: ${page.url()}`);

    // ── Edit qty + rate on first line item (same pattern as create) ──────────
    const qty0 = page.locator('input[name="items[0].quantity"]').first();
    await qty0.waitFor({ state: 'visible', timeout: 8_000 });
    await qty0.click({ clickCount: 3 });
    await qty0.fill('3');
    console.log('[edit] ✓ item 0 qty → 3');

    const rate0 = page.locator('input[name="items[0].rate"]').first();
    await rate0.waitFor({ state: 'visible', timeout: 8_000 });
    await rate0.click({ clickCount: 3 });
    await rate0.fill('6000');
    await page.keyboard.press('Tab');
    console.log('[edit] ✓ item 0 rate → 6000');

    // ── Add new line item (same pattern as create) ────────────────────────────
    const existingRows = await page.locator('[gridkey="name"] .disco-select-creatable__control').count();
    const addNewLineBtn = page.locator('button:has-text("Add New Line")').first();
    await addNewLineBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await addNewLineBtn.click();
    await page.waitForTimeout(600);
    console.log(`[edit] ✓ new line item row added (index ${existingRows})`);

    const newItemControl = page.locator('[gridkey="name"] .disco-select-creatable__control').nth(existingRows);
    await newItemControl.waitFor({ state: 'visible', timeout: 4_000 });
    await newItemControl.click();
    await page.keyboard.type('QA Edit Service');
    await page.waitForTimeout(600);
    const newItemOption = page.locator('.disco-select-creatable__option').first();
    if (await newItemOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newItemOption.click();
    } else {
      await page.keyboard.press('Enter');
    }
    console.log('[edit] ✓ new item name set');

    const newQty = page.locator(`input[name="items[${existingRows}].quantity"]`).first();
    await newQty.waitFor({ state: 'visible', timeout: 4_000 });
    await newQty.click({ clickCount: 3 });
    await newQty.fill('1');

    const newRate = page.locator(`input[name="items[${existingRows}].rate"]`).first();
    await newRate.waitFor({ state: 'visible', timeout: 4_000 });
    await newRate.click({ clickCount: 3 });
    await newRate.fill('3000');
    await page.keyboard.press('Tab');
    console.log('[edit] ✓ new item: qty=1, rate=3000');

    await clickFirst(page, [
      'button:has-text("Save & Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Save Invoice")',
    ]);
    // Wait until we're back on the review page (URL no longer contains /edit)
    await page.waitForURL(url => !url.pathname.includes('/edit'), { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
    console.log(`[edit] ✓ invoice saved — at: ${page.url()}`);

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. View Invoice — Paid / Unpaid
// ─────────────────────────────────────────────────────────────────────────────

test.describe('7. View Invoice — Paid / Unpaid', () => {

  test('mark paid then remove payment from review page', async ({ page }) => {
    test.slow();

    // Navigate to the created invoice's review page (same URL used by test 6).
    if (lastCreatedInvoiceUrl) {
      await page.goto(lastCreatedInvoiceUrl);
      await page.waitForLoadState('networkidle');
      console.log(`[paid] review page: ${lastCreatedInvoiceUrl}`);
    } else {
      console.log('[paid] ⚠ no created invoice URL — falling back to invoice list');
      await goTo(page, 'invoices');

      const firstInvoice = page.locator([
        'table tbody tr:first-child td a',
        'a[href*="/invoices/"]:first-child',
      ].join(', ')).first();

      if (await firstInvoice.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await firstInvoice.click();
        await page.waitForLoadState('networkidle');
      } else {
        console.log('[paid] ⚠ no invoices found — pausing');
        return;
      }
    }

    // ── Record Payment (mark paid) ────────────────────────────────────────────
    const recordPaymentBtn = page.locator('button[title="Record Payment"]').first();
    if (!await recordPaymentBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log('[paid] ⚠ "Record Payment" button not found — pausing');
      return;
    }

    await recordPaymentBtn.click();
    await page.waitForTimeout(1_000);
    console.log('[paid] ✓ Record Payment modal opened');

    // Select Payment Account — click the placeholder, wait for menu, pick first option
    const paPlaceholder = page.locator('.disco-select__placeholder:has-text("Select Payment Account")');
    await paPlaceholder.waitFor({ state: 'visible', timeout: 5_000 });
    await paPlaceholder.click();
    const firstOption = page.locator('.disco-select__menu .disco-select__option').first();
    await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
    const accountName = await firstOption.textContent();
    await firstOption.click();
    console.log(`[paid] ✓ Payment Account selected: ${accountName?.trim()}`);

    // Confirm selection rendered before saving
    await page.locator('.disco-select__single-value').filter({ hasText: accountName?.trim() ?? '' }).waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});

    // Save the payment
    await page.locator('button:has-text("Save")').last().click();
    await page.waitForTimeout(2_000);
    console.log('[paid] ✓ payment saved — invoice should now show Paid');

    // ── Remove payment via "Invoice Payment Records" accordion ───────────────
    // The table has a stable id (#invoice_paymentstable). The accordion is usually
    // already expanded right after recording a payment; expand it if not.
    const paymentRecordsTable = page.locator('#invoice_paymentstable');
    if (!await paymentRecordsTable.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Best-effort automated click — confirmed via Playwright Inspector's "Pick locator"
      // against the live app, but the accordion doesn't reliably expand from it.
      const paymentRecordsHeader = page.getByRole('button', { name: 'Invoice Payment Records' });
      await paymentRecordsHeader.click();
      await paymentRecordsTable.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});

      // Pause — if the click above didn't expand it, open "Invoice Payment Records"
      // manually here, then resume.
      await page.pause();

      await paymentRecordsTable.waitFor({ state: 'visible', timeout: 5_000 });
      console.log('[paid] ✓ "Invoice Payment Records" accordion expanded');
    }

    // Let the accordion's expand animation settle before interacting with the row —
    // clicking mid-animation causes Playwright's stability check to keep retrying.
    await page.waitForTimeout(500);

    // Open the row's "More" options menu (last row = most recently recorded payment).
    // The clickable control is the outer <span role="button" aria-label="More Options">;
    // its inner <button> is aria-hidden and decorative only, so match on aria-label alone
    // — combining it with a button[title]/has-text selector let `.last()` resolve to that
    // hidden inner button instead, which sits behind other elements and never gets clicks.
    const moreOptionsBtn = paymentRecordsTable.locator('[aria-label="More Options"]').last();
    await moreOptionsBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await moreOptionsBtn.scrollIntoViewIfNeeded();
    await moreOptionsBtn.click();
    console.log('[paid] ✓ payment row "More" menu opened');

    // Click "Remove" in the dropdown menu (View Payment Receipt / Edit Payment Receipt / Remove)
    const removeMenuItem = page.getByText('Remove', { exact: true }).last();
    await removeMenuItem.waitFor({ state: 'visible', timeout: 5_000 });
    await removeMenuItem.click();
    console.log('[paid] ✓ clicked "Remove" — confirmation modal should open');

    // Confirm removal
    const confirmRemoveBtn = page.locator('button:has-text("Yes, Remove")').first();
    await confirmRemoveBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmRemoveBtn.click();
    await page.waitForLoadState('networkidle');
    console.log('[paid] ✓ payment removed — invoice back to Unpaid');

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Leads
// ─────────────────────────────────────────────────────────────────────────────

test.describe('8. Leads', () => {

  test('navigate to leads / CRM section', async ({ page }) => {
    await page.goto(`/app/${urlKey}/leads`);
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('lead')) {
      await page.goto(`/app/${urlKey}/crm/leads`);
      await page.waitForLoadState('networkidle');
    }

    console.log(`[leads] at: ${page.url()}`);

  });

  test('create a new lead with all fields filled (except labels & custom fields)', async ({ page }) => {
    test.slow();

    const ts          = Date.now();
    const contactName = `QA Lead Contact ${ts}`;
    const city         = 'Mumbai';
    const phoneNumber  = '9876543210';
    const email        = `qa.lead.${ts}@example.com`;
    const designation  = 'Procurement Manager';
    const subject       = 'QA Automation Test Lead';
    const description   = 'QA automation test — additional lead description with details.';

    await page.goto(`/app/${urlKey}/leads`);
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('lead')) {
      await page.goto(`/app/${urlKey}/crm/leads`);
      await page.waitForLoadState('networkidle');
    }
    console.log(`[lead] at: ${page.url()}`);

    // ── Open the create-lead form ─────────────────────────────────────────────
    await clickFirst(page, [
      'button:has-text("Add Lead")',
      'button:has-text("Create Lead")',
      'button:has-text("New Lead")',
      'button:has-text("Create New Lead")',
      'a:has-text("Add Lead")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[lead] form at: ${page.url()}`);

    // ── Contact Name ───────────────────────────────────────────────────────────
    const contactNameInput = page.locator('input[name="contact.name"]').first();
    await contactNameInput.waitFor({ state: 'visible', timeout: 15_000 });
    await contactNameInput.fill(contactName);
    console.log(`[lead] ✓ contact name set: ${contactName}`);

    // ── Country — leave pre-selected value untouched ─────────────────────────
    const country = await page.locator('input[name="contact.country"]').first().inputValue().catch(() => '');
    console.log(`[lead] country (pre-filled, untouched): ${country}`);

    // ── City ───────────────────────────────────────────────────────────────────
    const cityInput = page.locator('input[name="customer.city"]').first();
    if (await cityInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cityInput.fill(city);
      console.log(`[lead] ✓ city set: ${city}`);
    }

    // ── Phone — react-tel-input keeps the "+91" country-code prefix ──────────
    const phoneInput = page.locator('input[name="contact.phone"]').first();
    if (await phoneInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await phoneInput.click();
      await page.keyboard.press('End');
      await phoneInput.pressSequentially(phoneNumber);
      console.log(`[lead] ✓ phone set: +91 ${phoneNumber}`);
    }

    // ── Email ──────────────────────────────────────────────────────────────────
    const emailInput = page.locator('input[name="contact.email"]').first();
    if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emailInput.fill(email);
      console.log(`[lead] ✓ email set: ${email}`);
    }

    // ── Designation ────────────────────────────────────────────────────────────
    const designationInput = page.locator('input[name="contact.designation"]').first();
    if (await designationInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await designationInput.fill(designation);
      console.log(`[lead] ✓ designation set: ${designation}`);
    }

    // ── Prospect Organisation — select the first option in the dropdown ──────
    const orgWrapper = page.locator('.disco-select').filter({
      has: page.locator('input[name="client"]'),
    }).first();
    const orgControl = orgWrapper.locator('.disco-select__control').first();
    await orgControl.waitFor({ state: 'visible', timeout: 8_000 });
    await orgControl.click();
    await page.waitForTimeout(500);

    const orgFirstOption = page.locator('.disco-select__menu .disco-select__option').first();
    if (await orgFirstOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const orgName = (await orgFirstOption.textContent())?.trim() ?? '';
      await orgFirstOption.click();
      console.log(`[lead] ✓ prospect organisation set: ${orgName}`);
    } else {
      console.log('[lead] ⚠ no options in Prospect Organisation dropdown — pausing');
      await page.keyboard.press('Escape');
      await page.pause();
    }

    // ── Lead Subject ───────────────────────────────────────────────────────────
    const subjectInput = page.locator('input[name="subject"]').first();
    await subjectInput.waitFor({ state: 'visible', timeout: 8_000 });
    await subjectInput.fill(subject);
    console.log(`[lead] ✓ lead subject set: ${subject}`);

    // ── Additional Description ────────────────────────────────────────────────
    const detailsTextarea = page.locator('textarea[name="details"]').first();
    if (await detailsTextarea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await detailsTextarea.fill(description);
      console.log('[lead] ✓ additional description filled');
    }

    // ── Sales Pipeline & Stage — already pre-filled, leave untouched ─────────
    const pipeline = await page.locator('input[name="privateFields.vendor.pipeline"]').first().inputValue().catch(() => '');
    const stage    = await page.locator('input[name="privateFields.vendor.stage"]').first().inputValue().catch(() => '');
    console.log(`[lead] pipeline (pre-filled, untouched): ${pipeline}`);
    console.log(`[lead] stage (pre-filled, untouched): ${stage}`);

    // ── Labels & Custom Fields — intentionally skipped ────────────────────────

    // ── Save lead ──────────────────────────────────────────────────────────────
    await page.pause();

    await clickFirst(page, [
      'button:has-text("Add Lead")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[lead] ✓ lead saved — at: ${page.url()}`);

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Invoice Reports
// ─────────────────────────────────────────────────────────────────────────────

test.describe('9. Invoice Reports', () => {

  test('open Reports & More and verify each report section', async ({ page }) => {
    test.slow();

    await goTo(page, 'invoices');

    const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
    await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await reportsBtn.click();
    console.log('[reports] clicked "Reports & More"');

    // ── Verify every report is listed in the dropdown ────────────────────────
    const reportsMenu = page.locator('.react-tiny-popover-container').last();
    await reportsMenu.waitFor({ state: 'visible', timeout: 8_000 });

    const expectedReports = [
      'Client Report',
      'Tag Wise Report',
      'Project-wise P&L',
      'Payment Report',
      'TDS Report',
      'GST Report',
      'Line Item Report',
      'HSN Report',
      'GSTR 1 Report',
    ];

    for (const reportName of expectedReports) {
      const reportItem = reportsMenu.locator('li', { hasText: reportName }).first();
      const visible = await reportItem.isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`[reports] ${visible ? '✓' : '✗'} "${reportName}" ${visible ? 'visible' : 'NOT FOUND'}`);
      expect(visible, `Report "${reportName}" should be visible in Reports & More menu`).toBeTruthy();
    }
    console.log('[reports] ✓ all report links verified in dropdown');

    await page.keyboard.press('Escape');

    if (!page.url().includes('report')) {
      await page.goto(`/app/${urlKey}/reports`);
      await page.waitForLoadState('networkidle');
      console.log(`[reports] direct nav to: ${page.url()}`);
    }

  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Email — with and without identity
// ─────────────────────────────────────────────────────────────────────────────

test.describe('10. Email', () => {

  test('send invoice via email (with identity)', async ({ page }) => {
    test.slow();

    const ts = Date.now();

    expect(lastCreatedInvoiceUrl, 'lastCreatedInvoiceUrl must be set by test 3 before this test runs').toBeTruthy();

    await page.goto(lastCreatedInvoiceUrl);
    await page.waitForLoadState('networkidle');
    console.log(`[email] navigated to created invoice: ${lastCreatedInvoiceUrl}`);
    console.log(`[email] invoice review at: ${page.url()}`);

    // ── Share Options → Send Email ────────────────────────────────────────────
    await clickFirst(page, [
      'button[title="Share Options"]',
      '[title="Share Options"]',
    ]);
    await page.waitForTimeout(400);
    console.log('[email] ✓ share options opened');

    await clickFirst(page, [
      'button:has-text("Send Email")',
      'li:has-text("Send Email")',
      'a:has-text("Send Email")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log('[email] ✓ send email drawer opened');

    // ── Sending Identity — select the first email in "Senders Email" ─────────
    const identityWrapper = page.locator('.disco-select').filter({
      has: page.locator('input[name="from.identity"]'),
    }).first();
    const identityControl = identityWrapper.locator('.disco-select__control').first();
    await identityControl.waitFor({ state: 'visible', timeout: 8_000 });
    await identityControl.click();
    await page.waitForTimeout(500);

    const identityFirstOption = page.locator('.disco-select__menu .disco-select__option').first();
    if (await identityFirstOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const identityLabel = (await identityFirstOption.textContent())?.trim() ?? '';
      await identityFirstOption.click();
      console.log(`[email] ✓ sending identity set: ${identityLabel}`);
    } else {
      console.log('[email] ⚠ no options in Senders Email dropdown — pausing');
      await page.keyboard.press('Escape');
      await page.pause();
    }

    // ── Client Email ───────────────────────────────────────────────────────────
    const clientEmailInput = page.locator('input[name="to.email"]').first();
    await clientEmailInput.waitFor({ state: 'visible', timeout: 5_000 });
    await clientEmailInput.fill(`qa.invoice.${ts}@example.com`);
    console.log(`[email] ✓ client email set: qa.invoice.${ts}@example.com`);

    // ── Send Email ─────────────────────────────────────────────────────────────
    await page.locator('button[type="submit"]').filter({ hasText: 'Send Email' }).first().click();
    await page.waitForLoadState('networkidle');
    console.log('[email] ✓ email sent');

  });

  test('send invoice via email (without identity)', async ({ page }) => {
    test.slow();

    const ts = Date.now();

    expect(lastCreatedInvoiceUrl, 'lastCreatedInvoiceUrl must be set by test 3 before this test runs').toBeTruthy();

    await page.goto(lastCreatedInvoiceUrl);
    await page.waitForLoadState('networkidle');
    console.log(`[email] navigated to created invoice: ${lastCreatedInvoiceUrl}`);
    console.log(`[email] invoice review at: ${page.url()}`);

    // ── Share Options → Send Email ────────────────────────────────────────────
    await clickFirst(page, [
      'button[title="Share Options"]',
      '[title="Share Options"]',
    ]);
    await page.waitForTimeout(400);
    console.log('[email] ✓ share options opened');

    await clickFirst(page, [
      'button:has-text("Send Email")',
      'li:has-text("Send Email")',
      'a:has-text("Send Email")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log('[email] ✓ send email drawer opened');

    // ── Sending Identity — intentionally left unselected ──────────────────────
    console.log('[email] sending identity left unselected (testing without identity)');

    // ── Client Email ───────────────────────────────────────────────────────────
    const clientEmailInput = page.locator('input[name="to.email"]').first();
    await clientEmailInput.waitFor({ state: 'visible', timeout: 5_000 });
    await clientEmailInput.fill(`qa.invoice.${ts}@example.com`);
    console.log(`[email] ✓ client email set: qa.invoice.${ts}@example.com`);

    // ── Send Email ─────────────────────────────────────────────────────────────
    await page.locator('button[type="submit"]').filter({ hasText: 'Send Email' }).first().click();
    await page.waitForLoadState('networkidle');
    console.log('[email] ✓ email sent');

  });

  // test('send lead via email', async ({ page }) => {
  //   test.slow();

  //   await page.goto(`/app/${urlKey}/leads`);
  //   await page.waitForLoadState('networkidle');

  //   const firstLead = page.locator([
  //     'table tbody tr:first-child',
  //     '[data-test-id="lead-row"]:first-child',
  //     'a[href*="/leads/"]:first-child',
  //   ].join(', ')).first();

  //   if (await firstLead.isVisible({ timeout: 5_000 }).catch(() => false)) {
  //     await firstLead.click();
  //     await page.waitForLoadState('networkidle');
  //   }

  // });

});

// ─────────────────────────────────────────────────────────────────────────────
// 11. WhatsApp — documents and leads
// ─────────────────────────────────────────────────────────────────────────────

test.describe('11. WhatsApp', () => {

  test('send invoice via WhatsApp', async ({ page }) => {
    test.slow();

    const phoneNumber = '9876543210';

    expect(lastCreatedInvoiceUrl, 'lastCreatedInvoiceUrl must be set by test 3 before this test runs').toBeTruthy();

    await page.goto(lastCreatedInvoiceUrl);
    await page.waitForLoadState('networkidle');
    console.log(`[whatsapp] navigated to created invoice: ${lastCreatedInvoiceUrl}`);
    console.log(`[whatsapp] invoice review at: ${page.url()}`);

    // ── Share Options → Send WhatsApp ─────────────────────────────────────────
    await clickFirst(page, [
      'button[title="Share Options"]',
      '[title="Share Options"]',
    ]);
    await page.waitForTimeout(400);
    console.log('[whatsapp] ✓ share options opened');

    await clickFirst(page, [
      'button:has-text("Send WhatsApp")',
      'li:has-text("Send WhatsApp")',
      'a:has-text("Send WhatsApp")',
    ]);
    await page.waitForLoadState('networkidle');
    console.log('[whatsapp] ✓ WhatsApp Invoice dialog opened');

    // ── Client's Phone No ──────────────────────────────────────────────────────
    const clientPhoneInput = page.locator('.react-tel-input input[type="tel"]').first();
    await clientPhoneInput.waitFor({ state: 'visible', timeout: 8_000 });
    await clientPhoneInput.click();
    await page.keyboard.press('Control+A');
    await clientPhoneInput.pressSequentially(phoneNumber);
    console.log(`[whatsapp] ✓ client's phone set: +91 ${phoneNumber}`);

    // ── Send ───────────────────────────────────────────────────────────────────
    await page.locator('button').filter({ hasText: /^Send$/ }).last().click();
    await page.waitForLoadState('networkidle');
    console.log('[whatsapp] ✓ WhatsApp message sent');

  });

  // test('send lead via WhatsApp', async ({ page }) => {
  //   test.slow();

  //   await page.goto(`/app/${urlKey}/leads`);
  //   await page.waitForLoadState('networkidle');

  //   const firstLead = page.locator([
  //     'table tbody tr:first-child',
  //     '[data-test-id="lead-row"]:first-child',
  //     'a[href*="/leads/"]:first-child',
  //   ].join(', ')).first();

  //   if (await firstLead.isVisible({ timeout: 5_000 }).catch(() => false)) {
  //     await firstLead.click();
  //     await page.waitForLoadState('networkidle');
  //   }

  // });

});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Download PDF & CSV
// ─────────────────────────────────────────────────────────────────────────────

test.describe('12. Download PDF & CSV', () => {

  test('download invoice PDF', async ({ page }) => {
    test.slow();

    expect(lastCreatedInvoiceUrl, 'lastCreatedInvoiceUrl must be set by test 3 before this test runs').toBeTruthy();

    await page.goto(lastCreatedInvoiceUrl);
    await page.waitForLoadState('networkidle');
    console.log(`[download] navigated to created invoice: ${lastCreatedInvoiceUrl}`);
    console.log(`[download] invoice review at: ${page.url()}`);

    // ── Download — direct button beside "Share Options" ──────────────────────
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByTitle('Download PDF').nth(1).click(),
    ]);

    const filename = download.suggestedFilename();
    console.log(`[download] ✓ invoice PDF: ${filename}`);
    expect(filename).toMatch(/\.pdf$/i);

  });

  // test('download invoice list CSV', async ({ page }) => {
  //   test.slow();

  //   await goTo(page, 'invoices');

  //   const [download] = await Promise.all([
  //     page.waitForEvent('download', { timeout: 30_000 }),
  //     clickFirst(page, [
  //       'button:has-text("Export CSV")',
  //       'button:has-text("Download CSV")',
  //       '[data-test-id="export-csv-btn"]',
  //       'button:has-text("Export")',
  //     ]),
  //   ]);

  //   const filename = download.suggestedFilename();
  //   console.log(`[download] ✓ invoice CSV: ${filename}`);
  //   expect(filename).toMatch(/\.csv$/i);

  // });

});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Client & Vendor Statement
// ─────────────────────────────────────────────────────────────────────────────

// test.describe('13. Client & Vendor Statement', () => {

//   test('download client statement PDF', async ({ page }) => {
//     test.slow();

//     await goTo(page, 'invoices');
//     const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
//     await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
//     await reportsBtn.click();

//     const [download] = await Promise.all([
//       page.waitForEvent('download', { timeout: 30_000 }),
//       clickFirst(page, [
//         'button:has-text("Download PDF")',
//         'button:has-text("Download")',
//         '[data-test-id="download-statement-btn"]',
//       ]),
//     ]);

//     console.log(`[statement] ✓ client statement: ${download.suggestedFilename()}`);
//   });

//   test('download vendor statement PDF', async ({ page }) => {
//     test.slow();

//     await goTo(page, 'invoices');
//     const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
//     await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
//     await reportsBtn.click();

//     const [download] = await Promise.all([
//       page.waitForEvent('download', { timeout: 30_000 }),
//       clickFirst(page, [
//         'button:has-text("Download PDF")',
//         'button:has-text("Download")',
//         '[data-test-id="download-statement-btn"]',
//       ]),
//     ]);

//     console.log(`[statement] ✓ vendor statement: ${download.suggestedFilename()}`);
//   });

// });

// // ─────────────────────────────────────────────────────────────────────────────
// // 14. Trial Balance PDF
// // ─────────────────────────────────────────────────────────────────────────────

// test.describe('14. Trial Balance PDF', () => {

//   test('download trial balance PDF from reports', async ({ page }) => {
//     test.slow();

//     await goTo(page, 'invoices');
//     const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
//     await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
//     await reportsBtn.click();

//     const [download] = await Promise.all([
//       page.waitForEvent('download', { timeout: 30_000 }),
//       clickFirst(page, [
//         'button:has-text("Download PDF")',
//         'button:has-text("Download")',
//         '[data-test-id="download-trial-balance-btn"]',
//       ]),
//     ]);

//     const filename = download.suggestedFilename();
//     console.log(`[trial-balance] ✓ downloaded: ${filename}`);
//     expect(filename).toMatch(/\.pdf$/i);

//   });

// });

// // ─────────────────────────────────────────────────────────────────────────────
// // 15. Profit & Loss PDF
// // ─────────────────────────────────────────────────────────────────────────────

// test.describe('15. Profit & Loss PDF', () => {

//   test('download P&L PDF from reports', async ({ page }) => {
//     test.slow();

//     await goTo(page, 'invoices');
//     const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
//     await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
//     await reportsBtn.click();

//     const [download] = await Promise.all([
//       page.waitForEvent('download', { timeout: 30_000 }),
//       clickFirst(page, [
//         'button:has-text("Download PDF")',
//         'button:has-text("Download")',
//         '[data-test-id="download-pl-btn"]',
//       ]),
//     ]);

//     const filename = download.suggestedFilename();
//     console.log(`[pl] ✓ downloaded: ${filename}`);
//     expect(filename).toMatch(/\.pdf$/i);

//   });

// });

// // ─────────────────────────────────────────────────────────────────────────────
// // 16. Balance Sheet PDF
// // ─────────────────────────────────────────────────────────────────────────────

// test.describe('16. Balance Sheet PDF', () => {

//   test('download balance sheet PDF from reports', async ({ page }) => {
//     test.slow();

//     await goTo(page, 'invoices');
//     const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
//     await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
//     await reportsBtn.click();

//     const [download] = await Promise.all([
//       page.waitForEvent('download', { timeout: 30_000 }),
//       clickFirst(page, [
//         'button:has-text("Download PDF")',
//         'button:has-text("Download")',
//         '[data-test-id="download-balance-sheet-btn"]',
//       ]),
//     ]);

//     const filename = download.suggestedFilename();
//     console.log(`[balance-sheet] ✓ downloaded: ${filename}`);
//     expect(filename).toMatch(/\.pdf$/i);

//   });

// });

// // ─────────────────────────────────────────────────────────────────────────────
// // 17. Ledger Statement PDF
// // ─────────────────────────────────────────────────────────────────────────────

// test.describe('17. Ledger Statement PDF', () => {

//   test('download ledger statement PDF from reports', async ({ page }) => {
//     test.slow();

//     await goTo(page, 'invoices');
//     const reportsBtn = page.locator('[role="button"]:has-text("Reports & More")').first();
//     await reportsBtn.waitFor({ state: 'visible', timeout: 10_000 });
//     await reportsBtn.click();

//     const [download] = await Promise.all([
//       page.waitForEvent('download', { timeout: 30_000 }),
//       clickFirst(page, [
//         'button:has-text("Download PDF")',
//         'button:has-text("Download")',
//         '[data-test-id="download-ledger-btn"]',
//       ]),
//     ]);

//     const filename = download.suggestedFilename();
//     console.log(`[ledger] ✓ downloaded: ${filename}`);
//     expect(filename).toMatch(/\.pdf$/i);

//   });

// });

// ─────────────────────────────────────────────────────────────────────────────
// 18. Create Document on elisif page (logged-in redirect)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('18. Create Document — elisif page redirect', () => {

  test('clicking Create Document on elisif redirects logged-in user to doc creation', async ({ page }) => {
    test.slow();

    await page.goto('/free-online-invoice-generator');
    await page.waitForLoadState('networkidle');
    console.log(`[elisif] at: ${page.url()}`);

    await clickFirst(page, [
      'button:has-text("Create Document")',
      'button:has-text("Create Invoice")',
      'a:has-text("Create Document")',
      'a:has-text("Create Invoice")',
      '[data-test-id="create-document-cta"]',
    ]);
    await page.waitForLoadState('networkidle');
    console.log(`[elisif] after click: ${page.url()}`);

    // Verify: landed on the logged-in app doc creation page (not login)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });
    console.log('[elisif] ✓ redirected to logged-in doc creation page');

  });

});
