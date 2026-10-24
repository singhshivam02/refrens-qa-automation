import { Page, expect } from '@playwright/test';
import { InventoryFixture, RecordData } from './fixture';

export class InventoryUI {
  constructor(readonly page: Page, readonly fixture: InventoryFixture) {}
  async goto(path = 'inventory') {
    await this.page.goto(`/app/${encodeURIComponent(this.fixture.urlKey)}/${path}`);
    await expect(this.page).not.toHaveURL(/\/login(?:[/?]|$)/);
  }
  field(name: string) { return this.page.locator(`[name="${name}"]`); }
  async section(name: RegExp) {
    const header = this.page.getByRole('button', { name });
    await expect(header).toBeVisible();
    if (await header.getAttribute('aria-expanded') !== 'true') await header.click();
  }
  async fillItem(values: Record<string, string | number>) {
    for (const [key, value] of Object.entries(values)) {
      const field = this.field(key);
      if (['costPrice', 'sellingPrice', 'landedCost', 'gstRate'].includes(key)) await this.section(/Pricing & Taxation/);
      if (key === 'initialStock') await this.section(/^Stock Management/);
      if (['reorderPoint', 'overstockPoint'].includes(key)) await this.section(/Reorder & Overstock/);
      await field.fill(String(value));
    }
  }
  async saveItem(edit = false): Promise<RecordData> {
    const endpoint = `${this.fixture.root}/inventories`;
    const responsePromise = this.page.waitForResponse((res) =>
      new URL(res.url()).pathname.startsWith(endpoint) &&
      res.request().method() === (edit ? 'PATCH' : 'POST'));
    await this.page.getByRole('button', { name: edit ? 'Save & Close' : 'Save & Add Item', exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), `Saving inventory returned HTTP ${response.status()}`).toBe(true);
    const record = await response.json();
    if (!edit) this.fixture.track('inventories', record);
    return record;
  }
  async form(item?: RecordData) {
    await this.goto(item ? `inventory/${item._id}/edit` : 'inventory/new');
    await expect(this.field('name')).toBeVisible();
  }
  async select(name: string, label: string) {
    const input = this.page.locator(`[name="${name}"]`);
    // Disco/React Select's hidden named input sits inside its control.
    const wrapper = input.locator('..');
    await wrapper.locator('[role="combobox"]').click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }
}
