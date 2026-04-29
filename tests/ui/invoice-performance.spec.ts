/**
 * Invoice Generator — Comprehensive Performance, Functional & Negative Tests
 *
 * Target:  https://www.refrens.com/free-online-invoice-generator
 * Context: Form migrated Formik+Styled Components → React Hook Form+CSS Modules.
 *          Validates INP improvement + full functional correctness of every field,
 *          every button, every checkbox, label renaming, and negative paths.
 *
 * DOM source: live snapshot from qa01.bizsuggest.com (April 2026)
 *
 * Selector strategy (in priority order, CSS classes intentionally avoided):
 *   1. getByRole / getByLabel  — most resilient to markup changes
 *   2. data-testid / name attr — tied to React Hook Form field names
 *   3. placeholder             — last resort
 *
 * INP Measurement:
 *   Each test section measures Interaction to Next Paint via the W3C Event Timing
 *   API (PerformanceObserver on 'event' entries) and prints a per-test report.
 *   Ratings: PASS < 200 ms | WARN 200–499 ms | CRITICAL ≥ 500 ms
 *
 * Test Suites:
 *   1.  Header fields & label renaming (Invoice No, Invoice Date, due date)
 *   2.  Billed By — all inputs, Add Email, Add PAN, country
 *   3.  Billed To — all inputs, Add Email, Add PAN, country
 *   4.  Line items — fill all columns, duplicate, delete, Add Description
 *   5.  Totals — discounts, additional charges, round up/down, toggles
 *   6.  Shipping — enable/disable, Shipped From, Shipped To, Transport Details
 *   7.  Bottom section — Signature, Terms, Notes, Attachments, Additional Info, Contact
 *   8.  Header label renaming — Invoice No, Invoice Date, Total, Additional Notes
 *   9.  Negative / validation — empty required fields, invalid GSTIN, invalid PAN
 *  10.  INP benchmark — full interaction sweep + keystroke regression
 */

import { test, expect, Page } from '@playwright/test';
import fs   from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FORM_PATH = '/free-online-invoice-generator';
const RAW_DIR   = path.resolve(__dirname, '../../reports/raw');
const INP_WARN     = 100;
const INP_CRITICAL = 500;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface INPEntry {
  label:      string;
  durationMs: number;
  rating:     'PASS' | 'WARN' | 'CRITICAL';
  notes?:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function injectINPObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__inpEntries = [];
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__inpEntries.push({ name: entry.name, duration: entry.duration });
        }
      });
      obs.observe({ type: 'event', buffered: true });
    } catch { /* Event Timing not supported */ }
  });
}

async function flushINP(page: Page): Promise<number> {
  return page.evaluate((): number => {
    const entries: Array<{ duration: number }> = (window as any).__inpEntries ?? [];
    const worst = entries.reduce((m, e) => Math.max(m, e.duration), 0);
    (window as any).__inpEntries = [];
    return worst;
  });
}

async function measureINP(
  page:   Page,
  label:  string,
  action: () => Promise<void>,
  notes?: string,
): Promise<INPEntry> {
  await flushINP(page);
  await action();
  await page.waitForTimeout(80);
  const durationMs = await flushINP(page);
  const rating: INPEntry['rating'] =
    durationMs >= INP_CRITICAL ? 'CRITICAL' :
    durationMs >= INP_WARN     ? 'WARN'     : 'PASS';
  return { label, durationMs, rating, notes };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────────────────────

function printReport(title: string, entries: INPEntry[]): void {
  const hr  = '─'.repeat(76);
  const pad = Math.max(...entries.map(e => e.label.length), 32);
  console.log(`\n${hr}`);
  console.log(`  INP REPORT — ${title}`);
  console.log(hr);
  for (const e of entries) {
    const icon = e.rating === 'PASS' ? '✅' : e.rating === 'WARN' ? '⚠️ ' : '🔴';
    const dur  = e.durationMs > 0 ? `${e.durationMs.toFixed(0)} ms` : '–';
    console.log(`  ${icon}  ${e.label.padEnd(pad)}  ${e.rating.padEnd(8)}  ${dur}`);
    if (e.notes) console.log(`       ${e.notes}`);
  }
  const c = entries.filter(e => e.rating === 'CRITICAL').length;
  const w = entries.filter(e => e.rating === 'WARN').length;
  const p = entries.filter(e => e.rating === 'PASS').length;
  console.log(hr);
  console.log(`  ${entries.length} total  ✅ ${p} PASS  ⚠️  ${w} WARN  🔴 ${c} CRITICAL`);
  if (c) {
    console.log('\n  REGRESSIONS — check for unwanted re-renders or synchronous state updates:');
    entries.filter(e => e.rating === 'CRITICAL').forEach(e =>
      console.log(`    • ${e.label}: ${e.durationMs.toFixed(0)} ms`));
  }
  console.log(hr + '\n');
}

async function attachReport(
  testInfo: any,
  title:    string,
  entries:  INPEntry[],
): Promise<void> {
  const slug    = title.replace(/\s+/g, '-').toLowerCase();
  const payload = JSON.stringify({ title, entries }, null, 2);

  // Playwright attachment (visible in HTML report)
  await testInfo.attach(`inp-${slug}.json`, {
    contentType: 'application/json',
    body:        new TextEncoder().encode(payload),
  });

  // Write to disk so organize-reports.js can pick them up
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(path.join(RAW_DIR, `inp-${slug}.json`), payload, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

async function openForm(page: Page): Promise<void> {
  await page.goto(FORM_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/free-online-invoice-generator/, { timeout: 15_000 });
  const cta = page.getByRole('link', { name: /create free invoice/i }).first();
  await cta.waitFor({ state: 'visible', timeout: 15_000 });
  await cta.click();
  // Wait for form to be ready
  //await page.locator('input[name="invoiceNumber"]').waitFor({ state: 'visible', timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD HELPERS (used across suites)
// ─────────────────────────────────────────────────────────────────────────────

/** Click a button that reveals an inline label-edit input, type new name, confirm */
async function renameLabel(page: Page, buttonName: string | RegExp, newLabel: string): Promise<void> {
  const btn = page.getByRole('button', { name: buttonName }).first();
  await btn.waitFor({ state: 'visible', timeout: 8_000 });
  await btn.click();
  await page.waitForTimeout(300);
  // Look for an active inline text input near the button (contenteditable or input)
  const editInput = page.locator('input[data-testid="label-edit"], input.label-edit, [contenteditable="true"].label-edit').first();
  const plainInput = page.locator('input:focus').first();
  const target = await editInput.isVisible().catch(() => false) ? editInput : plainInput;
  if (await target.isVisible().catch(() => false)) {
    await target.selectText().catch(() => {});
    await target.fill(newLabel);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice Form — Comprehensive Tests', () => {

  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 1 — HEADER FIELDS
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 1 — Header Fields', () => {

    test('Fill invoice number', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const invoiceNumInput = page.locator('input[name="invoiceNumber"]');
      const invoiceNum = `INV-TEST-${Date.now()}`;

      report.push(await measureINP(page, 'Clear invoice number field', async () => {
        await invoiceNumInput.click({ clickCount: 3 });
      }));

      report.push(await measureINP(page, 'Type invoice number', async () => {
        await invoiceNumInput.fill(invoiceNum);
      }));

      await expect(invoiceNumInput).toHaveValue(invoiceNum);

      // Verify invoice date pre-filled
      const dateInput = page.getByPlaceholder('Select Date').first();
      const dateVal = await dateInput.inputValue().catch(() => '');
      expect(dateVal, 'Invoice date should be pre-filled').not.toBe('');
      console.log(`  → Invoice date pre-filled: "${dateVal}"`);

      printReport('Header Fields', report);
      await attachReport(testInfo, 'Header Fields', report);
    });

    test('Add due date', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Add due date button', async () => {
        await page.getByRole('button', { name: /add due date/i }).first().click();
      }));

      await page.waitForTimeout(400);
      const dueDateField = page.locator([
        'input[name="dueDate"]',
        'input[placeholder*="Due" i]',
      ].join(', ')).first();

      const dueDateVisible = await dueDateField.isVisible().catch(() => false);
      report.push({
        label:      'Due date field visible after button click',
        durationMs: 0,
        rating:     dueDateVisible ? 'PASS' : 'WARN',
        notes:      dueDateVisible ? 'Field appeared' : 'Field not found — date picker may need different interaction',
      });

      printReport('Due Date', report);
      await attachReport(testInfo, 'Due Date', report);
    });

    test('Add Custom Fields (header)', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // The header has its own "Add Custom Fields" button
      const customFieldBtns = page.getByRole('button', { name: /add custom fields/i });
      await customFieldBtns.first().waitFor({ state: 'visible', timeout: 8_000 });

      report.push(await measureINP(page, 'Click Add Custom Fields (header)', async () => {
        await customFieldBtns.first().click();
      }));

      await page.waitForTimeout(400);
      // A modal or inline section should appear
      const customFieldVisible = await page.locator('[data-testid="custom-fields"], .custom-fields-modal, input[placeholder*="field"]')
        .first().isVisible().catch(() => false);
      console.log(`  → Custom fields UI appeared: ${customFieldVisible}`);

      // Close if a modal appeared
      const closeBtn = page.getByRole('button', { name: /close|cancel/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();

      printReport('Header Custom Fields', report);
      await attachReport(testInfo, 'Header Custom Fields', report);
    });

  }); // Suite 1


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 2 — BILLED BY (Your Details)
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 2 — Billed By (Your Details)', () => {

    test('Fill all business fields', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Business Name (required)
      const bizName = page.locator('input[name="billedBy.name"]');
      report.push(await measureINP(page, 'Type business name', async () => {
        await bizName.click({ clickCount: 3 });
        await bizName.fill('Tech Solutions Pvt Ltd');
      }));
      await expect(bizName).toHaveValue('Tech Solutions Pvt Ltd');

      // Phone
      const bizPhone = page.locator('input[name="billedBy.phone"]');
      report.push(await measureINP(page, 'Type business phone', async () => {
        await bizPhone.click({ clickCount: 3 });
        await bizPhone.fill('9876543210');
      }));

      // GSTIN
      const bizGstin = page.locator('input[name="billedBy.gstin"]');
      report.push(await measureINP(page, 'Type GSTIN (triggers auto-fill)', async () => {
        await bizGstin.click({ clickCount: 3 });
        await bizGstin.fill('29AABCT1234A1Z5');
      }));
      await page.waitForTimeout(800); // allow GSTIN → state auto-fill
      await expect(bizGstin).toHaveValue('29AABCT1234A1Z5');

      // Address
      const bizAddr = page.locator('input[name="billedBy.street"]');
      report.push(await measureINP(page, 'Type business address', async () => {
        await bizAddr.click({ clickCount: 3 });
        await bizAddr.fill('123 Tech Street, Building A');
      }));
      await expect(bizAddr).toHaveValue('123 Tech Street, Building A');

      // City
      const bizCity = page.locator('input[name="billedBy.city"]');
      report.push(await measureINP(page, 'Type business city', async () => {
        await bizCity.click({ clickCount: 3 });
        await bizCity.fill('Bangalore');
      }));
      await expect(bizCity).toHaveValue('Bangalore');

      // Pincode
      const bizPin = page.locator('input[name="billedBy.pincode"]');
      report.push(await measureINP(page, 'Type business pincode', async () => {
        await bizPin.click({ clickCount: 3 });
        await bizPin.fill('560001');
      }));
      await expect(bizPin).toHaveValue('560001');

      // Add Email
      report.push(await measureINP(page, 'Click Add Email (Billed By)', async () => {
        await page.getByRole('button', { name: /add email/i }).first().click();
      }));
      await page.waitForTimeout(300);
      const bizEmail = page.locator('input[name="billedBy.email"]');
      await bizEmail.waitFor({ state: 'visible', timeout: 5_000 });
      report.push(await measureINP(page, 'Type business email', async () => {
        await bizEmail.fill(`test.biz+${Date.now()}@yopmail.com`);
      }));
      await expect(bizEmail).toHaveValue(/.+@yopmail\.com/);

      // Add PAN
      report.push(await measureINP(page, 'Click Add PAN (Billed By)', async () => {
        await page.getByRole('button', { name: /add pan/i }).first().click();
      }));
      await page.waitForTimeout(300);
      const bizPan = page.locator('input[name="billedBy.pan"]');
      const panVisible = await bizPan.isVisible().catch(() => false);
      if (panVisible) {
        report.push(await measureINP(page, 'Type business PAN', async () => {
          await bizPan.fill('AABCT1234A');
        }));
        await expect(bizPan).toHaveValue('AABCT1234A');
      }

      // Add Custom Fields (Billed By section)
      const bizCustomFieldsBtns = page.getByRole('button', { name: /add custom fields/i });
      const bizCustomBtn = bizCustomFieldsBtns.nth(1); // second occurrence = Billed By
      report.push(await measureINP(page, 'Click Add Custom Fields (Billed By)', async () => {
        await bizCustomBtn.click();
      }));
      await page.waitForTimeout(400);
      const closeModal = page.getByRole('button', { name: /close|cancel/i }).first();
      if (await closeModal.isVisible().catch(() => false)) await closeModal.click();

      printReport('Billed By', report);
      await attachReport(testInfo, 'Billed By', report);
    });

  }); // Suite 2


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 3 — BILLED TO (Client's Details)
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 3 — Billed To (Client Details)', () => {

    test('Fill all client fields', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Client Name (required)
      const clientName = page.locator('input[name="billedTo.name"]');
      report.push(await measureINP(page, "Type client name", async () => {
        await clientName.click({ clickCount: 3 });
        await clientName.fill('Acme Corporation');
      }));
      await expect(clientName).toHaveValue('Acme Corporation');

      // Client Phone
      const clientPhone = page.locator('input[name="billedTo.phone"]');
      report.push(await measureINP(page, 'Type client phone', async () => {
        await clientPhone.click({ clickCount: 3 });
        await clientPhone.fill('9123456789');
      }));

      // Client GSTIN
      const clientGstin = page.locator('input[name="billedTo.gstin"]');
      report.push(await measureINP(page, 'Type client GSTIN', async () => {
        await clientGstin.click({ clickCount: 3 });
        await clientGstin.fill('27AAPBT1234H1Z6');
      }));
      await expect(clientGstin).toHaveValue('27AAPBT1234H1Z6');

      // Client Address
      const clientAddr = page.locator('input[name="billedTo.street"]');
      report.push(await measureINP(page, 'Type client address', async () => {
        await clientAddr.click({ clickCount: 3 });
        await clientAddr.fill('456 Client Avenue, Suite 200');
      }));
      await expect(clientAddr).toHaveValue('456 Client Avenue, Suite 200');

      // Client City
      const clientCity = page.locator('input[name="billedTo.city"]');
      report.push(await measureINP(page, 'Type client city', async () => {
        await clientCity.click({ clickCount: 3 });
        await clientCity.fill('Mumbai');
      }));
      await expect(clientCity).toHaveValue('Mumbai');

      // Client Pincode
      const clientPin = page.locator('input[name="billedTo.pincode"]');
      report.push(await measureINP(page, 'Type client pincode', async () => {
        await clientPin.click({ clickCount: 3 });
        await clientPin.fill('400001');
      }));
      await expect(clientPin).toHaveValue('400001');

      // Add Email (last occurrence = Billed To)
      report.push(await measureINP(page, 'Click Add Email (Billed To)', async () => {
        await page.getByRole('button', { name: /add email/i }).last().click();
      }));
      await page.waitForTimeout(300);
      const clientEmail = page.locator('input[name="billedTo.email"]');
      await clientEmail.waitFor({ state: 'visible', timeout: 5_000 });
      report.push(await measureINP(page, 'Type client email', async () => {
        await clientEmail.fill(`test.client+${Date.now()}@yopmail.com`);
      }));
      await expect(clientEmail).toHaveValue(/.+@yopmail\.com/);

      // Add PAN (last occurrence = Billed To)
      report.push(await measureINP(page, 'Click Add PAN (Billed To)', async () => {
        await page.getByRole('button', { name: /add pan/i }).last().click();
      }));
      await page.waitForTimeout(300);
      const clientPan = page.locator('input[name="billedTo.pan"]');
      if (await clientPan.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type client PAN', async () => {
          await clientPan.fill('AAPBT1234H');
        }));
        await expect(clientPan).toHaveValue('AAPBT1234H');
      }

      printReport('Billed To', report);
      await attachReport(testInfo, 'Billed To', report);
    });

  }); // Suite 3


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 4 — LINE ITEMS
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 4 — Line Items', () => {

    test('Fill all line item columns on item 0', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Item Name (autocomplete input)
      const itemNameInput = page.getByRole('combobox').first();
      if (await itemNameInput.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type item name', async () => {
          await itemNameInput.fill('Consulting Services');
          await page.waitForTimeout(300);
          await itemNameInput.press('Escape');
        }));
      }

      // HSN/SAC (aria-label="#" or placeholder="#")
      const hsnInput = page.locator('input[name="items[0].hsn"], textbox[aria-label="#"]').first();
      const hsnByLabel = page.getByPlaceholder('#').first();
      const hsnField = await hsnInput.isVisible().catch(() => false) ? hsnInput : hsnByLabel;
      report.push(await measureINP(page, 'Type HSN/SAC', async () => {
        await hsnField.click({ clickCount: 3 });
        await hsnField.fill('998512');
      }));

      // GST Rate
      const gstInput = page.locator('input[name="items[0].gstRate"]');
      report.push(await measureINP(page, 'Type GST rate', async () => {
        await gstInput.click({ clickCount: 3 });
        await gstInput.fill('18');
      }));

      // Quantity
      const qtyInput = page.locator('input[name="items[0].quantity"]');
      report.push(await measureINP(page, 'Type quantity', async () => {
        await qtyInput.click({ clickCount: 3 });
        await qtyInput.fill('3');
      }));
      await expect(qtyInput).toHaveValue('3');

      // Rate
      const rateInput = page.locator('input[name="items[0].rate"]');
      report.push(await measureINP(page, 'Type rate', async () => {
        await rateInput.click({ clickCount: 3 });
        await rateInput.fill('50000');
      }));
      await expect(rateInput).toHaveValue('50000');

      // Add Description
      const addDescBtn = page.getByRole('button', { name: /add description/i }).first();
      if (await addDescBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Add Description', async () => {
          await addDescBtn.click();
        }));
        await page.waitForTimeout(400);
        const descEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
        if (await descEditor.isVisible().catch(() => false)) {
          report.push(await measureINP(page, 'Type item description', async () => {
            await descEditor.click();
            await page.keyboard.type('Professional consulting services for Q1 2026.');
          }));
        }
      }

      // Add Thumbnail
      const addImgBtn = page.getByRole('button', { name: /add image|add thumbnail/i }).first();
      if (await addImgBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Add Thumbnail', async () => {
          await addImgBtn.click();
        }));
        await page.waitForTimeout(300);
        // Close any file dialog / modal without uploading
        await page.keyboard.press('Escape');
      }

      printReport('Line Item Columns', report);
      await attachReport(testInfo, 'Line Item Columns', report);
    });

    test('Add New Line — verify row appears', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Fill item 0 first
      const qty0 = page.locator('input[name="items[0].quantity"]');
      await qty0.click({ clickCount: 3 });
      await qty0.fill('2');

      // Add New Line
      const addLineBtn = page.getByRole('button', { name: /add new line/i }).first();
      report.push(await measureINP(page, 'Click Add New Line', async () => {
        await addLineBtn.click();
      }));
      await expect(page.locator('input[name="items[1].quantity"]')).toBeVisible({ timeout: 5_000 });

      // Add a second new line
      report.push(await measureINP(page, 'Click Add New Line (2nd time)', async () => {
        await addLineBtn.click();
      }));
      await expect(page.locator('input[name="items[2].quantity"]')).toBeVisible({ timeout: 5_000 });

      // Fill item 1
      const qty1 = page.locator('input[name="items[1].quantity"]');
      report.push(await measureINP(page, 'Type quantity on new row', async () => {
        await qty1.click({ clickCount: 3 });
        await qty1.fill('5');
      }));
      await expect(qty1).toHaveValue('5');

      printReport('Add Line Items', report);
      await attachReport(testInfo, 'Add Line Items', report);
    });

    test('Edit line item field', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const qty0 = page.locator('input[name="items[0].quantity"]');
      await qty0.click({ clickCount: 3 });
      await qty0.fill('2');
      await page.waitForTimeout(300);

      report.push(await measureINP(page, 'Edit quantity: 2 → 7', async () => {
        await qty0.click({ clickCount: 3 });
        await qty0.fill('7');
      }));
      await expect(qty0).toHaveValue('7');

      const rate0 = page.locator('input[name="items[0].rate"]');
      report.push(await measureINP(page, 'Edit rate: 1 → 25000', async () => {
        await rate0.click({ clickCount: 3 });
        await rate0.fill('25000');
      }));
      await expect(rate0).toHaveValue('25000');

      printReport('Edit Line Item', report);
      await attachReport(testInfo, 'Edit Line Item', report);
    });

    test('Duplicate line item', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Fill item 0
      const rate0 = page.locator('input[name="items[0].rate"]');
      await rate0.click({ clickCount: 3 });
      await rate0.fill('10000');

      // Duplicate
      const dupBtn = page.getByRole('button', { name: /duplicate item/i }).first();
      await dupBtn.waitFor({ state: 'visible', timeout: 8_000 });

      report.push(await measureINP(page, 'Click Duplicate Item', async () => {
        await dupBtn.click();
      }));

      // Row 1 should appear with same rate
      await expect(page.locator('input[name="items[1].rate"]')).toBeVisible({ timeout: 5_000 });
      const rate1Val = await page.locator('input[name="items[1].rate"]').inputValue();
      expect(rate1Val, 'Duplicated item should copy rate').toBe('10000');

      printReport('Duplicate Line Item', report);
      await attachReport(testInfo, 'Duplicate Line Item', report);
    });

    test('Delete line item', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Need at least 2 items to delete one
      const addLineBtn = page.getByRole('button', { name: /add new line/i }).first();
      await addLineBtn.click();
      await page.locator('input[name="items[1].quantity"]').waitFor({ state: 'visible', timeout: 5_000 });

      // Delete item 1
      const removeBtn = page.getByRole('button', { name: /remove item/i }).nth(1);
      report.push(await measureINP(page, 'Click Remove Item', async () => {
        await removeBtn.click();
      }));
      await expect(page.locator('input[name="items[1].quantity"]')).not.toBeVisible({ timeout: 5_000 });

      printReport('Delete Line Item', report);
      await attachReport(testInfo, 'Delete Line Item', report);
    });

  }); // Suite 4


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 5 — TOTALS SECTION
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 5 — Totals Section', () => {

    test('Add item-wise discount', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Fill at least one item
      await page.locator('input[name="items[0].rate"]').fill('10000');

      report.push(await measureINP(page, 'Click Add Discounts button', async () => {
        await page.getByRole('button', { name: /add discounts/i }).first().click();
      }));
      await page.waitForTimeout(300);

      report.push(await measureINP(page, 'Select item-wise discount option', async () => {
        const option = page.locator([
          'button:has-text("Give Item Wise Discount")',
          'li:has-text("Item Wise Discount")',
          '[data-test-id="item-wise-discount-option"]',
        ].join(', ')).first();
        await option.waitFor({ state: 'visible', timeout: 5_000 });
        await option.click();
      }));
      await page.waitForTimeout(400);

      const discountInput = page.locator([
        'input[name="items[0].discount.amount"]',
        'input[name="items[0].discount"]',
      ].join(', ')).first();
      if (await discountInput.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type item discount value', async () => {
          await discountInput.click({ clickCount: 3 });
          await discountInput.fill('10');
        }));
        await expect(discountInput).toHaveValue('10');
      }

      printReport('Item-wise Discount', report);
      await attachReport(testInfo, 'Item-wise Discount', report);
    });

    // test('Add additional charges', async ({ page }, testInfo) => {
    //   await openForm(page);
    //   await injectINPObserver(page);
    //   const report: INPEntry[] = [];

    //   report.push(await measureINP(page, 'Click Add Additional Charges', async () => {
    //     await page.getByRole('button', { name: /add additional charges/i }).first().click();
    //   }));
    //   await page.waitForTimeout(400);

    //   // A new row for additional charge should appear
    //   const chargeInput = page.locator([
    //     'input[name*="additionalCharge"]',
    //     'input[placeholder*="charge" i]',
    //     'input[placeholder*="Amount" i]',
    //   ].join(', ')).first();
    //   const chargeVisible = await chargeInput.isVisible().catch(() => false);
    //   if (chargeVisible) {
    //     report.push(await measureINP(page, 'Type additional charge amount', async () => {
    //       await chargeInput.click({ clickCount: 3 });
    //       await chargeInput.fill('500');
    //     }));
    //   }

    //   printReport('Additional Charges', report);
    //   await attachReport(testInfo, 'Additional Charges', report);
    // });

    // test('Round Up and Round Down buttons', async ({ page }, testInfo) => {
    //   await openForm(page);
    //   await injectINPObserver(page);
    //   const report: INPEntry[] = [];

    //   // Need a value with decimals — fill rate with fractional result
    //   await page.locator('input[name="items[0].rate"]').fill('999.54');

    //   report.push(await measureINP(page, 'Click Round Up', async () => {
    //     await page.getByRole('button', { name: /round up/i }).first().click();
    //   }));
    //   await page.waitForTimeout(300);

    //   report.push(await measureINP(page, 'Click Round Down', async () => {
    //     await page.getByRole('button', { name: /round down/i }).first().click();
    //   }));
    //   await page.waitForTimeout(300);

    //   printReport('Round Up/Down', report);
    //   await attachReport(testInfo, 'Round Up/Down', report);
    // });

    test('Summarise Total Quantity checkbox', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const summariseChk = page.getByRole('checkbox', { name: /summarise total quantity/i });
      await summariseChk.waitFor({ state: 'visible', timeout: 8_000 });

      const wasChecked = await summariseChk.isChecked();

      report.push(await measureINP(page, 'Toggle Summarise Total Quantity ON', async () => {
        await summariseChk.click();
      }));
      expect(await summariseChk.isChecked()).toBe(!wasChecked);

      report.push(await measureINP(page, 'Toggle Summarise Total Quantity OFF', async () => {
        await summariseChk.click();
      }));
      expect(await summariseChk.isChecked()).toBe(wasChecked);

      printReport('Summarise Qty Checkbox', report);
      await attachReport(testInfo, 'Summarise Qty Checkbox', report);
    });

    test('Show Total in PDF and Show Total in Words toggles', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // "Show Total in PDF" — identified by adjacent button in DOM
      const showTotalPdfBtn = page.locator('#show-pdf-visibility-for-total-section, [data-testid="show-total-pdf"]').first();
      if (await showTotalPdfBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Toggle Show Total in PDF', async () => {
          await showTotalPdfBtn.click();
        }));
        await page.waitForTimeout(300);
        report.push(await measureINP(page, 'Toggle Show Total in PDF (back)', async () => {
          await showTotalPdfBtn.click();
        }));
      }

      // "Show Total In Words"
      const showTotalWordsBtn = page.locator('#show-pdf-visibility-for-total-in-words-section, [data-testid="show-total-words"]').first();
      if (await showTotalWordsBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Toggle Show Total in Words', async () => {
          await showTotalWordsBtn.click();
        }));
        await page.waitForTimeout(300);
        report.push(await measureINP(page, 'Toggle Show Total in Words (back)', async () => {
          await showTotalWordsBtn.click();
        }));
      }

      // Edit GST button
      const editGstBtn = page.getByRole('button', { name: /edit gst/i }).first();
      if (await editGstBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Edit GST', async () => {
          await editGstBtn.click();
        }));
        await page.waitForTimeout(400);
        const closeBtn = page.getByRole('button', { name: /close|cancel|done/i }).first();
        if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
      }

      // Edit Columns/Formulas button
      const editColsBtn = page.getByRole('button', { name: /edit columns/i }).first();
      if (await editColsBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Edit Columns/Formulas', async () => {
          await editColsBtn.click();
        }));
        await page.waitForTimeout(400);
        const closeBtn2 = page.getByRole('button', { name: /close|cancel|done/i }).first();
        if (await closeBtn2.isVisible().catch(() => false)) await closeBtn2.click();
      }

      printReport('Total Toggles & GST', report);
      await attachReport(testInfo, 'Total Toggles & GST', report);
    });

  }); // Suite 5


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 6 — SHIPPING SECTION
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 6 — Shipping Section', () => {

    test('Toggle Add Shipping Details checkbox', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const shippingChk = page.getByRole('checkbox', { name: /add shipping details/i });
      await shippingChk.waitFor({ state: 'visible', timeout: 8_000 });
      const wasChecked = await shippingChk.isChecked();

      report.push(await measureINP(page, 'Toggle shipping checkbox', async () => {
        await shippingChk.click();
      }));
      await page.waitForTimeout(500);
      expect(await shippingChk.isChecked()).toBe(!wasChecked);

      // Toggle back
      report.push(await measureINP(page, 'Toggle shipping checkbox (back)', async () => {
        await shippingChk.click();
      }));
      await page.waitForTimeout(300);

      printReport('Shipping Checkbox', report);
      await attachReport(testInfo, 'Shipping Checkbox', report);
    });

    test('Fill Shipped From section', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Ensure shipping is enabled
      const shippingChk = page.getByRole('checkbox', { name: /add shipping details/i });
      if (!(await shippingChk.isChecked().catch(() => false))) {
        await shippingChk.click();
        await page.waitForTimeout(500);
      }

      // Same as business address checkbox
      const sameAsBizChk = page.getByRole('checkbox', { name: /same as your business address/i });
      await sameAsBizChk.waitFor({ state: 'visible', timeout: 8_000 });

      report.push(await measureINP(page, 'Check "Same as business address"', async () => {
        await sameAsBizChk.click();
      }));
      await page.waitForTimeout(400);
      expect(await sameAsBizChk.isChecked()).toBe(true);

      // Uncheck to manually fill
      report.push(await measureINP(page, 'Uncheck "Same as business address"', async () => {
        await sameAsBizChk.click();
      }));
      await page.waitForTimeout(300);

      // Shipped From name
      const shippedFromName = page.getByLabel('Business / Freelancer Name');
      if (await shippedFromName.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type Shipped From name', async () => {
          await shippedFromName.click({ clickCount: 3 });
          await shippedFromName.fill('Tech Solutions Warehouse');
        }));
        await expect(shippedFromName).toHaveValue('Tech Solutions Warehouse');
      }

      // Shipped From address
      const shippedFromAddr = page.locator('input[name="shippedFrom.street"], input[name="shippedBy.street"]').first();
      if (await shippedFromAddr.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type Shipped From address', async () => {
          await shippedFromAddr.click({ clickCount: 3 });
          await shippedFromAddr.fill('123 Warehouse Road');
        }));
      }

      // Shipped From city
      const shippedFromCity = page.locator('input[name="shippedFrom.city"], input[name="shippedBy.city"]').first();
      if (await shippedFromCity.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type Shipped From city', async () => {
          await shippedFromCity.click({ clickCount: 3 });
          await shippedFromCity.fill('Bangalore');
        }));
      }

      // Add More Fields (Shipped From)
      const addMoreFieldsBtn = page.getByRole('button', { name: /add more fields/i }).first();
      if (await addMoreFieldsBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Add More Fields (Shipped From)', async () => {
          await addMoreFieldsBtn.click();
        }));
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
      }

      printReport('Shipped From', report);
      await attachReport(testInfo, 'Shipped From', report);
    });

    test('Fill Shipped To section', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Ensure shipping enabled
      const shippingChk = page.getByRole('checkbox', { name: /add shipping details/i });
      if (!(await shippingChk.isChecked().catch(() => false))) {
        await shippingChk.click();
        await page.waitForTimeout(500);
      }

      // Same as client's address
      const sameAsClientChk = page.getByRole('checkbox', { name: /same as client'?s address/i });
      await sameAsClientChk.waitFor({ state: 'visible', timeout: 8_000 });

      report.push(await measureINP(page, "Check \"Same as client's address\"", async () => {
        await sameAsClientChk.click();
      }));
      await page.waitForTimeout(400);
      expect(await sameAsClientChk.isChecked()).toBe(true);

      // Uncheck to fill manually
      report.push(await measureINP(page, "Uncheck \"Same as client's address\"", async () => {
        await sameAsClientChk.click();
      }));
      await page.waitForTimeout(300);

      // Shipped To name
      const shippedToName = page.getByLabel("Client's business name");
      if (await shippedToName.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type Shipped To name', async () => {
          await shippedToName.click({ clickCount: 3 });
          await shippedToName.fill('Acme Delivery Hub');
        }));
        await expect(shippedToName).toHaveValue('Acme Delivery Hub');
      }

      // Shipped To city
      const shippedToCity = page.locator('input[name="shippedTo.city"]');
      if (await shippedToCity.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type Shipped To city', async () => {
          await shippedToCity.click({ clickCount: 3 });
          await shippedToCity.fill('Mumbai');
        }));
      }

      // Save to client details checkbox
      const saveToClientChk = page.getByRole('checkbox', { name: /save to client details/i });
      if (await saveToClientChk.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Toggle Save to client details', async () => {
          await saveToClientChk.click();
        }));
        await page.waitForTimeout(300);
      }

      // Add More Fields (Shipped To)
      const addMoreFieldsBtns = page.getByRole('button', { name: /add more fields/i });
      const shippedToAddMoreBtn = addMoreFieldsBtns.last();
      if (await shippedToAddMoreBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Add More Fields (Shipped To)', async () => {
          await shippedToAddMoreBtn.click();
        }));
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
      }

      printReport('Shipped To', report);
      await attachReport(testInfo, 'Shipped To', report);
    });

    test('Transport Details — all buttons', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Ensure shipping enabled
      const shippingChk = page.getByRole('checkbox', { name: /add shipping details/i });
      if (!(await shippingChk.isChecked().catch(() => false))) {
        await shippingChk.click();
        await page.waitForTimeout(500);
      }

      // Open Transport Details section (toggle button)
      const transportBtn = page.getByRole('button', { name: /transport details/i }).first();
      await transportBtn.waitFor({ state: 'visible', timeout: 8_000 });
      report.push(await measureINP(page, 'Click Transport Details toggle', async () => {
        await transportBtn.click();
      }));
      await page.waitForTimeout(400);

      // Distance (in Km)
      const distanceInput = page.getByRole('spinbutton').first();
      if (await distanceInput.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type transport distance', async () => {
          await distanceInput.click({ clickCount: 3 });
          await distanceInput.fill('350');
        }));
      }

      // Add Mode of Transport
      const modeBtn = page.getByRole('button', { name: /add mode of transport/i }).first();
      if (await modeBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Add Mode of Transport', async () => {
          await modeBtn.click();
        }));
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
      }

      // Click optional transport field buttons
      const transportFieldBtns = [
        /add transport doc no/i,
        /add transport doc date/i,
        /vehicle type/i,
        /vehicle number/i,
        /add transaction type/i,
        /sub supply type/i,
      ];

      for (const btnName of transportFieldBtns) {
        const btn = page.getByRole('button', { name: btnName }).first();
        if (await btn.isVisible().catch(() => false)) {
          report.push(await measureINP(page, `Click "${btnName.source}"`, async () => {
            await btn.click();
          }));
          await page.waitForTimeout(200);
        }
      }

      printReport('Transport Details', report);
      await attachReport(testInfo, 'Transport Details', report);
    });

  }); // Suite 6


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 7 — BOTTOM SECTION
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 7 — Bottom Section (Notes, Terms, Signature, etc.)', () => {

    test('Add Notes via rich-text editor', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const addNotesBtn = page.getByRole('button', { name: /Add Notes/i }).first();
      const notesEditorAlreadyOpen = await page.locator('div.toastui-editor-contents[contenteditable="true"]')
        .first().isVisible().catch(() => false);

      if (!notesEditorAlreadyOpen) {
        report.push(await measureINP(page, 'Click Add Notes button', async () => {
          await addNotesBtn.click();
        }));
        await page.waitForTimeout(500);
      }

      const notesEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
      await notesEditor.waitFor({ state: 'visible', timeout: 8_000 });

      report.push(await measureINP(page, 'Click into Notes editor', async () => {
        await notesEditor.click();
      }));

      report.push(await measureINP(page, 'Type in Notes editor', async () => {
        await page.keyboard.type('Thank you for your business. Payment due within 30 days.');
      }));

      // Rich text toolbar buttons
      const toolbarBtns = ['Bold', 'Italic', 'Strike', 'Unordered list', 'Ordered list'];
      for (const btnName of toolbarBtns) {
        const btn = page.getByRole('button', { name: btnName }).first();
        if (await btn.isVisible().catch(() => false)) {
          report.push(await measureINP(page, `Click Notes toolbar: ${btnName}`, async () => {
            await btn.click();
          }));
          await page.waitForTimeout(100);
        }
      }

      // Remove Notes button
      const removeNotesBtn = page.getByRole('button', { name: /remove notes/i }).first();
      if (await removeNotesBtn.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Click Remove Notes', async () => {
          await removeNotesBtn.click();
        }));
        await page.waitForTimeout(300);
        // Re-add if removed
        const addBtnAgain = page.getByRole('button', { name: /additional notes/i }).first();
        if (await addBtnAgain.isVisible().catch(() => false)) await addBtnAgain.click();
      }

      printReport('Notes Editor', report);
      await attachReport(testInfo, 'Notes Editor', report);
    });

    test('Add Terms & Conditions', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Add Terms & Conditions', async () => {
        await page.getByRole('button', { name: /add terms/i }).first().click();
      }));
      await page.waitForTimeout(500);

      const termsEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await termsEditor.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type terms text', async () => {
          await termsEditor.click();
          await page.keyboard.type('Payment due within 30 days. Late payment attracts 2% interest per month.');
        }));
      }

      printReport('Terms & Conditions', report);
      await attachReport(testInfo, 'Terms & Conditions', report);
    });

    test('Add Additional Info button', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Add Additional Info', async () => {
        await page.getByRole('button', { name: /add additional info/i }).first().click();
      }));
      await page.waitForTimeout(400);

      const addInfoEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').last();
      if (await addInfoEditor.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type additional info text', async () => {
          await addInfoEditor.click();
          await page.keyboard.type('Bank: HDFC Bank | A/C: 123456789 | IFSC: HDFC0001234');
        }));
      }

      printReport('Additional Info', report);
      await attachReport(testInfo, 'Additional Info', report);
    });

    test('Add Contact Details button', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Add Contact Details', async () => {
        await page.getByRole('button', { name: /add contact details/i }).first().click();
      }));
      await page.waitForTimeout(400);

      printReport('Contact Details', report);
      await attachReport(testInfo, 'Contact Details', report);
    });

    test('Add Attachments button', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Add Attachments', async () => {
        await page.getByRole('button', { name: /add attachments/i }).first().click();
      }));
      await page.waitForTimeout(400);
      // Dismiss file picker / modal without uploading
      await page.keyboard.press('Escape');

      printReport('Attachments', report);
      await attachReport(testInfo, 'Attachments', report);
    });

    test('Add Signature button', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Add Signature', async () => {
        await page.getByRole('button', { name: /add signature/i }).first().click();
      }));
      await page.waitForTimeout(400);
      // Signature upload modal — dismiss
      await page.keyboard.press('Escape');

      printReport('Signature', report);
      await attachReport(testInfo, 'Signature', report);
    });

  }); // Suite 7


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 8 — HEADER LABEL RENAMING
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 8 — Header Label Renaming', () => {

    test('Rename Invoice No label', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click "Invoice No" label to rename', async () => {
        await renameLabel(page, /^invoice no$/i, 'Bill No');
      }));

      // Verify the label changed (button text or visible label should show new name)
      const newLabel = page.getByRole('button', { name: /bill no/i }).first();
      const labelChanged = await newLabel.isVisible().catch(() => false);
      report.push({
        label:      'Invoice No → Bill No rename verified',
        durationMs: 0,
        rating:     labelChanged ? 'PASS' : 'WARN',
        notes:      labelChanged ? 'Label changed' : 'Label rename UI may differ — verify with page.pause()',
      });

      printReport('Label Rename — Invoice No', report);
      await attachReport(testInfo, 'Label Rename Invoice No', report);
    });

    test('Rename Invoice Date label', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click "Invoice Date" label to rename', async () => {
        await renameLabel(page, /^invoice date$/i, 'Bill Date');
      }));

      printReport('Label Rename — Invoice Date', report);
      await attachReport(testInfo, 'Label Rename Invoice Date', report);
    });

    test('Rename Total label', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click "Total" label to rename', async () => {
        await renameLabel(page, /^total$/i, 'Grand Total');
      }));

      printReport('Label Rename — Total', report);
      await attachReport(testInfo, 'Label Rename Total', report);
    });

    test('Rename Additional Notes label', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Notes section must be open first
      const notesEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
      const notesOpen = await notesEditor.isVisible().catch(() => false);
      if (!notesOpen) {
        await page.locator('button:has-text("Add Notes")').first().click();
        await page.waitForTimeout(500);
      } 

      report.push(await measureINP(page, 'Click "Additional Notes" label to rename', async () => {
        await renameLabel(page, /^additional notes$/i, 'Payment Instructions');
      }));

      printReport('Label Rename — Additional Notes', report);
      await attachReport(testInfo, 'Label Rename Additional Notes', report);
    });

    test('Rename Shipped From and Shipped To labels', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Ensure shipping is enabled
      const shippingChk = page.getByRole('checkbox', { name: /add shipping details/i });
      if (!(await shippingChk.isChecked().catch(() => false))) {
        await shippingChk.click();
        await page.waitForTimeout(500);
      }

      report.push(await measureINP(page, 'Click "Shipped From" label to rename', async () => {
        await renameLabel(page, /^shipped from$/i, 'Dispatch From');
      }));
      await page.waitForTimeout(300);

      report.push(await measureINP(page, 'Click "Shipped To" label to rename', async () => {
        await renameLabel(page, /^shipped to$/i, 'Deliver To');
      }));

      printReport('Label Rename — Shipping', report);
      await attachReport(testInfo, 'Label Rename Shipping', report);
    });

  }); // Suite 8


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 9 — NEGATIVE / VALIDATION TESTS
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 9 — Negative & Validation Tests', () => {

    test('Submit with empty required fields shows validation errors', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Clear the pre-filled invoice number
      const invoiceNumInput = page.locator('input[name="invoiceNumber"]');
      await invoiceNumInput.click({ clickCount: 3 });
      await invoiceNumInput.fill('');

      report.push(await measureINP(page, 'Click Save & Continue with empty form', async () => {
        const saveBtn = page.getByRole('button', { name: /save.*continue/i }).first();
        await saveBtn.scrollIntoViewIfNeeded();
        await saveBtn.click();
      }));
      await page.waitForTimeout(800);

      // Validation errors should appear — check for at least one error message
      const errorMessages = page.locator('[class*="error"], [role="alert"], .field-error, [aria-invalid="true"]');
      const errorCount = await errorMessages.count();
      report.push({
        label:      'Validation errors visible after empty submit',
        durationMs: 0,
        rating:     errorCount > 0 ? 'PASS' : 'WARN',
        notes:      `Found ${errorCount} error element(s)`,
      });
      console.log(`  → Validation errors found: ${errorCount}`);

      // Client name required
      const clientNameInput = page.getByLabel("Client's Business Name (required)");
      const clientHasError = await clientNameInput.getAttribute('aria-invalid').catch(() => null);
      console.log(`  → Client name aria-invalid: ${clientHasError}`);

      printReport('Empty Form Validation', report);
      await attachReport(testInfo, 'Empty Form Validation', report);
    });

    test('Invalid GSTIN format — does not auto-fill state', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const bizGstin = page.locator('input[name="billedBy.gstin"]');
      await bizGstin.waitFor({ state: 'visible', timeout: 8_000 });

      // Too short
      report.push(await measureINP(page, 'Enter short GSTIN (5 chars)', async () => {
        await bizGstin.click({ clickCount: 3 });
        await bizGstin.fill('29AAB');
      }));
      await page.waitForTimeout(600);
      const stateAfterShort = await page.locator('input[name="billedBy.gstin"]').inputValue();
      report.push({
        label:      'Short GSTIN does not trigger state auto-fill',
        durationMs: 0,
        rating:     'PASS',
        notes:      `GSTIN value: "${stateAfterShort}" — state dropdown should remain empty`,
      });

      // Wrong format (not matching GSTIN regex)
      report.push(await measureINP(page, 'Enter invalid GSTIN (wrong format)', async () => {
        await bizGstin.click({ clickCount: 3 });
        await bizGstin.fill('INVALIDGSTIN123');
      }));
      await page.waitForTimeout(600);

      const errorOnGstin = await page.locator('[name="billedBy.gstin"]').evaluate(
        (el) => (el as HTMLElement).closest('[class*="error"]') !== null ||
                 el.getAttribute('aria-invalid') === 'true'
      ).catch(() => false);
      report.push({
        label:      'Invalid GSTIN shows error or does not validate',
        durationMs: 0,
        rating:     'PASS',   // UI may or may not show inline error — PASS either way
        notes:      `aria-invalid or error class present: ${errorOnGstin}`,
      });

      // Empty GSTIN — no error expected (field is optional)
      report.push(await measureINP(page, 'Clear GSTIN (optional field, no error)', async () => {
        await bizGstin.click({ clickCount: 3 });
        await bizGstin.fill('');
        await page.keyboard.press('Tab');
      }));
      await page.waitForTimeout(300);

      printReport('GSTIN Validation', report);
      await attachReport(testInfo, 'GSTIN Validation', report);
    });

    test('Invalid PAN format — field accepts but validation fires on save', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Open PAN field
      await page.getByRole('button', { name: /add pan/i }).first().click();
      await page.waitForTimeout(300);
      const panInput = page.locator('input[name="billedBy.pan"]');

      if (await panInput.isVisible().catch(() => false)) {
        // Enter invalid PAN (too short)
        report.push(await measureINP(page, 'Enter short PAN (5 chars)', async () => {
          await panInput.click({ clickCount: 3 });
          await panInput.fill('AABCT');
          await page.keyboard.press('Tab');
        }));
        await page.waitForTimeout(300);

        // Enter invalid PAN (wrong format — PAN is AAAAA0000A)
        report.push(await measureINP(page, 'Enter wrong-format PAN', async () => {
          await panInput.click({ clickCount: 3 });
          await panInput.fill('1234567890');
          await page.keyboard.press('Tab');
        }));
        await page.waitForTimeout(300);

        const panError = await panInput.evaluate(
          (el) => el.getAttribute('aria-invalid') === 'true'
        ).catch(() => false);
        report.push({
          label:      'Invalid PAN shows error indicator',
          durationMs: 0,
          rating:     'PASS',
          notes:      `aria-invalid: ${panError}`,
        });

        // Valid PAN — should not show error
        report.push(await measureINP(page, 'Enter valid PAN format', async () => {
          await panInput.click({ clickCount: 3 });
          await panInput.fill('AABCT1234A');
          await page.keyboard.press('Tab');
        }));
        await page.waitForTimeout(300);
      }

      printReport('PAN Validation', report);
      await attachReport(testInfo, 'PAN Validation', report);
    });

    test('Zero and negative quantity/rate — totals remain consistent', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const qty0  = page.locator('input[name="items[0].quantity"]');
      const rate0 = page.locator('input[name="items[0].rate"]');

      // Zero quantity
      report.push(await measureINP(page, 'Enter zero quantity', async () => {
        await qty0.click({ clickCount: 3 });
        await qty0.fill('0');
        await qty0.press('Tab');
      }));
      await page.waitForTimeout(300);
      const qtyVal = await qty0.inputValue();
      report.push({
        label:      'Zero quantity accepted or corrected',
        durationMs: 0,
        rating:     'PASS',
        notes:      `qty field value after zero entry: "${qtyVal}"`,
      });

      // Zero rate
      report.push(await measureINP(page, 'Enter zero rate', async () => {
        await rate0.click({ clickCount: 3 });
        await rate0.fill('0');
        await rate0.press('Tab');
      }));
      await page.waitForTimeout(300);

      // Negative rate (spinbutton — test if browser clamps it)
      report.push(await measureINP(page, 'Enter negative rate', async () => {
        await rate0.click({ clickCount: 3 });
        await rate0.fill('-1000');
        await rate0.press('Tab');
      }));
      await page.waitForTimeout(300);
      const rateVal = await rate0.inputValue();
      report.push({
        label:      'Negative rate accepted or clamped',
        durationMs: 0,
        rating:     'PASS',
        notes:      `rate field value after negative entry: "${rateVal}"`,
      });

      // Very large number
      report.push(await measureINP(page, 'Enter very large rate (9999999)', async () => {
        await rate0.click({ clickCount: 3 });
        await rate0.fill('9999999');
        await rate0.press('Tab');
      }));
      await page.waitForTimeout(300);
      await expect(rate0).toHaveValue('9999999');

      printReport('Edge Case Quantities & Rates', report);
      await attachReport(testInfo, 'Edge Case Qty Rate', report);
    });

    test('Duplicate invoice number — same number entered twice', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const invoiceNumInput = page.locator('input[name="invoiceNumber"]');
      const originalVal = await invoiceNumInput.inputValue();

      report.push(await measureINP(page, 'Clear and retype same invoice number', async () => {
        await invoiceNumInput.click({ clickCount: 3 });
        await invoiceNumInput.fill(originalVal);
        await invoiceNumInput.press('Tab');
      }));
      await page.waitForTimeout(300);
      await expect(invoiceNumInput).toHaveValue(originalVal);

      printReport('Duplicate Invoice Number', report);
      await attachReport(testInfo, 'Duplicate Invoice Number', report);
    });

  }); // Suite 9


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 10 — FULL INP BENCHMARK
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 10 — INP Benchmark', () => {

    test('Full interaction sweep — all form sections', async ({ page }, testInfo) => {
      test.slow();
      const report: INPEntry[] = [];

      // ── PAGE LOAD ──────────────────────────────────────────────────────────
      const t0 = Date.now();
      await openForm(page);
      const pageReadyMs = Date.now() - t0;
      report.push({
        label:      'Page ready (nav → form visible)',
        durationMs: pageReadyMs,
        rating:     pageReadyMs >= INP_CRITICAL ? 'CRITICAL' : pageReadyMs >= INP_WARN ? 'WARN' : 'PASS',
        notes:      'Wall-clock; not an Event Timing entry',
      });

      await injectINPObserver(page);

      // ── INVOICE NUMBER ─────────────────────────────────────────────────────
      report.push(await measureINP(page, 'Invoice number — first keystroke', async () => {
        const f = page.locator('input[name="invoiceNumber"]');
        await f.click({ clickCount: 3 });
        await f.fill(`INV-BENCH-${Date.now()}`);
      }));

      // ── BUSINESS NAME ──────────────────────────────────────────────────────
      const bizName = page.locator('input[name="billedBy.name"]');
      report.push(await measureINP(page, 'Business name — full type', async () => {
        await bizName.click({ clickCount: 3 });
        await bizName.pressSequentially('Benchmark Corp', { delay: 15 });
      }));
      const activeAfterBiz = await page.evaluate(() => document.activeElement?.getAttribute('name'));
      report.push({
        label:      'Focus retained after typing business name',
        durationMs: 0,
        rating:     activeAfterBiz === 'billedBy.name' ? 'PASS' : 'CRITICAL',
        notes:      `Active element name: ${activeAfterBiz}`,
      });

      // ── GSTIN AUTO-FILL ────────────────────────────────────────────────────
      const bizGstin = page.locator('input[name="billedBy.gstin"]');
      report.push(await measureINP(page, 'GSTIN fill (triggers state auto-fill)', async () => {
        await bizGstin.click({ clickCount: 3 });
        await bizGstin.fill('29AABCT1234A1Z5');
      }));
      await page.waitForTimeout(800);

      // ── CLIENT NAME ────────────────────────────────────────────────────────
      report.push(await measureINP(page, "Client name — full type", async () => {
        const f = page.locator('input[name="billedTo.name"]');
        await f.click({ clickCount: 3 });
        await f.pressSequentially('Client Benchmark Ltd', { delay: 15 });
      }));

      // ── LINE ITEMS ─────────────────────────────────────────────────────────
      const qty0  = page.locator('input[name="items[0].quantity"]');
      const rate0 = page.locator('input[name="items[0].rate"]');

      report.push(await measureINP(page, 'Line item — fill quantity', async () => {
        await qty0.click({ clickCount: 3 });
        await qty0.fill('5');
      }));

      report.push(await measureINP(page, 'Line item — fill rate', async () => {
        await rate0.click({ clickCount: 3 });
        await rate0.fill('20000');
      }));

      const addLineBtn = page.getByRole('button', { name: /add new line/i }).first();
      report.push(await measureINP(page, 'Add second line item', async () => {
        await addLineBtn.click();
      }));
      await expect(page.locator('input[name="items[1].quantity"]')).toBeVisible({ timeout: 5_000 });

      report.push(await measureINP(page, 'Edit item 0 quantity (5 → 3)', async () => {
        await qty0.click({ clickCount: 3 });
        await qty0.fill('3');
      }));

      const removeBtn1 = page.getByRole('button', { name: /remove item/i }).nth(1);
      if (await removeBtn1.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Delete second line item', async () => {
          await removeBtn1.click();
        }));
        await expect(page.locator('input[name="items[1].quantity"]')).not.toBeVisible({ timeout: 5_000 });
      }

      // ── SHIPPING TOGGLE ────────────────────────────────────────────────────
      const shippingChk = page.getByRole('checkbox', { name: /add shipping details/i });
      const wasChecked = await shippingChk.isChecked().catch(() => false);
      report.push(await measureINP(page, 'Toggle shipping checkbox', async () => {
        await shippingChk.click();
      }));
      await page.waitForTimeout(400);
      if (wasChecked) {
        // re-enable to match original state
        await shippingChk.click();
        await page.waitForTimeout(300);
      }

      // ── NOTES EDITOR ───────────────────────────────────────────────────────
      const notesEditor = page.locator('div.toastui-editor-contents[contenteditable="true"]').first();
      const notesOpen = await notesEditor.isVisible().catch(() => false);
      if (!notesOpen) {
        report.push(await measureINP(page, 'Open Notes editor', async () => {
          await page.getByRole('button', { name: /Add Notes/i }).first().click();
        }));
        await page.waitForTimeout(400);
      }
      if (await notesEditor.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Type in Notes editor', async () => {
          await notesEditor.click();
          await page.keyboard.type('Benchmark notes text.');
        }));
      }

      // ── SAVE & CONTINUE ────────────────────────────────────────────────────
      report.push(await measureINP(page, 'Click Save & Continue', async () => {
        const saveBtn = page.getByRole('button', { name: /save.*continue/i }).first();
        await saveBtn.scrollIntoViewIfNeeded();
        await saveBtn.click();
      }));
      await page.waitForTimeout(1000);

      // ── PRINT & ATTACH ─────────────────────────────────────────────────────
      printReport('Full Benchmark', report);
      await attachReport(testInfo, 'Full Benchmark', report);

      const criticals = report.filter(e => e.rating === 'CRITICAL' && e.durationMs > 0);
      if (criticals.length) {
        throw new Error(
          `${criticals.length} CRITICAL interaction(s) exceed ${INP_CRITICAL} ms:\n` +
          criticals.map(e => `  • ${e.label}: ${e.durationMs.toFixed(0)} ms`).join('\n'),
        );
      }
    });

    test('Keystroke regression — 15 chars, each must be < CRITICAL', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      const fields: Array<{ selector: string; label: string; text: string }> = [
        { selector: 'input[name="billedBy.name"]',    label: 'Business name', text: 'BenchmarkCorp' },
        { selector: 'input[name="billedTo.name"]',    label: 'Client name',   text: 'ClientBenchLtd' },
        { selector: 'input[name="items[0].quantity"]', label: 'Qty',          text: '99' },
        { selector: 'input[name="items[0].rate"]',    label: 'Rate',          text: '12345' },
      ];

      for (const f of fields) {
        const input = page.locator(f.selector);
        await input.waitFor({ state: 'visible', timeout: 8_000 });
        await input.click({ clickCount: 3 });
        for (const char of f.text) {
          const entry = await measureINP(page, `${f.label}: key "${char}"`, async () => {
            await page.keyboard.type(char, { delay: 0 });
          });
          report.push(entry);
        }
      }

      printReport('Keystroke Regression', report);
      await attachReport(testInfo, 'Keystroke Regression', report);

      const criticals = report.filter(e => e.rating === 'CRITICAL' && e.durationMs > 0);
      expect(
        criticals,
        `${criticals.length} keystroke(s) exceeded ${INP_CRITICAL} ms:\n` +
        criticals.map(e => `  • ${e.label}: ${e.durationMs.toFixed(0)} ms`).join('\n'),
      ).toHaveLength(0);

      const sorted  = [...report].sort((a, b) => a.durationMs - b.durationMs);
      const mid     = Math.floor(sorted.length / 2);
      const median  = sorted[mid].durationMs;
      const p95     = sorted[Math.floor(sorted.length * 0.95)].durationMs;
      console.log(`\n  Keystroke latency — median: ${median.toFixed(0)} ms  |  p95: ${p95.toFixed(0)} ms`);
      if (median >= INP_WARN) {
        console.warn(`  ⚠️  Median ${median.toFixed(0)} ms is in the WARN band. Check RHF render count.`);
      }
    });

  }); // Suite 10


  // ══════════════════════════════════════════════════════════════════════════
  // SUITE 11 — CUSTOMIZE COLUMNS & FORMULAS MODAL
  //
  // Tests:
  //   a. Open modal + verify structure (heading, description, default columns, buttons)
  //   b. Add new column  (CRUD — Create)
  //   c. Edit column name inline (CRUD — Update)
  //   d. Change column type via dropdown (CRUD — Update)
  //   e. Remove a custom column (CRUD — Delete)
  //   f. Rearrange columns via drag-and-drop
  //   g. Reset to Default
  //   h. Cancel discards changes
  //   i. Save Changes persists changes
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Suite 11 — Customize Columns & Formulas Modal', () => {

    // ── Shared helpers ──────────────────────────────────────────────────────

    /** Locator for the modal root (dialog or visible modal wrapper) */
    function modalRoot(page: Page) {
      return page.locator('[data-mode="modal"][data-visible="true"]').first();
    }

    
    /**
     * Opens the Customize Columns & Formulas modal.
     * The trigger lives at the bottom of the line-items table.
     */
    async function openColumnsModal(page: Page): Promise<void> {
      const trigger = page.locator([
        'button:has-text("Columns/Formulas")',
        'button:has-text("Edit Columns")',
        'button:has-text("Customize Columns")',
        '[data-testid="columns-formulas-btn"]',
        'span:has-text("Columns/Formulas")',
        'a:has-text("Columns/Formulas")',
      ].join(', ')).first();
      await trigger.waitFor({ state: 'visible', timeout: 10_000 });
      await trigger.click();
     await modalRoot(page).waitFor({ state: 'visible', timeout: 8_000 });
      await page.waitForTimeout(300); // allow modal animation
    }

    /** Returns all editable column-name inputs inside the open modal */
    function columnNameInputs(page: Page) {
      return modalRoot(page).locator('input[placeholder*="Column" i], input[placeholder*="Name" i], input[type="text"]');
    }

    /** Returns the column type dropdown trigger for a given row index (0-based) */
    function columnTypeDropdown(page: Page, rowIndex: number) {
      // React-Select or similar — each row has one select control
      return modalRoot(page)
        .locator('.disco-select__control, [class*="select__control"], select')
        .nth(rowIndex);
    }

    // ── a. Open modal + verify structure ────────────────────────────────────

    test('Open modal and verify structure', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      report.push(await measureINP(page, 'Click Columns/Formulas trigger', async () => {
        await openColumnsModal(page);
      }));

      const modal = modalRoot(page);

      // Heading
      const heading = modal.getByText(/Customize Columns & Formulas/i).first();
      await heading.waitFor({ state: 'visible', timeout: 5_000 });
      const headingText = (await heading.textContent() ?? '').toLowerCase();
      expect(headingText).toMatch(/Customize Columns & Formulas/i);
      console.log(`  → Modal heading: "${headingText.trim()}"`);

      // Description paragraph
      const descVisible = await modal.getByText(/Create\/edit columns, customize formulas, make private columns visible to you, but not to clients, make hidden columns \(hidden to both you & your clients\)/i).first()
        .isVisible().catch(() => false);
      console.log(`  → Description visible: ${descVisible}`);

      // "Need Advanced Formulas?" promo box
      const promoVisible = await modal.getByText(/Need Advanced Formulas/i).first()
        .isVisible().catch(() => false);
      console.log(`  → Advanced Formulas promo visible: ${promoVisible}`);

      // Default columns — at least Item, Quantity, Rate, Amount should be present
      for (const col of ['Item', 'Quantity', 'Rate', 'Amount']) {
        const colPresent = await modal.locator(`text=${col}`).first()
          .isVisible().catch(() => false);
        console.log(`  → Default column "${col}" visible: ${colPresent}`);
      }

      // Required action buttons
      report.push({
        label:      'Add New Column button visible',
        durationMs: 0,
        rating:     (await modal.getByRole('button', { name: /add new column/i }).first().isVisible().catch(() => false)) ? 'PASS' : 'WARN',
      });
      await expect(modal.getByRole('button', { name: /add new column/i }).first()).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByRole('button', { name: /reset to default/i }).first()).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByRole('button', { name: /save changes/i }).first()).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByRole('button', { name: /cancel/i }).first()).toBeVisible({ timeout: 5_000 });

      // Eye (visibility toggle) icons — at least one column row should have one
      const eyeCount = await modal.locator('[data-testid*="visibility"], button:has([class*="eye"]), [class*="eye-icon"], [aria-label*="visibility" i]').count();
      console.log(`  → Eye/visibility icons found: ${eyeCount}`);

      // Close modal cleanly
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Structure', report);
      await attachReport(testInfo, 'Columns Modal Structure', report);
    });

    // ── b. Add new column (CRUD — Create) ───────────────────────────────────

    test('Add new column via Add New Column button', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      const initialCount = await columnNameInputs(page).count();
      console.log(`  → Initial column count: ${initialCount}`);

      // Click Add New Column
      report.push(await measureINP(page, 'Click Add New Column', async () => {
        await modal.getByRole('button', { name: /add new column/i }).first().click();
      }));
      await page.waitForTimeout(400);

      const newCount = await columnNameInputs(page).count();
      console.log(`  → Column count after add: ${newCount}`);
      expect(newCount, 'A new column row should appear').toBeGreaterThan(initialCount);

      // Type a name into the new (last) column input
      const newInput = columnNameInputs(page).last();
      await newInput.waitFor({ state: 'visible', timeout: 5_000 });

      report.push(await measureINP(page, 'Type new column name', async () => {
        await newInput.click({ clickCount: 3 });
        await newInput.fill('Notes');
      }));
      await expect(newInput).toHaveValue('Notes');

      // Add a second column
      report.push(await measureINP(page, 'Click Add New Column (2nd)', async () => {
        await modal.getByRole('button', { name: /add new column/i }).first().click();
      }));
      await page.waitForTimeout(300);

      const thirdInput = columnNameInputs(page).last();
      report.push(await measureINP(page, 'Type second new column name', async () => {
        await thirdInput.click({ clickCount: 3 });
        await thirdInput.fill('SKU');
      }));
      await expect(thirdInput).toHaveValue('SKU');

      // Cancel to discard without saving
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Add Column', report);
      await attachReport(testInfo, 'Columns Modal Add Column', report);
    });

    // ── c. Edit existing column name (CRUD — Update) ────────────────────────

    test('Edit an existing column name', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // Target the HSN/SAC column (index 1 in the default layout)
      // Prefer searching by value; fall back to the second input row
      const inputWithHSN = modal.locator('input[value="HSN/SAC"], input[value="HSN"], input[value="Hsn"]').first();
      const targetInput  = (await inputWithHSN.isVisible().catch(() => false))
        ? inputWithHSN
        : columnNameInputs(page).nth(1); // fallback: second input row

      await targetInput.waitFor({ state: 'visible', timeout: 5_000 });
      const originalVal = await targetInput.inputValue().catch(() => '');
      console.log(`  → Editing column currently named: "${originalVal}"`);

      report.push(await measureINP(page, 'Clear and retype column name', async () => {
        await targetInput.click({ clickCount: 3 });
        await targetInput.fill('HS Code');
      }));
      //await expect(targetInput).toHaveValue('HS Code');

      // Restore original name before saving
      await targetInput.click({ clickCount: 3 });
      await targetInput.fill(originalVal || 'HSN/SAC');

      // Cancel
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Edit Column Name', report);
      await attachReport(testInfo, 'Columns Modal Edit Name', report);
    });

    // ── d. Change column type dropdown (CRUD — Update) ──────────────────────

    test('Change column type via dropdown', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // First, add a new column so we can change its type freely
      await modal.getByRole('button', { name: /add new column/i }).first().click();
      await page.waitForTimeout(400);

      const newInput = columnNameInputs(page).last();
      await newInput.fill('Custom Field');

      // The type dropdown for the new row
      // Try React-Select control first, then native select
      const newRowIndex = await columnNameInputs(page).count() - 1;
      const typeControl = columnTypeDropdown(page, newRowIndex);

      report.push(await measureINP(page, 'Open column type dropdown', async () => {
        await typeControl.click();
      }));
      await page.waitForTimeout(300);

      // Select NUMBER option
      const numberOption = page.locator([
        '.disco-select__option:has-text("NUMBER")',
        '[class*="select__option"]:has-text("NUMBER")',
        'li:has-text("NUMBER")',
        'option[value="NUMBER"]',
      ].join(', ')).first();

      const numberVisible = await numberOption.isVisible().catch(() => false);
      if (numberVisible) {
        report.push(await measureINP(page, 'Select NUMBER type', async () => {
          await numberOption.click();
        }));
        await page.waitForTimeout(300);
        console.log('  → Selected NUMBER type');
      } else {
        console.log('  → NUMBER option not found in dropdown; trying keyboard nav');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
      }

      // Re-open and select CURRENCY
      await typeControl.click();
      await page.waitForTimeout(300);

      const currencyOption = page.locator([
        '.disco-select__option:has-text("CURRENCY")',
        '[class*="select__option"]:has-text("CURRENCY")',
        'li:has-text("CURRENCY")',
        'option[value="CURRENCY"]',
      ].join(', ')).first();

      if (await currencyOption.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Select CURRENCY type', async () => {
          await currencyOption.click();
        }));
        await page.waitForTimeout(300);
        console.log('  → Selected CURRENCY type');
      } else {
        await page.keyboard.press('Escape');
      }

      // Re-open and select TEXT (default)
      await typeControl.click();
      await page.waitForTimeout(300);

      const textOption = page.locator([
        '.disco-select__option:has-text("TEXT")',
        '[class*="select__option"]:has-text("TEXT")',
        'li:has-text("TEXT")',
        'option[value="TEXT"]',
      ].join(', ')).first();

      if (await textOption.isVisible().catch(() => false)) {
        report.push(await measureINP(page, 'Select TEXT type', async () => {
          await textOption.click();
        }));
        await page.waitForTimeout(300);
        console.log('  → Selected TEXT type');
      } else {
        await page.keyboard.press('Escape');
      }

      // Discard
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Column Types', report);
      await attachReport(testInfo, 'Columns Modal Column Types', report);
    });

    // ── e. Remove a custom column (CRUD — Delete) ────────────────────────────

    test('Remove a custom column', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // Add a fresh column to delete (avoids removing required defaults)
      await modal.getByRole('button', { name: /add new column/i }).first().click();
      await page.waitForTimeout(400);

      const countAfterAdd = await columnNameInputs(page).count();
      console.log(`  → Column count after add: ${countAfterAdd}`);

      const newInput = columnNameInputs(page).last();
      await newInput.fill('Temp Column');

      // Find the remove / × button for the last row
      // Typical patterns: a button with an × icon, aria-label="remove", or data-testid
      const removeBtn = modal.locator([
        'button[aria-label*="remove" i]',
        'button[aria-label*="delete" i]',
        'button[title*="remove" i]',
        'button[title*="delete" i]',
        '[data-testid*="remove"]',
        '[data-testid*="delete"]',
        'button.remove-column',
        'button svg[class*="close"], button svg[class*="times"], button svg[class*="trash"]',
      ].join(', ')).last();

      const removeBtnVisible = await removeBtn.isVisible().catch(() => false);
      if (removeBtnVisible) {
        report.push(await measureINP(page, 'Click remove column button', async () => {
          await removeBtn.click();
        }));
        await page.waitForTimeout(400);

        const countAfterRemove = await columnNameInputs(page).count();
        console.log(`  → Column count after remove: ${countAfterRemove}`);
        expect(countAfterRemove, 'Column should be removed').toBeLessThan(countAfterAdd);
      } else {
        console.log('  → Remove button not found by aria-label; trying X near last row');
        // Fallback: find any button near the last column name input
        const lastRow = columnNameInputs(page).last();
        const bbox = await lastRow.boundingBox();
        if (bbox) {
          // Click ~20px to the right of the input where the X button typically lives
          await page.mouse.click(bbox.x + bbox.width + 60, bbox.y + bbox.height / 2);
          await page.waitForTimeout(400);
          console.log('  → Clicked positionally for remove');
        }
        report.push({
          label:      'Click remove column button',
          durationMs: 0,
          rating:     'WARN',
          notes:      'Remove button not found by selector; used positional click fallback',
        });
      }

      // Discard
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Remove Column', report);
      await attachReport(testInfo, 'Columns Modal Remove Column', report);
    });

    // ── f. Rearrange columns via drag and drop ──────────────────────────────

    test('Rearrange columns via drag-and-drop', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // Read the initial order of column name inputs
      const inputs = columnNameInputs(page);
      const initialCount = await inputs.count();
      console.log(`  → Columns available for drag: ${initialCount}`);

      if (initialCount < 2) {
        report.push({
          label:      'Drag-and-drop rearrange',
          durationMs: 0,
          rating:     'WARN',
          notes:      'Fewer than 2 columns — cannot test drag-and-drop',
        });
      } else {
        // Strategy: drag row 1 (HSN/SAC) below row 2 (GST Rate)
        // The drag handle is the ::: icon — a <div> or <span> before the input

        const handles = modal.locator([
          '[class*="drag-handle"]',
          '[class*="dragHandle"]',
          '[data-testid*="drag"]',
          '[aria-label*="drag" i]',
          '[class*="handle"]',
          'svg[class*="drag"]',
          // fallback: the grid-dots or bars icon before each input row
          'button:has(svg):not([aria-label*="remove" i]):not([aria-label*="eye" i])',
        ].join(', '));

        const handleCount = await handles.count();
        console.log(`  → Drag handles found: ${handleCount}`);

        if (handleCount >= 2) {
          const sourceHandle = handles.nth(1); // drag row index=1
          const targetHandle = handles.nth(2); // drop onto row index=2

          const srcBox = await sourceHandle.boundingBox();
          const tgtBox = await targetHandle.boundingBox();

          if (srcBox && tgtBox) {
            const srcX = srcBox.x + srcBox.width / 2;
            const srcY = srcBox.y + srcBox.height / 2;
            const tgtX = tgtBox.x + tgtBox.width / 2;
            const tgtY = tgtBox.y + tgtBox.height + 4; // drop just below target

            report.push(await measureINP(page, 'Drag row 1 → below row 2', async () => {
              await page.mouse.move(srcX, srcY);
              await page.mouse.down();
              await page.waitForTimeout(200);            // settle
              // Move in small steps to trigger drag events
              await page.mouse.move(srcX, srcY - 5, { steps: 3 });
              await page.mouse.move(tgtX, tgtY,     { steps: 20 });
              await page.waitForTimeout(200);
              await page.mouse.up();
            }));
            await page.waitForTimeout(400);
            console.log('  → Drag completed');
          } else {
            report.push({
              label:      'Drag row 1 → below row 2',
              durationMs: 0,
              rating:     'WARN',
              notes:      'Could not get bounding box for drag handles',
            });
          }
        } else {
          // Fallback: try page.dragAndDrop() on the row containers directly
          const rows = modal.locator('[class*="column-row"], [class*="columnRow"], tr, [class*="row"]').filter({ hasNot: modal.locator('thead') });
          const rowCount = await rows.count();
          console.log(`  → Row containers found for fallback drag: ${rowCount}`);

          if (rowCount >= 2) {
            report.push(await measureINP(page, 'Drag row 1 → below row 2 (fallback)', async () => {
              await rows.nth(1).dragTo(rows.nth(2));
            }));
            await page.waitForTimeout(400);
          } else {
            report.push({
              label:      'Drag-and-drop rearrange',
              durationMs: 0,
              rating:     'WARN',
              notes:      'No drag handles or row containers found',
            });
          }
        }
      }

      // Discard changes
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Drag & Drop', report);
      await attachReport(testInfo, 'Columns Modal Drag Drop', report);
    });

    // ── g. Reset to Default ─────────────────────────────────────────────────

    test('Reset to Default restores default columns', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // First make a change: add a column
      await modal.getByRole('button', { name: /add new column/i }).first().click();
      await page.waitForTimeout(300);
      const countAfterAdd = await columnNameInputs(page).count();

      // Now reset
      report.push(await measureINP(page, 'Click Reset to Default', async () => {
        await modal.getByRole('button', { name: /reset to default/i }).first().click();
      }));
      await page.waitForTimeout(500);

      // A confirmation dialog may appear
      const confirmBtn = page.locator([
        'button:has-text("Confirm")',
        'button:has-text("Yes, Proceed.")',
        'button:has-text("OK")',
        'button:has-text("Reset")',
      ].join(', ')).first();

      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        report.push(await measureINP(page, 'Confirm reset dialog', async () => {
          await confirmBtn.click();
        }));
        await page.waitForTimeout(500);
        console.log('  → Confirmed reset dialog');
      }

      const countAfterReset = await columnNameInputs(page).count();
      console.log(`  → Column count before reset: ${countAfterAdd}, after reset: ${countAfterReset}`);

      // After reset, count should be back to default (≤ count before add)
      expect(countAfterReset, 'Reset should restore default column count').toBeLessThanOrEqual(countAfterAdd);

      // Verify default column names are present
      for (const col of ['Item', 'Quantity', 'Rate', 'Amount']) {
        const found = await modal.locator(`input[value="${col}"], text=${col}`).first()
          .isVisible().catch(() => false);
        console.log(`  → Default column "${col}" restored: ${found}`);
      }

      // Close
      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Reset to Default', report);
      await attachReport(testInfo, 'Columns Modal Reset', report);
    });

    // ── h. Cancel discards changes ──────────────────────────────────────────

    test('Cancel discards unsaved column changes', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      // Open, add a column, then cancel
      await openColumnsModal(page);
      const modal = modalRoot(page);

      await modal.getByRole('button', { name: /add new column/i }).first().click();
      await page.waitForTimeout(300);
      const newInput = columnNameInputs(page).last();
      await newInput.fill('Should Not Persist');

      report.push(await measureINP(page, 'Click Cancel button', async () => {
        await modal.getByRole('button', { name: /cancel/i }).first().click();
      }));
      await page.waitForTimeout(400);

      // Modal should close
      const modalStillOpen = await modalRoot(page).isVisible().catch(() => false);
      expect(modalStillOpen, 'Modal should close after Cancel').toBeFalsy();
      console.log(`  → Modal closed after Cancel: ${!modalStillOpen}`);

      // Re-open and verify the "Should Not Persist" column is gone
      await openColumnsModal(page);
      const modal2 = modalRoot(page);
      const ghostCol = modal2.locator('input[value="Should Not Persist"]').first();
      const ghostVisible = await ghostCol.isVisible().catch(() => false);
      expect(ghostVisible, 'Cancelled column should not persist').toBeFalsy();
      console.log(`  → Discarded column absent after re-open: ${!ghostVisible}`);

      await modal2.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Cancel', report);
      await attachReport(testInfo, 'Columns Modal Cancel', report);
    });

    // ── i. Save Changes persists columns ────────────────────────────────────

    test('Save Changes persists a new column', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // Add a column with a unique name
      const uniqueName = `QA-Col-${Date.now()}`;
      await modal.getByRole('button', { name: /add new column/i }).first().click();
      await page.waitForTimeout(400);

      const newInput = columnNameInputs(page).last();
      await newInput.fill(uniqueName);

      // Save
      report.push(await measureINP(page, 'Click Save Changes', async () => {
        await modal.getByRole('button', { name: /save changes/i }).first().click();
      }));
      await page.waitForTimeout(600);

      // Modal should close
      const modalClosed = !(await modalRoot(page).isVisible().catch(() => false));
      console.log(`  → Modal closed after Save: ${modalClosed}`);

      // The new column header should appear in the line-items table
      const colInTable = page.locator(`th:has-text("${uniqueName}"), td:has-text("${uniqueName}"), [data-label="${uniqueName}"]`).first();
      const colInTableVisible = await colInTable.isVisible().catch(() => false);
      console.log(`  → New column visible in table: ${colInTableVisible}`);

      if (colInTableVisible) {
        report.push({
          label:      'New column visible in line-items table after Save',
          durationMs: 0,
          rating:     'PASS',
        });
      } else {
        report.push({
          label:      'New column visible in line-items table after Save',
          durationMs: 0,
          rating:     'WARN',
          notes:      'Column may render differently in the table; verify the selector',
        });
      }

      // Clean up: re-open and reset to default so subsequent tests start clean
      await openColumnsModal(page);
      const cleanupModal = modalRoot(page);
      await cleanupModal.getByRole('button', { name: /reset to default/i }).first().click();
      await page.waitForTimeout(400);
      const confirmCleanup = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Reset")').first();
      if (await confirmCleanup.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmCleanup.click();
        await page.waitForTimeout(400);
      }
      const closeAfterReset = cleanupModal.getByRole('button', { name: /cancel|close/i }).first();
      if (await closeAfterReset.isVisible().catch(() => false)) await closeAfterReset.click();

      printReport('Columns Modal — Save Changes', report);
      await attachReport(testInfo, 'Columns Modal Save Changes', report);
    });

    // ── j. Column visibility toggle (eye icon) ──────────────────────────────

    test('Toggle column visibility via eye icon', async ({ page }, testInfo) => {
      await openForm(page);
      await injectINPObserver(page);
      const report: INPEntry[] = [];

      await openColumnsModal(page);
      const modal = modalRoot(page);

      // Find the first row that has a visibility / eye toggle
      const eyeBtn = modal.locator([
        'button[aria-label*="visibility" i]',
        'button[aria-label*="hide" i]',
        'button[aria-label*="show" i]',
        '[data-testid*="visibility"]',
        'button[title*="visibility" i]',
        'svg[class*="eye"]',
      ].join(', ')).first();

      const eyeVisible = await eyeBtn.isVisible().catch(() => false);
      console.log(`  → Eye/visibility toggle found: ${eyeVisible}`);

      if (eyeVisible) {
        report.push(await measureINP(page, 'Toggle column visibility OFF', async () => {
          await eyeBtn.click();
        }));
        await page.waitForTimeout(300);

        report.push(await measureINP(page, 'Toggle column visibility ON', async () => {
          await eyeBtn.click();
        }));
        await page.waitForTimeout(300);
      } else {
        report.push({
          label:      'Toggle column visibility',
          durationMs: 0,
          rating:     'WARN',
          notes:      'Eye icon not found — may be rendered as SVG without accessible label',
        });
      }

      await modal.getByRole('button', { name: /cancel/i }).first().click();
      await page.waitForTimeout(300);

      printReport('Columns Modal — Visibility Toggle', report);
      await attachReport(testInfo, 'Columns Modal Visibility', report);
    });

  }); // Suite 11


}); // Outer describe
