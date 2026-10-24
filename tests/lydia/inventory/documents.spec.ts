import { test, expect } from './fixture';
import { InventoryUI } from './ui';

const { stockAfter, referenceId } = require('./contracts.cjs');

test('INV-059 UI invoice creation selects inventory and quantity editing persists stock linkage', async ({ page, inventory: f }) => {
  test.slow();
  if (f.business.configuration.invoice?.[0]?.manageInventory !== 'UPDATE') {
    throw new Error('Configuration: standard test business needs invoice[0].manageInventory=UPDATE for UI invoice tests');
  }
  const item = await f.createItem();
  await f.indexed(item);
  const ui = new InventoryUI(page, f);
  await ui.goto('invoices/new');
  await page.locator('input[name="invoiceNumber"]').fill(f.name('ui-invoice'));
  await page.getByRole('button', { name: 'Add New Client', exact: true }).click();
  const control = page.locator('.disco-select-creatable__control').filter({ hasText: 'Business Name' });
  await control.click();
  await page.keyboard.type(f.name('ui-customer'));
  await page.locator('.disco-select-creatable__option').filter({ hasText: f.name('ui-customer') }).click();
  await page.getByPlaceholder('City/Town Name', { exact: true }).fill('Mumbai');
  const clientResponse = page.waitForResponse((r) => new URL(r.url()).pathname === `${f.root}/clients` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  const client = await clientResponse;
  expect(client.ok()).toBe(true);
  f.track('clients', await client.json());
  await page.locator('[gridkey="name"] .disco-select-creatable__control').first().click();
  await page.keyboard.type(item.name);
  // Select the existing item, rather than the creatable new-item option.
  await page.locator('.disco-select-creatable__option').filter({ hasText: item.sku }).click();
  await page.locator('input[name="items[0].quantity"]').fill('3');
  const created = page.waitForResponse((r) => new URL(r.url()).pathname === `${f.root}/invoices` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save & Continue', exact: true }).click();
  const response = await created;
  expect(response.ok()).toBe(true);
  const doc = f.track('invoices', await response.json());
  await f.expectStock(item, 7);
  const saved = await f.api.get(`${f.root}/invoices/${doc._id}`);
  expect(referenceId(saved.items[0].inventory)).toBe(item._id);
  await ui.goto(`invoices/${doc._id}/edit`);
  await page.locator('input[name="items[0].quantity"]').fill('5');
  const edited = page.waitForResponse((r) => new URL(r.url()).pathname === `${f.root}/invoices/${doc._id}` && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save & Continue', exact: true }).click();
  expect((await edited).ok()).toBe(true);
  await f.expectStock(item, 5);
  await page.reload();
  expect(referenceId((await f.api.get(`${f.root}/invoices/${doc._id}`)).items[0].inventory)).toBe(item._id);
});

for (const mode of ['UPDATE', 'BLOCK', 'IGNORE']) {
  test(`INV-060 ${mode} invoice create, quantity edit, cancellation and repeat cancellation`, async ({ inventory: f }) => {
    const item = await f.createItem();
    const doc = await f.createDocument([f.line(item, 3)], { advanceOptions: { manageInventory: mode } });
    let expected = stockAfter(10, 3, mode);
    await f.expectStock(item, expected.stockInHand, expected.stock);
    const saved = await f.api.get(`${f.root}/invoices/${doc._id}`);
    expect(referenceId(saved.items[0].inventory)).toBe(item._id);
    await f.patchDocument(doc, { items: [{ ...saved.items[0], quantity: 5, amount: 500, subTotal: 500, total: 500 }] });
    expected = stockAfter(10, 5, mode);
    await f.expectStock(item, expected.stockInHand, expected.stock);
    await f.cancel(doc);
    await f.expectStock(item, 10);
    await f.cancel(doc);
    await f.expectStock(item, 10);
  });
}

test('INV-061 purchase, sale, edited sale and physical return reconcile stock', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 0 });
  await f.createDocument([f.line(item, 10, { rate: 50, amount: 500, subTotal: 500, total: 500 })], { isExpenditure: true });
  await f.expectStock(item, 10);
  const sale = await f.createDocument([f.line(item, 4)]);
  await f.expectStock(item, 6);
  const saved = await f.api.get(`${f.root}/invoices/${sale._id}`);
  await f.patchDocument(sale, { items: [{ ...saved.items[0], quantity: 6, amount: 600, subTotal: 600, total: 600 }] });
  await f.expectStock(item, 4);
  await f.createDocument([f.line(item, 2, { updateStock: true })], { billType: 'CREDITNOTE' });
  await f.expectStock(item, 6);
});

test('INV-062 replacing an invoice item restores the old item and deducts the new one', async ({ inventory: f }) => {
  const oldItem = await f.createItem();
  const newItem = await f.createItem();
  const doc = await f.createDocument([f.line(oldItem, 3)]);
  await f.expectStock(oldItem, 7);
  await f.patchDocument(doc, { items: [f.line(newItem, 2)] });
  await f.expectStock(oldItem, 10);
  await f.expectStock(newItem, 8);
});

test('INV-063 deleting a sales document restores physical stock exactly once', async ({ inventory: f }) => {
  const item = await f.createItem();
  const doc = await f.createDocument([f.line(item, 4)]);
  await f.expectStock(item, 6);
  await f.api.remove(`${f.root}/invoices/${doc._id}`);
  // Removed documents must not be canceled again by cleanup.
  f.records.splice(f.records.findIndex((r) => r.id === doc._id), 1);
  await f.expectStock(item, 10);
});

for (const billType of ['QUOTATION', 'PROFORMAINV', 'SALESORDER', 'PURCHASEORDER', 'DELIVERYCHALLAN']) {
  test(`INV-064 ${billType} reservation and cancellation preserve physical stock`, async ({ inventory: f }) => {
    const item = await f.createItem();
    const doc = await f.createDocument([f.line(item, 3)], { billType, advanceOptions: { manageInventory: 'BLOCK' } });
    await f.expectStock(item, 10, billType === 'PURCHASEORDER' ? 13 : 7);
    await f.cancel(doc);
    await f.expectStock(item, 10);
  });
}

for (const billType of ['CREDITNOTE', 'DEBITNOTE']) {
  test(`INV-065 ${billType} physical and monetary-only lines participate independently`, async ({ inventory: f }) => {
    const physical = await f.createItem();
    const monetary = await f.createItem();
    const doc = await f.createDocument([
      f.line(physical, 2, { updateStock: true }), f.line(monetary, 3, { updateStock: false }),
    ], { billType });
    await f.expectStock(physical, billType === 'CREDITNOTE' ? 12 : 8);
    await f.expectStock(monetary, 10);
    const saved = await f.api.get(`${f.root}/invoices/${doc._id}`);
    expect(saved.items).toHaveLength(2);
    expect(saved.items.map((i: any) => i.updateStock)).toEqual([true, false]);
    expect(saved.items[0].amount).toBe(200);
    expect(saved.items[1].amount).toBe(300);
    await f.cancel(doc);
    await f.expectStock(physical, 10);
    await f.expectStock(monetary, 10);
  });
}

test('INV-066 service and one-time invoice lines do not move linked product stock', async ({ inventory: f }) => {
  const product = await f.createItem();
  const service = await f.createItem({ itemType: 'service', initialStock: 0, isStockManaged: false });
  const oneTime = f.line(product, 2, { name: f.name('one-time'), sku: '', inventory: null, isStockManaged: false });
  await f.createDocument([f.line(service, 3), oneTime]);
  await f.expectStock(service, 0);
  await f.expectStock(product, 10);
});

test('INV-090 package sale deducts component ratios and recomputes package availability', async ({ inventory: f }) => {
  const first = await f.createItem({ initialStock: 20 });
  const second = await f.createItem({ initialStock: 15 });
  const pack = await f.createItem({ isPackage: true, itemType: null, initialStock: 0, items: [
    { inventory: first._id, name: first.name, quantity: 2, costPrice: 50, sellingPrice: 100 },
    { inventory: second._id, name: second.name, quantity: 3, costPrice: 50, sellingPrice: 100 },
  ] });
  await f.expectStock(pack, 5);
  await f.createDocument([f.line(pack, 2)]);
  await f.expectStock(first, 16);
  await f.expectStock(second, 9);
  await f.expectStock(pack, 3);
});
