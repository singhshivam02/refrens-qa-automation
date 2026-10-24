require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InventoryApi, InventoryApiError, InventoryFixture, expectRejected, inspectProfile } = require('../lydia/inventory/fixture');

test('HTTP 200 success:false rejects instead of passing a negative-stock test', async () => {
  const api = new InventoryApi({ fetch: async () => ({
    status: () => 200, ok: () => true, json: async () => ({ success: false, message: 'Strict Control: stock cannot go negative' }),
  }) });
  await assert.rejects(() => api.post('/inventory-batch', {}), InventoryApiError);
  await expectRejected(api.post('/inventory-batch', {}), /negative/);
});
test('writes are submitted once when transport fails', async () => {
  let calls = 0;
  const api = new InventoryApi({ fetch: async () => { calls++; throw new Error('Timed out after server may have committed'); } });
  await assert.rejects(() => api.post('/inventory-batch', {}), /Timed out/);
  assert.equal(calls, 1);
});
test('authorization and server errors cannot satisfy expected validation rejection', async () => {
  for (const status of [401, 403, 500]) {
    const action = Promise.reject(new InventoryApiError(status, 'stock error'));
    await assert.rejects(() => expectRejected(action, /stock/));
  }
});
test('diagnostics omit server response fields other than the error message', async () => {
  const api = new InventoryApi({ fetch: async () => ({ status: () => 400, ok: () => false,
    json: async () => ({ message: 'Invalid quantity', accessToken: 'DO-NOT-LOG', request: { password: 'DO-NOT-LOG' } }),
  }) });
  await assert.rejects(() => api.post('/inventory-batch', {}), (error) => {
    assert.equal(error.detail, 'Invalid quantity');
    assert.equal(String(error).includes('DO-NOT-LOG'), false);
    return true;
  });
});
test('failed workflow retains owned records and does not send cleanup writes', async () => {
  const api = { remove: async () => { throw new Error('must not delete'); } };
  const fixture = new InventoryFixture(api, 'standard', 'test-only', { currency: 'INR' }, []);
  fixture.track('inventories', { _id: 'owned-item' });
  const attachments = [];
  await fixture.cleanup({ status: 'failed', expectedStatus: 'passed', annotations: [], attach: async (name, data) => attachments.push(JSON.parse(data.body)) });
  assert.equal(attachments[0].retained, true);
  assert.deepEqual(attachments[0].records, [{ kind: 'inventories', id: 'owned-item' }]);
});
test('cleanup reverses document dependencies before removing owned inventory', async () => {
  const calls = [];
  const api = {
    get: async (path) => ({ _id: path.split('/').at(-1), status: 'ACTIVE' }),
    patch: async (path) => { calls.push(`cancel:${path.split('/').at(-1)}`); },
    remove: async (path) => { calls.push(`remove:${path.split('/').at(-1)}`); },
  };
  const fixture = new InventoryFixture(api, 'standard', 'test-only', {}, []);
  fixture.track('inventories', { _id: 'item' });
  fixture.track('invoices', { _id: 'purchase' });
  fixture.track('invoices', { _id: 'sale' });
  await fixture.cleanup({ status: 'passed', expectedStatus: 'passed', annotations: [], attach: async () => {} });
  assert.deepEqual(calls, ['cancel:sale', 'cancel:purchase', 'remove:item']);
});
test('cleanup reports errors without replacing the test result', async () => {
  const fixture = new InventoryFixture({ remove: async () => { throw new Error('temporary failure'); } }, 'standard', 'test-only', {}, []);
  fixture.track('inventories', { _id: 'item' });
  const info = { status: 'passed', expectedStatus: 'passed', annotations: [], attach: async () => {} };
  await fixture.cleanup(info);
  assert.equal(info.annotations[0].type, 'cleanup-error');
});
test('missing business configuration fails before any mutation', async (t) => {
  const previous = process.env.INVENTORY_STRICT_URL_KEY;
  process.env.INVENTORY_STRICT_URL_KEY = 'strict-test-only';
  t.after(() => { if (previous === undefined) delete process.env.INVENTORY_STRICT_URL_KEY; else process.env.INVENTORY_STRICT_URL_KEY = previous; });
  const api = { get: async () => ({ _id: 'business', country: 'IN', configuration: {
    manageInventory: true, inventoryOptions: { manageWarehouses: true, strictInventoryControl: false },
  } }) };
  await assert.rejects(() => inspectProfile(api, 'strict'), /strict=true/);
});
