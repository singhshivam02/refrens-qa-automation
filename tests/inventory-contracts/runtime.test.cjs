const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadRuntime, normalizeEnvironment, hasValidBrowserSession } = require('../../config/runtime.cjs');

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, name), value);
  return root;
}

test('prod alias selects production browser and API defaults', (t) => {
  const config = loadRuntime(fixture(t), { ENVIRONMENT: 'prod' });
  assert.equal(config.environment, 'production');
  assert.equal(config.apiBaseURL, 'https://www.refrens.com');
  assert.equal(config.baseURL, 'https://www.refrens.com');
});
test('.env selects the environment before overrides are loaded', (t) => {
  const config = loadRuntime(fixture(t, {
    '.env': 'ENVIRONMENT=prod\nQA_EMAIL=default@example.test',
    '.env.production': 'QA_EMAIL=prod@example.test',
  }), {});
  assert.equal(config.environment, 'production');
  assert.equal(config.values.QA_EMAIL, 'prod@example.test');
});
test('shell overrides environment file which overrides default file', (t) => {
  const config = loadRuntime(fixture(t, {
    '.env': 'ENVIRONMENT=production\nBASE_URL=https://default.test\nQA_EMAIL=default@example.test',
    '.env.staging': 'BASE_URL=https://stage.test\nQA_EMAIL=stage@example.test',
  }), { ENVIRONMENT: 'staging', BASE_URL: 'https://shell.test' });
  assert.equal(config.baseURL, 'https://shell.test');
  assert.equal(config.values.QA_EMAIL, 'stage@example.test');
});
test('production prefers .env.production and falls back to .env.prod', (t) => {
  const root = fixture(t, { '.env.prod': 'QA_EMAIL=alias@example.test' });
  assert.equal(loadRuntime(root, { ENVIRONMENT: 'production' }).values.QA_EMAIL, 'alias@example.test');
  fs.writeFileSync(path.join(root, '.env.production'), 'QA_EMAIL=canonical@example.test');
  assert.equal(loadRuntime(root, { ENVIRONMENT: 'prod' }).values.QA_EMAIL, 'canonical@example.test');
});
test('switching environments separates auth state and never adopts legacy state', (t) => {
  const root = fixture(t, { 'storageState.json': '{"cookies":[]}' });
  const stage = loadRuntime(root, { ENVIRONMENT: 'staging' });
  const prod = loadRuntime(root, { ENVIRONMENT: 'prod' });
  assert.notEqual(stage.storageState, prod.storageState);
  assert.equal(path.basename(prod.storageState), 'storageState.production.json');
  assert.equal(fs.existsSync(stage.storageState), false);
});
test('runtime loading does not mutate the supplied shell', (t) => {
  const shell = { ENVIRONMENT: 'prod' };
  loadRuntime(fixture(t), shell);
  assert.deepEqual(shell, { ENVIRONMENT: 'prod' });
});
test('invalid environment fails instead of silently reaching staging', () => {
  assert.throws(() => normalizeEnvironment('prd'), /Unsupported ENVIRONMENT/);
});
test('API and browser override roles remain independent', (t) => {
  const config = loadRuntime(fixture(t), { BASE_URL: 'https://browser.test/', API_BASE_URL: 'https://api.test/' });
  assert.equal(config.baseURL, 'https://browser.test');
  assert.equal(config.apiBaseURL, 'https://api.test');
});

test('browser auth reuse requires a cookie covering the selected frontend domain', () => {
  const now = Date.now();
  const cookie = { name: '__rt', value: 'test-only', domain: '.staging.example.test', expires: now / 1000 + 3600 };
  assert.equal(hasValidBrowserSession({ cookies: [cookie] }, 'https://staging.example.test', now), true);
  assert.equal(hasValidBrowserSession({ cookies: [cookie] }, 'https://qa03.example.test', now), false);
  assert.equal(hasValidBrowserSession({ cookies: [{ ...cookie, expires: now / 1000 + 30 }] }, 'https://staging.example.test', now), false);
  assert.equal(hasValidBrowserSession({ cookies: [{ ...cookie, expires: undefined }] }, 'https://staging.example.test', now), false);
  assert.equal(hasValidBrowserSession({ cookies: [{ ...cookie, domain: 'staging.example.test' }] }, 'https://child.staging.example.test', now), false);
});
