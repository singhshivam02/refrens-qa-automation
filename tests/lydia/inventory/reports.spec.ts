import { test, expect } from './fixture';
import { InventoryUI } from './ui';
import fs from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';

const { parseCsv } = require('./contracts.cjs');
const exec = promisify(execFile);

async function downloadCsv(page: import('@playwright/test').Page, sku: string) {
  await page.getByRole('button', { name: /download csv|export csv|csv download/i }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('CSV download has no stream');
  const buffers: Buffer[] = [];
  for await (const buffer of stream) buffers.push(Buffer.from(buffer));
  const table: string[][] = parseCsv(Buffer.concat(buffers).toString('utf8'));
  const row = table.slice(1).find((r) => r.includes(sku));
  expect(row, 'Export must contain the fixture SKU').toBeDefined();
  return { headers: table[0], row: row! };
}

test('INV-120 valuation report and downloaded CSV contain known quantities and value', async ({ page, inventory: f }) => {
  const item = await f.createItem({ initialStock: 8, costPrice: 25 });
  await f.indexed(item);
  await expect.poll(async () => {
    const report = await f.api.get(`${f.root}/inventory/reports/valuation`);
    return report.items.find((row: any) => row.sku === item.sku);
  }, { timeout: f.timeout }).toMatchObject({ stockInHand: 8, unitCost: 25, stockValue: 200 });
  await new InventoryUI(page, f).goto('reports/inventory/valuation');
  const search = page.locator('.search-bar input');
  await search.fill(item.sku);
  await search.press('Enter');
  await expect(page.getByRole('row').filter({ hasText: item.sku })).toBeVisible();
  const csv = await downloadCsv(page, item.sku);
  expect(csv.row).toContain('200');
  expect(csv.row).toContain('8');
});

for (const [initialStock, status] of [[0, 'outOfStock'], [1, 'critical'], [2, 'low'], [7.4, 'well'], [19, 'well'], [20, 'overstock']] as const) {
  test(`INV-121 stock-status boundary ${initialStock} is ${status}`, async ({ inventory: f }) => {
    const item = await f.createItem({ initialStock, reorderPoint: 2, overstockPoint: 20 });
    await f.expectStock(item, initialStock);
    await expect.poll(async () => (await f.getItem(item)).stockStatus, { timeout: f.timeout }).toBe(status);
  });
}

test('INV-122 profitability reports purchase/sale quantities and known gross margin', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 0, costPrice: 50, sellingPrice: 100 });
  await f.createDocument([f.line(item, 10, { rate: 50, amount: 500, subTotal: 500, total: 500 })], { isExpenditure: true });
  await f.createDocument([f.line(item, 4)]);
  await f.expectStock(item, 6);
  await expect.poll(async () => {
    const report = await f.api.get(`${f.root}/inventory/reports/sales`);
    return report.find((r: any) => r.sku === item.sku);
  }, { timeout: f.timeout }).toMatchObject({ purchaseQuantity: 10, soldQuantity: 4,
    avgCostPrice: 50, avgSellingPrice: 100, grossProfitMargin: 50 });
});

test('INV-123 real invoice PDF contains fixture SKU and quantity', async ({ page, inventory: f }, info) => {
  const item = await f.createItem({ sku: f.name('pdf-sku') });
  const doc = await f.createDocument([f.line(item, 3, { showSku: true })], {
    advanceOptions: { manageInventory: 'UPDATE', showSkuInInvoice: true },
  });
  await new InventoryUI(page, f).goto(`invoices/${doc._id}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByTitle('Download PDF', { exact: true }).last().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const pdfPath = info.outputPath('invoice.pdf');
  await download.saveAs(pdfPath);
  const { stdout } = await exec(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-layout', pdfPath, '-']);
  await info.attach('invoice-text.txt', { body: stdout, contentType: 'text/plain' });
  expect(stdout).toContain(item.sku);
  expect(stdout).toContain(item.name);
  expect(stdout).toMatch(/\b3(?:\.0+)?\b/);
  expect(fs.statSync(pdfPath).size).toBeGreaterThan(0);
});

test('INV-124 old outward movement appears in unsold report; recent sale removes it', async ({ inventory: f }) => {
  const item = await f.createItem();
  const old = new Date(Date.now() - 120 * 86_400_000).toISOString();
  await f.adjust(item, 'SELL', 1, { transactionDate: old });
  await f.expectStock(item, 9);
  const report = () => f.api.get(`${f.root}/inventory/reports/unsold-inventory-report?daysUnsold=90`);
  await expect.poll(async () => (await report()).items.find((r: any) => r.sku === item.sku),
    { timeout: f.timeout }).toMatchObject({ stockInHand: 9 });
  await f.adjust(item, 'SELL', 1);
  await f.expectStock(item, 8);
  await expect.poll(async () => (await report()).items.some((r: any) => r.sku === item.sku),
    { timeout: f.timeout }).toBe(false);
});

for (const days of [0, 181]) {
  test(`INV-125 unsold report rejects UI day filter ${days}`, async ({ page, inventory: f }) => {
    await new InventoryUI(page, f).goto('reports/inventory/deadstock');
    await page.getByRole('spinbutton', { name: /items unsold since/i }).fill(String(days));
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  });
}
