import { test, expect, expectRejected } from './fixture';
import { InventoryUI } from './ui';

test.use({ inventoryProfile: 'uom' });

test('INV-100 alternate purchase and sale units reconcile to base units', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 0, unit: 'NOS',
    alternateUnits: [{ unitCode: 'BOX', factor: 10 }], defaultPurchaseUnit: 'BOX', defaultSalesUnit: 'NOS' });
  await f.createDocument([f.line(item, 2, { unit: 'BOX', rate: 500, amount: 1000, subTotal: 1000, total: 1000 })], { isExpenditure: true });
  await f.expectStock(item, 20);
  await f.createDocument([f.line(item, 1, { unit: 'BOX', rate: 1000, amount: 1000, subTotal: 1000, total: 1000 })]);
  await f.expectStock(item, 10);
  const response = await f.api.get(`${f.root}/inventories/${item._id}/transactions?$limit=100`);
  expect(response.data ?? response).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'BUY', quantity: 20, transactionQuantity: 2, conversionFactor: 10 }),
    expect.objectContaining({ type: 'SELL', quantity: 10, transactionQuantity: 1, conversionFactor: 10 }),
  ]));
});

test('INV-101 price edit leaves base quantities unchanged', async ({ inventory: f }) => {
  const item = await f.createItem({ alternateUnits: [{ unitCode: 'BOX', factor: 10 }] });
  await f.patchItem(item, { costPrice: 75, sellingPrice: 125 });
  await f.expectStock(item, 10);
  expect(await f.getItem(item)).toMatchObject({ costPrice: 75, sellingPrice: 125 });
});

for (const factor of [0, -1, 100001, 0.0001]) {
  test(`INV-102 invalid alternate-unit factor ${factor} is rejected`, async ({ inventory: f }) => {
    const item = await f.createItem();
    await expectRejected(f.patchItem(item, { alternateUnits: [{ unitCode: 'BOX', factor }] }), /factor|decimal|positive|greater|100000|validation/i);
    await f.expectStock(item, 10);
    expect((await f.getItem(item)).alternateUnits).toHaveLength(0);
  });
}

test('INV-102 serial tracking disables alternate units in the UI', async ({ page, inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'SERIAL', initialStock: 0,
    warehouses: [{ warehouse: f.warehouse(), initialStock: 0, serials: [] }],
  });
  await new InventoryUI(page, f).form(item);
  await expect(page.getByRole('button', { name: 'Add Alternate Unit', exact: true })).toBeDisabled();
  await expect(page.getByText("Alternate units aren't available for serial-tracked items.", { exact: true })).toBeVisible();
  await f.expectStock(item, 0);
});
