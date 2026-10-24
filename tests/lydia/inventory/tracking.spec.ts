import { test, expect, expectRejected } from './fixture';

test.use({ inventoryProfile: 'warehouses' });

test('INV-020 opening allocations and single-warehouse adjustment preserve other locations', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 12, warehouses: [
    { warehouse: f.warehouse(), initialStock: 7 }, { warehouse: f.warehouse(1), initialStock: 5 },
  ] });
  await f.expectStock(item, 12);
  await f.adjust(item, 'BUY', 3, { warehouse: f.warehouse(1) });
  await f.expectStock(item, 15);
  await f.expectWarehouse(item, f.warehouse(), 7);
  await f.expectWarehouse(item, f.warehouse(1), 8);
});

test('INV-021 warehouse transfer conserves aggregate stock', async ({ inventory: f }) => {
  const item = await f.createItem();
  await f.transfer(item, 4);
  await f.expectStock(item, 10);
  await f.expectWarehouse(item, f.warehouse(), 6);
  await f.expectWarehouse(item, f.warehouse(1), 4);
});

test('INV-030 batch creation adds stock to its warehouse and parent item', async ({ inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, warehouses: [], batches: [] });
  await f.expectStock(item, 0);
  const batch = await f.createBatch(item);
  await f.expectStock(item, 5);
  await f.expectWarehouse(item, f.warehouse(), 5);
  expect(await f.batches(item)).toEqual(expect.arrayContaining([
    expect.objectContaining({ _id: batch._id, batchCode: batch.batchCode, stockInHand: 5 }),
  ]));
});

test('INV-031 duplicate batch code is rejected without altering the first batch', async ({ inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
  const batch = await f.createBatch(item);
  await expectRejected(f.createBatch(item, { batchCode: batch.batchCode }), /batch|already|unique/i);
  await f.expectStock(item, 5);
  expect((await f.batches(item)).filter((b) => b.batchCode === batch.batchCode)).toHaveLength(1);
});

test('INV-032 outgoing batch allocation changes only the selected batch', async ({ inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
  const first = await f.createBatch(item);
  const second = await f.createBatch(item);
  await f.adjust(item, 'SELL', 2, { batches: [{ batch: first._id, quantity: 2, warehouse: f.warehouse() }] });
  await f.expectStock(item, 8);
  await expect.poll(async () => (await f.batches(item)).map((b) => [b._id, b.stockInHand]).sort(),
    { timeout: f.timeout }).toEqual([[first._id, 3], [second._id, 5]].sort());
});

test('INV-033 conversion of existing stock into a batch conserves physical quantity', async ({ inventory: f }) => {
  const item = await f.createItem({ initialStock: 5 });
  await f.patchItem(item, { trackingMethod: 'BATCH', batches: [{
    batchName: f.name('migrated'), batchCode: f.name('migrated'), initialStock: 5,
    costPrice: 50, sellingPrice: 100, warehouses: [{ warehouse: f.warehouse(), initialStock: 5 }],
  }] });
  await f.expectStock(item, 5);
  expect(await f.batches(item)).toEqual(expect.arrayContaining([expect.objectContaining({ stockInHand: 5 })]));
});

test('INV-040 serial receipt has an exact stock count and available serials', async ({ inventory: f }) => {
  const serials = [f.name('serial-1'), f.name('serial-2')];
  const item = await f.createItem({ trackingMethod: 'SERIAL', initialStock: 2,
    warehouses: [{ warehouse: f.warehouse(), initialStock: 2, serials }] });
  await f.expectStock(item, 2);
  const saved = await f.serials(item);
  expect(saved.map((s) => s.serialNumber).sort()).toEqual([...serials].sort());
  expect(saved.every((s) => s.status === 'AVAILABLE')).toBe(true);
});

test('INV-041 duplicate serial receipt is rejected and leaves stock unchanged', async ({ inventory: f }) => {
  const serial = f.name('serial-duplicate');
  const item = await f.createItem({ trackingMethod: 'SERIAL', initialStock: 1,
    warehouses: [{ warehouse: f.warehouse(), initialStock: 1, serials: [serial] }] });
  await expectRejected(f.adjust(item, 'BUY', 1, { serials: [serial], reason: 'Purchased' }), /serial|already|duplicate/i);
  await f.expectStock(item, 1);
  expect(await f.serials(item)).toHaveLength(1);
});

test('INV-072 editing split batch allocations restores old splits and applies new quantities', async ({ inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
  const first = await f.createBatch(item);
  const second = await f.createBatch(item);
  const allocation = (batch: string, quantity: number) => ({ batch, item: item._id, quantity, warehouse: f.warehouse() });
  const doc = await f.createDocument([f.line(item, 4, { allocations: [allocation(first._id, 1), allocation(second._id, 3)] })]);
  await f.expectStock(item, 6);
  const saved = await f.api.get(`${f.root}/invoices/${doc._id}`);
  await f.patchDocument(doc, { items: [{ ...saved.items[0], quantity: 3, amount: 300, subTotal: 300, total: 300,
    allocations: [allocation(first._id, 2), allocation(second._id, 1)] }] });
  await f.expectStock(item, 7);
  const batches = await f.batches(item);
  expect(batches.find((b) => b._id === first._id)?.stockInHand).toBe(3);
  expect(batches.find((b) => b._id === second._id)?.stockInHand).toBe(4);
});

test('INV-073 stored document batch metadata remains a snapshot after editing the batch', async ({ inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
  const batch = await f.createBatch(item, { manufacturerName: f.name('manufacturer') });
  const doc = await f.createDocument([f.line(item, 2, { allocations: [{ batch: batch._id,
    item: item._id, warehouse: f.warehouse(), quantity: 2,
    batchData: { batchCode: batch.batchCode, batchName: batch.batchName, manufacturerName: batch.manufacturerName },
  }] })]);
  await f.api.patch(`${f.root}/inventories/${item._id}/batches/${batch._id}`, { batchName: f.name('renamed-batch') });
  const saved = await f.api.get(`${f.root}/invoices/${doc._id}`);
  expect(saved.items[0].allocations[0].batchData).toMatchObject({ batchCode: batch.batchCode,
    batchName: batch.batchName, manufacturerName: batch.manufacturerName });
  await f.expectStock(item, 3);
});

test('INV-130 batch expiry report buckets known expired and future stock', async ({ inventory: f }) => {
  const item = await f.createItem({ trackingMethod: 'BATCH', initialStock: 0, batches: [], warehouses: [] });
  const date = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  await f.createBatch(item, { manufacturingDate: date(-60), expiryDate: date(-7) });
  await f.createBatch(item, { manufacturingDate: date(-60), expiryDate: date(20) });
  await f.expectStock(item, 10);
  await expect.poll(async () => {
    const report = await f.api.get(`${f.root}/inventory/reports/batch-expiry`);
    return report.data.find((r: any) => r.sku === item.sku);
  }, { timeout: f.timeout }).toMatchObject({ totalExpiredStock: 5, bins: {
    expired_0_15: { quantity: 5 }, expiring_16_30: { quantity: 5 },
  } });
});

test('INV-132 transaction custom field persists and appears in the transaction table', async ({ page, inventory: f }) => {
  const fields = f.business.configuration.indexedCustomFields?.INVENTORY_TRANSACTIONS || {};
  const field = Object.entries(fields).find(([, value]: [string, any]) => value.dataType === 'TEXT' && !value.isArchived);
  if (!field || !f.business._systemMeta?.indexedFieldsEnabled) {
    throw new Error('Configuration: configure an active INVENTORY_TRANSACTIONS TEXT field visible in the transaction table');
  }
  const [key] = field;
  const value = f.name('transaction-field');
  const item = await f.createItem();
  await f.adjust(item, 'BUY', 2, { vendorFields: { [key]: value } });
  await f.expectStock(item, 12);
  const transactions = await f.api.get(`${f.root}/inventories/${item._id}/transactions?$limit=100`);
  expect(transactions.data ?? transactions).toEqual(expect.arrayContaining([
    expect.objectContaining({ vendorFields: expect.objectContaining({ [key]: value }) }),
  ]));
  await page.goto(`/app/${f.urlKey}/inventory/${item._id}/transactions`);
  await expect(page.getByRole('cell', { name: value, exact: true })).toBeVisible();
});

for (const condition of ['REUSABLE', 'DAMAGED', 'SCRAPPED']) {
  test(`INV-080 serial-specific sale and ${condition.toLowerCase()} return`, async ({ inventory: f }) => {
    const serials = [f.name('return-serial-1'), f.name('return-serial-2')];
    const item = await f.createItem({ trackingMethod: 'SERIAL', initialStock: 2,
      warehouses: [{ warehouse: f.warehouse(), initialStock: 2, serials }] });
    await f.adjust(item, 'SELL', 1, { serials: [serials[0]], reason: 'Sold' });
    await f.expectStock(item, 1);
    expect((await f.serials(item)).find((s) => s.serialNumber === serials[1])).toMatchObject({ status: 'AVAILABLE' });
    await f.adjust(item, 'BUY', 1, { serials: [serials[0]], reason: 'Returned from Customer', returnCondition: condition });
    await f.expectStock(item, condition === 'REUSABLE' ? 2 : 1);
    const returned = (await f.serials(item)).find((s) => s.serialNumber === serials[0]);
    expect(returned?.status).toBe(condition === 'REUSABLE' ? 'AVAILABLE' : 'UNAVAILABLE');
  });
}

for (const unit of ['DAYS', 'MONTHS', 'YEARS']) {
  test(`INV-081 warranty ${unit.toLowerCase()} starts on sale and resets on reusable return`, async ({ inventory: f }) => {
    const serial = f.name('warranty-serial');
    const item = await f.createItem({ trackingMethod: 'SERIAL', initialStock: 0,
      warehouses: [{ warehouse: f.warehouse(), initialStock: 0, serials: [] }] });
    await f.adjust(item, 'BUY', 1, { serials: [serial], reason: 'Purchased', warrantyPeriod: { value: 1, unit } });
    const before = (await f.serials(item))[0];
    expect(before.soldDate).toBeFalsy();
    await f.adjust(item, 'SELL', 1, { serials: [serial], reason: 'Sold' });
    const sold = (await f.serials(item))[0];
    expect(sold.soldDate).toBeTruthy();
    expect(new Date(sold.warrantyDate).getTime()).toBeGreaterThan(new Date(sold.soldDate).getTime());
    await f.adjust(item, 'BUY', 1, { serials: [serial], reason: 'Returned from Customer', returnCondition: 'REUSABLE' });
    const returned = (await f.serials(item))[0];
    expect(returned.soldDate).toBeFalsy();
    expect(returned.warrantyDate).toBeFalsy();
    await f.adjust(item, 'SELL', 1, { serials: [serial], reason: 'Sold' });
    expect((await f.serials(item))[0].warrantyDate).toBeTruthy();
    await f.expectStock(item, 0);
  });
}
