import { test as base, expect, APIRequestContext, request, TestInfo } from '@playwright/test';
import { randomUUID } from 'crypto';

const { initializeRuntime } = require('../../../config/runtime.cjs');
const { rows, referenceId, positiveTimeout } = require('./contracts.cjs');

export type Profile = 'standard' | 'warehouses' | 'strict' | 'uom';
export type RecordData = { _id: string; [key: string]: any };
export const PROFILE_KEYS: Record<Profile, string> = {
  standard: 'INVENTORY_URL_KEY', warehouses: 'INVENTORY_WAREHOUSE_URL_KEY',
  strict: 'INVENTORY_STRICT_URL_KEY', uom: 'INVENTORY_UOM_URL_KEY',
};

export class InventoryApiError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`Inventory request failed (${status}): ${detail}`);
  }
}

export class InventoryApi {
  constructor(readonly context: APIRequestContext) {}
  async send(method: string, endpoint: string, data?: unknown): Promise<any> {
    // Never retry writes: a response timeout does not prove the write failed.
    const response = await this.context.fetch(endpoint, { method, data, timeout: 30_000 });
    const body = await response.json().catch(() => null);
    if (!response.ok() || body?.success === false) {
      throw new InventoryApiError(response.status(), String(body?.message || `HTTP ${response.status()}`));
    }
    return body;
  }
  get(endpoint: string) { return this.send('GET', endpoint); }
  post(endpoint: string, data: unknown) { return this.send('POST', endpoint, data); }
  patch(endpoint: string, data: unknown) { return this.send('PATCH', endpoint, data); }
  remove(endpoint: string) { return this.send('DELETE', endpoint); }
}

export async function connectInventory(): Promise<InventoryApi> {
  const runtime = initializeRuntime();
  const email = process.env.QA_EMAIL || process.env.TEST_EMAIL;
  const password = process.env.QA_PASSWORD || process.env.TEST_PASSWORD;
  if (!email || !password) throw new Error('Configure QA_EMAIL and QA_PASSWORD for local JWT authentication');
  const auth = await request.newContext({ baseURL: runtime.apiBaseURL });
  try {
    const response = await auth.post('/authentication', { data: { strategy: 'local', email, password } });
    if (!response.ok()) throw new Error(`Inventory authentication failed: HTTP ${response.status()}`);
    const body = await response.json();
    if (!body.accessToken) throw new Error('Authentication response did not contain an accessToken');
    return new InventoryApi(await request.newContext({
      baseURL: runtime.apiBaseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${body.accessToken}` },
    }));
  } finally { await auth.dispose(); }
}

export async function inspectProfile(api: InventoryApi, profile: Profile) {
  const key = PROFILE_KEYS[profile];
  const urlKey = process.env[key] || (profile === 'standard' ? process.env.DEFAULT_URL_KEY : '');
  if (!urlKey || urlKey.startsWith('your-')) throw new Error(`Configuration: set ${key} to a dedicated Indian test business`);
  const business = await api.get(`/businesses/${encodeURIComponent(urlKey)}`) as RecordData;
  const config = business.configuration;
  if (!config || typeof config !== 'object') throw new Error(`${profile}: business response has no populated configuration`);
  const options = config.inventoryOptions || {};
  const warehouse = profile !== 'standard';
  if (config.manageInventory !== true || !!options.manageWarehouses !== warehouse ||
      !!options.strictInventoryControl !== (profile === 'strict') ||
      (profile === 'uom' && options.isUomEnabled !== true)) {
    throw new Error(`${profile}: enable inventory; warehouses=${warehouse}; strict=${profile === 'strict'}; UOM=${profile === 'uom' ? 'true' : 'optional'}. Tests do not change business settings.`);
  }
  if ((business.country || business.billedBy?.country) !== 'IN') {
    throw new Error(`${profile}: inventory document fixtures require an Indian business`);
  }
  const warehouses: RecordData[] = warehouse ? rows(await api.get(
    `/businesses/${encodeURIComponent(urlKey)}/warehouses?isActive=true&isArchived=false&$limit=100`,
  )) : [];
  if (warehouse && warehouses.length < 2) throw new Error(`${profile}: configure at least two active warehouses`);
  return { urlKey, business, warehouses };
}

export class InventoryFixture {
  readonly prefix = `INVQA-${randomUUID()}`;
  readonly records: { kind: string; id: string }[] = [];
  readonly timeout = positiveTimeout(process.env.INVENTORY_POLL_TIMEOUT_MS, 60_000);
  readonly root: string;
  constructor(readonly api: InventoryApi, readonly profile: Profile,
    readonly urlKey: string, readonly business: RecordData, readonly warehouses: RecordData[]) {
    this.root = `/businesses/${encodeURIComponent(urlKey)}`;
  }
  name(suffix: string) { return `${this.prefix}-${suffix}`; }
  track(kind: string, record: RecordData) {
    if (!record?._id) throw new Error(`No _id returned for ${kind}`);
    if (!this.records.some((r) => r.kind === kind && r.id === record._id)) this.records.push({ kind, id: record._id });
    return record;
  }
  warehouse(index = 0) { return referenceId(this.warehouses[index]); }
  itemPayload(overrides: Record<string, any> = {}) {
    const initialStock = overrides.initialStock ?? 10;
    return {
      name: this.name(`item-${this.records.length}`), sku: this.name(`sku-${this.records.length}`),
      itemType: 'product', currency: this.business.currency || 'INR',
      isStockManaged: true, isSalesItem: true, trackingMethod: 'NONE',
      initialStock, costPrice: 50, sellingPrice: 100, gstRate: 0, unit: 'NOS',
      reorderPoint: 2, overstockPoint: 20,
      ...(this.warehouses.length ? { warehouses: [{ warehouse: this.warehouse(), initialStock }] } : {}),
      ...overrides,
    };
  }
  async createItem(overrides: Record<string, any> = {}) {
    const item = this.track('inventories', await this.api.post(`${this.root}/inventories`, this.itemPayload(overrides)));
    return item;
  }
  getItem(item: RecordData) { return this.api.get(`${this.root}/inventories/${item._id}`) as Promise<RecordData>; }
  patchItem(item: RecordData, data: Record<string, any>) { return this.api.patch(`${this.root}/inventories/${item._id}`, data); }
  async expectStock(item: RecordData, stockInHand: number, stock = stockInHand) {
    await expect.poll(async () => {
      const actual = await this.getItem(item);
      return { stockInHand: actual.stockInHand, stock: actual.stock };
    }, { timeout: this.timeout }).toEqual({ stockInHand, stock });
  }
  async expectWarehouse(item: RecordData, warehouse: string, stockInHand: number, stock = stockInHand) {
    await expect.poll(async () => {
      const current = await this.getItem(item);
      const row = current.warehouses?.find((w: any) => referenceId(w.warehouse) === warehouse);
      return row && { stockInHand: row.stockInHand, stock: row.stock };
    }, { timeout: this.timeout }).toEqual({ stockInHand, stock });
  }
  async indexed(item: RecordData) {
    await expect.poll(async () => {
      const result = rows(await this.api.get(`${this.root}/inventories?sku=${encodeURIComponent(item.sku)}&$limit=10`));
      return result.some((r: RecordData) => r._id === item._id);
    }, { timeout: this.timeout }).toBe(true);
  }
  adjust(item: RecordData, type: 'BUY' | 'SELL', quantity: number, values: Record<string, any> = {}) {
    return this.api.post(`${this.root}/inventory-batch`, {
      type: 'MANUALADJUSTINVENTORY',
      values: { inventory: item._id, type, quantity, reason: 'Adjust stock',
        ...(this.warehouses.length ? { warehouse: this.warehouse() } : {}), ...values },
    });
  }
  transfer(item: RecordData, quantity: number, overrides: Record<string, any> = {}) {
    return this.api.post(`${this.root}/inventory-batch`, {
      type: 'TRANSFERSTOCK', transferStockPayload: {
        _id: item._id, transferFrom: this.warehouse(), transferTo: this.warehouse(1),
        transferQty: quantity, reason: this.name('transfer'), ...overrides,
      },
    });
  }
  async createBatch(item: RecordData, overrides: Record<string, any> = {}) {
    const suffix = randomUUID().slice(0, 8);
    return this.api.post(`${this.root}/inventories/${item._id}/batches`, {
      batchName: this.name(suffix), batchCode: this.name(suffix), costPrice: 50, sellingPrice: 100,
      initialStock: 5, warehouses: [{ warehouse: this.warehouse(), initialStock: 5 }], ...overrides,
    }) as Promise<RecordData>;
  }
  async batches(item: RecordData): Promise<RecordData[]> {
    return rows(await this.api.get(`${this.root}/inventories/${item._id}/batches?$limit=100`));
  }
  async serials(item: RecordData): Promise<RecordData[]> {
    return rows(await this.api.get(`${this.root}/inventories/${item._id}/serials?$limit=100`));
  }
  line(item: RecordData, quantity: number, extra: Record<string, any> = {}) {
    const rate = item.sellingPrice ?? 100;
    return {
      name: item.name, sku: item.sku, inventory: item._id, quantity, rate,
      amount: quantity * rate, subTotal: quantity * rate, total: quantity * rate,
      itemType: item.itemType || 'product', isStockManaged: item.isStockManaged,
      trackingMethod: item.trackingMethod || 'NONE', unit: item.unit || 'NOS',
      gstRate: 0, igst: 0, cgst: 0, sgst: 0, group: false,
      discount: { discountType: 'PERCENTAGE', amount: 0 }, custom: {},
      params: { isPackage: !!item.isPackage, packageItems: item.items || [] },
      warehouse: this.warehouses.length ? this.warehouse() : null,
      allocations: null,
      ...extra,
    };
  }
  documentPayload(items: Record<string, any>[], overrides: Record<string, any> = {}) {
    const date = new Date().toISOString().slice(0, 10);
    return {
      billType: 'INVOICE', invoiceType: 'INVOICE', invoiceTitle: 'Invoice',
      status: 'ACTIVE', invoiceNumber: this.name(`doc-${randomUUID().slice(0, 8)}`),
      invoiceDate: date, dueDate: date, dueInDays: 0, currency: 'INR', locale: 'en-IN',
      taxType: 'INDIA', taxName: 'GST', igst: false, placeOfSupply: '27', supplyType: 'B2C',
      billedBy: { name: this.business.name, country: 'IN', state: 'Maharashtra', gstState: '27',
        city: 'Mumbai', street: 'QA Test', pincode: '400001', customFields: [], additionalIds: [] },
      billedTo: { name: this.name('customer'), country: 'IN', state: 'Maharashtra', gstState: '27',
        city: 'Mumbai', street: 'QA Test', pincode: '400001', clientType: 'INDIVIDUAL',
        customFields: [], additionalIds: [] },
      items, columns: ['name', 'quantity', 'rate', 'amount', 'total'].map((key) => ({
        key, label: key, isHidden: false, system: true, dataType: key === 'name' ? 'text' : 'number',
      })),
      advanceOptions: { manageInventory: 'UPDATE' },
      discount: { discountMethod: 'EQUAL', discountType: 'PERCENTAGE' },
      terms: [], cesses: [], attachments: [], additionalCharges: [], extraTotalFields: [],
      customFooters: [], customHeaders: [], linkedInvoices: [],
      ...overrides,
    };
  }
  async createDocument(items: Record<string, any>[], overrides: Record<string, any> = {}) {
    const doc = this.track('invoices', await this.api.post(`${this.root}/invoices`, this.documentPayload(items, overrides)));
    // Document hooks can create a contact. Only claim one whose persisted name
    // proves this test owns it; never clean up an existing tenant contact.
    for (const contact of [doc.client, doc.vendor].filter(Boolean)) {
      const record = await this.api.get(`${this.root}/clients/${referenceId(contact)}`);
      if (record.name?.startsWith(this.prefix)) this.track('clients', record);
    }
    return doc;
  }
  async patchDocument(doc: RecordData, changes: Record<string, any>) {
    return this.api.patch(`${this.root}/invoices/${doc._id}`, changes);
  }
  async cancel(doc: RecordData) { return this.patchDocument(doc, { status: 'CANCELED' }); }
  async cleanup(testInfo: TestInfo) {
    const failed = testInfo.status !== testInfo.expectedStatus;
    await testInfo.attach('inventory-records.json', { body: JSON.stringify({
      profile: this.profile, business: this.urlKey, prefix: this.prefix, retained: failed, records: this.records,
    }, null, 2), contentType: 'application/json' });
    if (failed) return;
    const errors: string[] = [];
    // Reverse dependency order: notes/sales before purchases, packages before children.
    const reversed = [...this.records].reverse();
    const cleanupOrder = ['invoices', 'inventories', 'clients', 'warehouses']
      .flatMap((kind) => reversed.filter((record) => record.kind === kind));
    for (const record of cleanupOrder) {
      try {
        if (record.kind === 'invoices') {
          const doc = await this.api.get(`${this.root}/invoices/${record.id}`);
          if (doc.status !== 'CANCELED') await this.cancel(doc);
        } else if (record.kind === 'warehouses') {
          await this.api.patch(`${this.root}/warehouses/${record.id}`, { isActive: false });
        } else await this.api.remove(`${this.root}/${record.kind}/${record.id}`);
      } catch (err) {
        if (err instanceof InventoryApiError && err.status === 404) continue;
        errors.push(`${record.kind}/${record.id}: ${String(err)}`);
      }
    }
    if (errors.length) {
      testInfo.annotations.push({ type: 'cleanup-error', description: `${errors.length} resources retained` });
      await testInfo.attach('inventory-cleanup-errors.json', { body: JSON.stringify(errors), contentType: 'application/json' });
    }
  }
}

export const test = base.extend<{ inventory: InventoryFixture; inventoryProfile: Profile }>({
  inventoryProfile: ['standard', { option: true }],
  inventory: async ({ inventoryProfile }, use, testInfo) => {
    if (process.env.INVENTORY_ALLOW_MUTATIONS !== 'true') {
      throw new Error('Set INVENTORY_ALLOW_MUTATIONS=true only after all inventory business keys point to dedicated test businesses');
    }
    const api = await connectInventory();
    try {
      const profile = await inspectProfile(api, inventoryProfile);
      const fixture = new InventoryFixture(api, inventoryProfile, profile.urlKey, profile.business, profile.warehouses);
      try { await use(fixture); } finally { await fixture.cleanup(testInfo); }
    } finally { await api.context.dispose(); }
  },
});
export { expect };

export async function expectRejected(action: Promise<unknown>, message: RegExp) {
  try { await action; }
  catch (error) {
    expect(error).toBeInstanceOf(InventoryApiError);
    const err = error as InventoryApiError;
    // 200 success:false is the internal inventory-batch validation contract.
    expect([200, 400, 409, 422]).toContain(err.status);
    expect(err.detail).toMatch(message);
    return;
  }
  throw new Error('Expected inventory validation to reject the operation');
}
