const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rows, referenceId, stockAfter, csv, parseCsv, positiveTimeout } = require('../lydia/inventory/contracts.cjs');

test('UPDATE changes both physical and reserved balances', () => {
  assert.deepEqual(stockAfter(10, 3, 'UPDATE'), { stockInHand: 7, stock: 7 });
});
test('BLOCK allows reservations to exceed availability without physical deduction', () => {
  assert.deepEqual(stockAfter(2, 5, 'BLOCK'), { stockInHand: 2, stock: -3 });
});
test('IGNORE changes neither quantity', () => {
  assert.deepEqual(stockAfter(10, 5, 'IGNORE'), { stockInHand: 10, stock: 10 });
});
test('purchase direction is opposite sales direction', () => {
  assert.deepEqual(stockAfter(0, 5, 'UPDATE', true), { stockInHand: 5, stock: 5 });
  assert.deepEqual(stockAfter(2, 5, 'BLOCK', true), { stockInHand: 2, stock: 7 });
  assert.throws(() => stockAfter(0, 1, 'UPDTE'), /Unknown stock mode/);
});
test('resource references support populated and plain IDs, and reject missing IDs', () => {
  assert.equal(referenceId('item1'), 'item1');
  assert.equal(referenceId({ _id: 'item1', name: 'Product' }), 'item1');
  assert.throws(() => referenceId({ name: 'Product' }), /Expected a resource ID/);
});
test('list parsing does not silently turn an API error into an empty list', () => {
  assert.deepEqual(rows([{ _id: 'one' }]), [{ _id: 'one' }]);
  assert.deepEqual(rows({ data: [{ _id: 'two' }] }), [{ _id: 'two' }]);
  assert.throws(() => rows({ message: 'Forbidden' }), /Expected an array/);
});
test('CSV round-trip preserves quoted names, commas, newlines, Unicode and empty fields', () => {
  const table = [['SKU', 'Name', 'Description'], ['SKU-1', 'Bolt, "M10"', 'Two\nlines'], ['SKU-2', '₹商品', '']];
  assert.deepEqual(parseCsv(csv(table)), table);
  assert.deepEqual(parseCsv('\uFEFF'+csv(table)), table);
});
test('CSV parser rejects truncated quoted exports', () => {
  assert.throws(() => parseCsv('SKU,Name\r\nSKU-1,"unfinished'), /Unterminated CSV field/);
});
test('polling timeouts reject zero, fractional and invalid values', () => {
  assert.equal(positiveTimeout(undefined, 60000), 60000);
  assert.equal(positiveTimeout('120000', 60000), 120000);
  for (const value of ['0', '-1', '1.5', 'abc', 'Infinity']) assert.throws(() => positiveTimeout(value, 60000));
});
