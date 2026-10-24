require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InventoryApi, InventoryApiError, InventoryFixture, expectRejected, inspectProfile } = require('../lydia/inventory/fixture');

test('HTTP 200/201 success:false rejects instead of passing a negative-stock test', async () => {
  for (const status of [200, 201]) {
    const api = new InventoryApi({ fetch: async () => ({
      status: () => status, ok: () => true, json: async () => ({ success: false, message: 'Strict Control: stock cannot go negative' }),
    }) });
    await assert.rejects(() => api.post('/inventory-batch', {}), InventoryApiError);
    await expectRejected(api.post('/inventory-batch', {}), /negative/);
  }
});
test('writes are submitted once when transport fails', async () => {
  let calls = 0;
  const api = new InventoryApi({ fetch: async () => { calls++; throw new Error('Timed out after server may have committed'); } });
  await assert.rejects(() => api.post('/inventory-batch', {}), /Timed out/);
  assert.equal(calls, 1);
});

test('transport diagnostics discard Playwright call logs containing authorization headers and credentials', async () => {
  const api = new InventoryApi({ fetch: async () => {
    throw new Error('Request timed out\nCall log:\nAuthorization: Bearer DO-NOT-LOG\npassword=DO-NOT-LOG');
  } });
  await assert.rejects(() => api.post('/inventory-batch', {}), (error) => {
    assert.match(error.message, /Request timed out/);
    assert.doesNotMatch(error.message, /DO-NOT-LOG|Authorization|password/);
    assert.equal(error.cause, undefined);
    return true;
  });
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
  fixture.track('expenditures', { _id: 'purchase' });
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

test('cleanup archives owned contacts because REST contact deletion is disallowed', async () => {
  const calls = [];
  const api = {
    patch: async (path, payload) => { calls.push({ path, payload }); },
    remove: async () => { throw new Error('REST contact deletion must not be called'); },
  };
  const fixture = new InventoryFixture(api, 'standard', 'test-only', {}, []);
  fixture.track('clients', { _id: 'owned-client' });
  await fixture.cleanup({ status: 'passed', expectedStatus: 'passed', annotations: [], attach: async () => {} });
  assert.deepEqual(calls, [{ path: '/businesses/test-only/clients/owned-client', payload: { isArchived: true } }]);
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

test('purchase fixtures use the expenditure endpoint and its cancellation path', async () => {
  const calls = [];
  const api = {
    post: async (path, payload) => { calls.push({ path, payload }); return { _id: 'purchase' }; },
    patch: async (path, payload) => { calls.push({ path, payload }); },
  };
  const fixture = new InventoryFixture(api, 'strict', 'test-only', { name: 'Test Business' }, []);
  await fixture.createDocument([], { isExpenditure: true });
  assert.equal(calls[0].path, '/businesses/test-only/expenditures');
  assert.equal(calls[0].payload.isExpenditure, undefined);
  assert.equal(calls[0].payload.status, 'UNPAID');
  assert.equal(calls[0].payload.billedTo.name, 'Test Business');
  assert.ok(calls[0].payload.billedBy.name.startsWith(fixture.prefix));
  await fixture.cancel({ _id: 'purchase' });
  assert.equal(calls[1].path, '/businesses/test-only/expenditures/purchase');
});

test('warehouse profile may use a strict-enabled business with explicitly non-strict fixture items', async (t) => {
  const previous = process.env.INVENTORY_WAREHOUSE_URL_KEY;
  process.env.INVENTORY_WAREHOUSE_URL_KEY = 'test-only';
  t.after(() => { if (previous === undefined) delete process.env.INVENTORY_WAREHOUSE_URL_KEY; else process.env.INVENTORY_WAREHOUSE_URL_KEY = previous; });
  const api = { get: async (path) => path.includes('/warehouses?') ? { data: [{ _id: 'one' }, { _id: 'two' }] } : {
    _id: 'business', country: 'IN', configuration: { manageInventory: true,
      inventoryOptions: { manageWarehouses: true, strictInventoryControl: true } },
  } };
  const profile = await inspectProfile(api, 'warehouses');
  const fixture = new InventoryFixture(api, 'warehouses', profile.urlKey, profile.business, profile.warehouses);
  assert.equal(fixture.itemPayload().strictControl, false);
});

test('serial identifiers fit the deployed 50-character limit without losing their distinguishing suffix', () => {
  const fixture = new InventoryFixture({}, 'warehouses', 'test-only', {}, []);
  const first = fixture.serial('return-serial-1');
  const second = fixture.serial('return-serial-2');
  assert.notEqual(first, second);
  assert.match(first, /^[A-Z0-9_-]{3,50}$/);
  assert.ok(fixture.serial('x'.repeat(20)).length <= 50);
  assert.throws(() => fixture.serial('x'.repeat(21)), /suffix/);
});
