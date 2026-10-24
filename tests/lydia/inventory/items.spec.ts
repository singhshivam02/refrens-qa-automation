import { test, expect, expectRejected } from './fixture';
import { InventoryUI } from './ui';

test('INV-001 product creation through UI persists opening stock, prices and thresholds', async ({ page, inventory: f }) => {
  const ui = new InventoryUI(page, f);
  await ui.form();
  await ui.fillItem({ name: f.name('product'), sku: f.name('sku'), costPrice: 50,
    sellingPrice: 100, landedCost: 5, initialStock: 10, reorderPoint: 2, overstockPoint: 20 });
  const item = await ui.saveItem();
  await f.expectStock(item, 10);
  const saved = await f.getItem(item);
  expect(saved).toMatchObject({ costPrice: 50, sellingPrice: 100, landedCost: 5, reorderPoint: 2, overstockPoint: 20 });
  await ui.form(item);
  await expect(ui.field('name')).toHaveValue(f.name('product'));
});

test('INV-002 required item name prevents UI creation', async ({ page, inventory: f }) => {
  const ui = new InventoryUI(page, f);
  await ui.form();
  await ui.fillItem({ sku: f.name('empty-name') });
  await page.getByRole('button', { name: 'Save & Add Item', exact: true }).click();
  await expect(page.getByText('Item Name is required', { exact: false }).first()).toBeVisible();
  const items = await f.api.get(`${f.root}/inventories?sku=${encodeURIComponent(f.name('empty-name'))}`);
  expect(items.data ?? items).toHaveLength(0);
});

test('INV-003 duplicate SKU is rejected without changing the original item', async ({ inventory: f }) => {
  const item = await f.createItem();
  await expectRejected(f.createItem({ sku: item.sku, name: f.name('duplicate') }), /sku|already|unique/i);
  expect(await f.getItem(item)).toMatchObject({ name: item.name, sku: item.sku });
  await f.expectStock(item, 10);
});

for (const [field, error] of [
  ['costPrice', /Buying Price must be 0 or greater/i],
  ['sellingPrice', /Selling Price must be 0 or greater/i],
  ['landedCost', /Landed cost can't be negative/i],
] as const) {
  test(`INV-004 ${field} negative value is rejected by the UI`, async ({ page, inventory: f }) => {
    const ui = new InventoryUI(page, f);
    await ui.form();
    await ui.fillItem({ name: f.name(field), sku: f.name(field), [field]: -1 });
    await page.getByRole('button', { name: 'Save & Add Item', exact: true }).click();
    await expect(page.getByText(error).first()).toBeVisible();
    const items = await f.api.get(`${f.root}/inventories?sku=${encodeURIComponent(f.name(field))}`);
    expect(items.data ?? items).toHaveLength(0);
  });
}

test('INV-005 UI edit survives reload without changing quantities', async ({ page, inventory: f }) => {
  const item = await f.createItem();
  const ui = new InventoryUI(page, f);
  await ui.form(item);
  await ui.fillItem({ name: f.name('edited'), costPrice: 60, sellingPrice: 120 });
  await ui.saveItem(true);
  await page.reload();
  expect(await f.getItem(item)).toMatchObject({ name: f.name('edited'), costPrice: 60, sellingPrice: 120 });
  await f.expectStock(item, 10);
  await ui.form(item);
  await expect(ui.field('name')).toHaveValue(f.name('edited'));
});

test('INV-006 services are not physically stock managed', async ({ inventory: f }) => {
  const item = await f.createItem({ itemType: 'service', isStockManaged: false, initialStock: 0 });
  expect(await f.getItem(item)).toMatchObject({ itemType: 'service', isStockManaged: false, reorderPoint: 0, overstockPoint: 0 });
  await f.createDocument([f.line(item, 3)]);
  await f.expectStock(item, 0);
});

test('INV-007 stock management off and on persists the item classification', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 0 });
  await f.patchItem(item, { isStockManaged: false });
  expect(await f.getItem(item)).toMatchObject({ isStockManaged: false });
  await f.patchItem(item, { isStockManaged: true });
  expect(await f.getItem(item)).toMatchObject({ isStockManaged: true, itemType: 'product' });
  await f.expectStock(item, 0);
});

for (const [reorderPoint, overstockPoint] of [[10, 5], [5, 5], [-1, 5], [5, 0]]) {
  test(`INV-008 invalid thresholds ${reorderPoint}/${overstockPoint} do not persist`, async ({ inventory: f }) => {
    const item = await f.createItem();
    await expectRejected(f.patchItem(item, { reorderPoint, overstockPoint }), /reorder|overstock|less|minimum|validation/i);
    expect(await f.getItem(item)).toMatchObject({ reorderPoint: 2, overstockPoint: 20 });
    await f.expectStock(item, 10);
  });
}

test('INV-010 incoming and outgoing adjustments persist exact deltas and history', async ({ inventory: f }) => {
  const item = await f.createItem();
  await f.adjust(item, 'BUY', 5);
  await f.expectStock(item, 15);
  await f.adjust(item, 'SELL', 3);
  await f.expectStock(item, 12);
  const result = await f.api.get(`${f.root}/inventories/${item._id}/transactions?$limit=100`);
  const movements = result.data ?? result;
  expect(movements).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'BUY', quantity: 5, transactionType: 'UPDATE' }),
    expect.objectContaining({ type: 'SELL', quantity: 3, transactionType: 'UPDATE' }),
  ]));
});

test('INV-011 non-strict negative stock can be settled by an incoming adjustment', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 2 });
  await f.adjust(item, 'SELL', 5);
  await f.expectStock(item, -3);
  await f.adjust(item, 'BUY', 3);
  await f.expectStock(item, 0);
});

test('INV-012 zero-quantity adjustment is rejected without a movement', async ({ inventory: f }) => {
  const item = await f.createItem();
  await expectRejected(f.adjust(item, 'BUY', 0), /quantity/i);
  await f.expectStock(item, 10);
});

test('INV-012 canceling the stock adjustment modal leaves stock unchanged', async ({ page, inventory: f }) => {
  const item = await f.createItem();
  await new InventoryUI(page, f).goto(`inventory/${item._id}`);
  await page.getByRole('button', { name: 'Adjust Stock', exact: true }).click();
  await expect(page.locator('input[name="quantity"]')).toBeVisible();
  await page.locator('input[name="quantity"]').fill('4');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('input[name="quantity"]')).toBeHidden();
  await f.expectStock(item, 10);
});
