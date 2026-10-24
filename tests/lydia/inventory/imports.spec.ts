import { Page } from '@playwright/test';
import { test, expect, InventoryFixture } from './fixture';
import { InventoryUI } from './ui';
const { csv, parseCsv, positiveTimeout } = require('./contracts.cjs');

async function openBulk(page: Page, f: InventoryFixture, label: string) {
  await new InventoryUI(page, f).goto();
  // Disco PopoverButton renders the menu arrow immediately after its main action.
  await page.locator('#addItem + button').click();
  await page.getByText(label, { exact: true }).click();
  await expect(page.locator('input[type="file"]')).toBeAttached();
}

async function upload(page: Page, table: unknown[][]) {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'inventory-regression.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(table)),
  });
}

async function submit(page: Page, f: InventoryFixture) {
  await expect(page.getByText('Data Validated', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Upload File', exact: true }).click();
  const responsePromise = page.waitForResponse((r) =>
    new URL(r.url()).pathname === `${f.root}/inventory-batch` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result?.success).not.toBe(false);
}

async function imported(f: InventoryFixture, sku: string) {
  let item: any;
  await expect.poll(async () => {
    const response = await f.api.get(`${f.root}/inventories?sku=${encodeURIComponent(sku)}&$limit=10`);
    const found = (response.data ?? response).filter((r: any) => r.sku === sku);
    if (found.length === 1) item = f.track('inventories', found[0]);
    return found.length;
  }, { timeout: positiveTimeout(process.env.INVENTORY_BULK_TIMEOUT_MS, 120_000) }).toBe(1);
  return item;
}

const headers = ['name', 'sku', 'currency', 'costPrice', 'sellingPrice', 'initialStock', 'unit', 'isStockManaged', 'itemType'];

test('INV-110 bulk item upload previews before mutation and submits once', async ({ page, inventory: f }) => {
  const sku = f.name('bulk-sku');
  let submissions = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === `${f.root}/inventory-batch`) submissions++; });
  await openBulk(page, f, 'Bulk Upload Inventory');
  await upload(page, [headers, [f.name('Bulk, "quoted" item'), sku, 'INR', 25, 75, 8, 'NOS', true, 'product']]);
  await expect(page.getByText('Preview of your uploaded file', { exact: true })).toBeVisible();
  const before = await f.api.get(`${f.root}/inventories?sku=${encodeURIComponent(sku)}`);
  expect(before.data ?? before).toHaveLength(0);
  expect(submissions).toBe(0);
  await submit(page, f);
  const item = await imported(f, sku);
  await f.expectStock(item, 8);
  expect(await f.getItem(item)).toMatchObject({ costPrice: 25, sellingPrice: 75 });
  expect(submissions).toBe(1);
});

test('INV-111 invalid import exposes an error CSV without creating inventory', async ({ page, inventory: f }) => {
  const sku = f.name('invalid-bulk');
  await openBulk(page, f, 'Bulk Upload Inventory');
  await upload(page, [headers, ['', sku, 'INR', -1, 75, 8, 'NOS', true, 'product']]);
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByText('Download Error Report', { exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Error report download has no stream');
  const buffers: Buffer[] = [];
  for await (const part of stream) buffers.push(Buffer.from(part));
  const report = parseCsv(Buffer.concat(buffers).toString('utf8'));
  expect(report.flat()).toContain(sku);
  expect(report.flat().join(' ')).toMatch(/name|price|error|invalid/i);
  const result = await f.api.get(`${f.root}/inventories?sku=${encodeURIComponent(sku)}`);
  expect(result.data ?? result).toHaveLength(0);
});

test('INV-112 bulk edit preserves omitted fields and existing stock', async ({ page, inventory: f }) => {
  const item = await f.createItem({ hsn: '1234', landedCost: 5, description: 'Preserve this description' });
  await f.indexed(item);
  await openBulk(page, f, 'Bulk Update Inventory');
  await upload(page, [['sku', 'name', 'sellingPrice'], [item.sku, f.name('bulk-edited'), 125]]);
  await submit(page, f);
  await expect.poll(async () => (await f.getItem(item)).sellingPrice,
    { timeout: positiveTimeout(process.env.INVENTORY_BULK_TIMEOUT_MS, 120_000) }).toBe(125);
  expect(await f.getItem(item)).toMatchObject({ name: f.name('bulk-edited'), hsn: '1234',
    landedCost: 5, description: 'Preserve this description', costPrice: 50 });
  await f.expectStock(item, 10);
});

for (const mode of ['Final Stock', 'Adjusted Quantity']) {
  test(`INV-113 bulk adjustment using ${mode} applies the intended quantity`, async ({ page, inventory: f }) => {
    const item = await f.createItem();
    await f.indexed(item);
    await openBulk(page, f, 'Bulk Adjust Inventory');
    await upload(page, [['Name', 'Sku', 'Currency', 'Price', mode, 'Reason'], [item.name, item.sku, 'INR', 50, 3, 'Adjust stock']]);
    await submit(page, f);
    await f.expectStock(item, mode === 'Final Stock' ? 3 : 13);
  });
}

test('INV-114 bulk adjustment with both final and delta columns fails validation', async ({ page, inventory: f }) => {
  const item = await f.createItem();
  await f.indexed(item);
  await openBulk(page, f, 'Bulk Adjust Inventory');
  await upload(page, [['Name', 'Sku', 'Currency', 'Price', 'Final Stock', 'Adjusted Quantity'],
    [item.name, item.sku, 'INR', 50, 3, 2]]);
  await expect(page.getByText('Download Error Report', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload File', exact: true })).toBeHidden();
  await f.expectStock(item, 10);
});

test('INV-115 package CSV groups child rows into one package with component ratios', async ({ page, inventory: f }) => {
  const first = await f.createItem({ initialStock: 20 });
  const second = await f.createItem({ initialStock: 15 });
  await f.indexed(first); await f.indexed(second);
  const sku = f.name('imported-package');
  await openBulk(page, f, 'Bulk Upload Package Items');
  await upload(page, [['sku', 'name', 'currency', 'costPrice', 'sellingPrice', 'itemSku', 'itemQuantity'],
    [sku, f.name('package'), 'INR', 100, 200, first.sku, 2],
    [sku, f.name('package'), 'INR', 100, 200, second.sku, 3]]);
  await submit(page, f);
  const pack = await imported(f, sku);
  const saved = await f.getItem(pack);
  expect(saved.isPackage).toBe(true);
  expect(saved.items.map((i: any) => i.quantity).sort()).toEqual([2, 3]);
  await f.expectStock(pack, 5);
});

test('INV-116 item CSV template and import support the configured TEXT custom field', async ({ page, inventory: f }) => {
  const fields = f.business.configuration.indexedCustomFields?.INVENTORY || {};
  const field = Object.entries(fields).find(([, value]: [string, any]) => value.dataType === 'TEXT' && !value.isArchived);
  if (!field || !f.business._systemMeta?.indexedFieldsEnabled) {
    throw new Error('Configuration: enable indexed fields and configure an active INVENTORY TEXT custom field');
  }
  const [key, definition] = field as [string, any];
  const label = definition.name || definition.label;
  if (!label) throw new Error('Configured inventory TEXT field has no name/label');
  const sku = f.name('custom-bulk');
  const value = f.name('custom-value');
  await openBulk(page, f, 'Bulk Upload Inventory');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByText('Download Sample File Format', { exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Template download has no stream');
  const buffers: Buffer[] = [];
  for await (const part of stream) buffers.push(Buffer.from(part));
  expect(parseCsv(Buffer.concat(buffers).toString('utf8'))[0]).toContain(label);
  await upload(page, [[...headers, label], [f.name('custom-item'), sku, 'INR', 25, 75, 8, 'NOS', true, 'product', value]]);
  await submit(page, f);
  const item = await imported(f, sku);
  expect((await f.getItem(item)).vendorFields?.[key]).toBe(value);
});

test.describe('Warehouse batch imports', () => {
  test.use({ inventoryProfile: 'warehouses' });
  test('INV-131 batch CSV splits stock across warehouses and persists a custom field', async ({ page, inventory: f }) => {
    const fields = f.business.configuration.indexedCustomFields?.INVENTORY_BATCHES || {};
    const field = Object.entries(fields).find(([, value]: [string, any]) => value.dataType === 'TEXT' && !value.isArchived);
    if (!field || !f.business._systemMeta?.indexedFieldsEnabled) {
      throw new Error('Configuration: enable indexed fields and configure an active INVENTORY_BATCHES TEXT custom field');
    }
    const [key, definition] = field as [string, any];
    const label = definition.name || definition.label;
    if (!label) throw new Error('Batch TEXT custom field has no name/label');
    const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
    await f.indexed(item);
    const code = f.name('bulk-batch');
    const value = f.name('batch-custom-value');
    await openBulk(page, f, 'Bulk Upload Batches');
    await upload(page, [['SKU ID', 'Batch Code', 'Batch Name', 'Cost Price', 'Selling Price',
      `warehouseStock.${f.warehouses[0].warehouseId}`, `warehouseStock.${f.warehouses[1].warehouseId}`, label],
    [item.sku, code, f.name('batch'), 25, 75, 3, 4, value]]);
    await submit(page, f);
    await expect.poll(async () => (await f.batches(item)).find((b) => b.batchCode === code),
      { timeout: positiveTimeout(process.env.INVENTORY_BULK_TIMEOUT_MS, 120_000) })
      .toMatchObject({ stockInHand: 7, vendorFields: { [key]: value } });
    await f.expectStock(item, 7);
    await f.expectWarehouse(item, f.warehouse(), 3);
    await f.expectWarehouse(item, f.warehouse(1), 4);
  });
});
