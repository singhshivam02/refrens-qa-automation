import { test, expect, expectRejected } from './fixture';

test.use({ inventoryProfile: 'strict' });

test('INV-050 warehouse insufficiency rejects physical deduction without partial stock changes', async ({ inventory: f }) => {
  const item = await f.createItem({ strictControl: true, initialStock: 10, warehouses: [
    { warehouse: f.warehouse(), initialStock: 2 }, { warehouse: f.warehouse(1), initialStock: 8 },
  ] });
  await expectRejected(f.adjust(item, 'SELL', 3), /strict|stock|negative/i);
  await f.expectStock(item, 10);
  await f.expectWarehouse(item, f.warehouse(), 2);
  await f.expectWarehouse(item, f.warehouse(1), 8);
});

test('INV-051 exact available quantity succeeds, next deduction fails', async ({ inventory: f }) => {
  const item = await f.createItem({ strictControl: true, initialStock: 2 });
  await f.adjust(item, 'SELL', 2);
  await f.expectStock(item, 0);
  await expectRejected(f.adjust(item, 'SELL', 1), /strict|stock|negative/i);
  await f.expectStock(item, 0);
});

test('INV-052 concurrent last-unit sales allow exactly one deduction', async ({ inventory: f }) => {
  const item = await f.createItem({ strictControl: true, initialStock: 1 });
  const results = await Promise.allSettled([
    f.createDocument([f.line(item, 1)]), f.createDocument([f.line(item, 1)]),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  expect(String(rejected.reason)).toMatch(/strict|stock|negative|lock|concurrent/i);
  await f.expectStock(item, 0);
});

test('INV-053 insufficient batch stock rejects the whole movement', async ({ inventory: f }) => {
  const item = await f.createItem({ strictControl: true, trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
  const batch = await f.createBatch(item);
  await expectRejected(f.adjust(item, 'SELL', 6, { batches: [{ batch: batch._id, quantity: 6, warehouse: f.warehouse() }] }), /strict|stock|negative/i);
  await f.expectStock(item, 5);
  expect((await f.batches(item))[0].stockInHand).toBe(5);
});

test('INV-070 reservation may exceed stock but physical posting cannot', async ({ inventory: f }) => {
  const item = await f.createItem({ strictControl: true, initialStock: 2 });
  const reservation = await f.createDocument([f.line(item, 5)], {
    billType: 'PROFORMAINV', advanceOptions: { manageInventory: 'BLOCK' },
  });
  await f.expectStock(item, 2, -3);
  await expectRejected(f.createDocument([f.line(item, 5)]), /strict|stock|negative/i);
  await f.expectStock(item, 2, -3);
  await f.cancel(reservation);
  await f.expectStock(item, 2);
});

for (const action of ['reduce', 'cancel', 'delete']) {
  test(`INV-071 consumed purchase cannot ${action} into negative stock`, async ({ inventory: f }) => {
    const item = await f.createItem({ strictControl: true, initialStock: 0 });
    const purchase = await f.createDocument([f.line(item, 5, { rate: 50, amount: 250, subTotal: 250, total: 250 })], { isExpenditure: true });
    await f.expectStock(item, 5);
    await f.createDocument([f.line(item, 4)]);
    await f.expectStock(item, 1);
    const operation = action === 'cancel' ? f.cancel(purchase) : action === 'delete'
      ? f.api.remove(`${f.root}/invoices/${purchase._id}`)
      : f.patchDocument(purchase, { items: [f.line(item, 3)] });
    await expectRejected(operation, /strict|stock|negative|consumed/i);
    await f.expectStock(item, 1);
  });
}

test('INV-091 insufficient package component rejects sale without partial child deductions', async ({ inventory: f }) => {
  const first = await f.createItem({ strictControl: true, initialStock: 10 });
  const second = await f.createItem({ strictControl: true, initialStock: 1 });
  const pack = await f.createItem({ isPackage: true, itemType: null, initialStock: 0, warehouses: [], items: [
    { inventory: first._id, name: first.name, quantity: 2, warehouse: f.warehouse(), costPrice: 50, sellingPrice: 100 },
    { inventory: second._id, name: second.name, quantity: 2, warehouse: f.warehouse(), costPrice: 50, sellingPrice: 100 },
  ] });
  await expectRejected(f.createDocument([f.line(pack, 1)]), /strict|stock|negative|insufficient/i);
  await f.expectStock(first, 10);
  await f.expectStock(second, 1);
});
