import fs from 'fs';
import { spawnSync } from 'child_process';
import { chromium, firefox, webkit } from '@playwright/test';
import { PROFILE_KEYS, Profile, connectInventory, inspectProfile } from '../tests/lydia/inventory/fixture';

const { initializeRuntime, hasValidBrowserSession } = require('../config/runtime.cjs');

async function main() {
  const runtime = initializeRuntime();
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !args[0].startsWith('--profile='))) {
    throw new Error('Usage: test:inventory:preflight [--profile=standard,warehouses,strict,uom]');
  }
  const selected = args[0] ? args[0].slice('--profile='.length).split(',') : Object.keys(PROFILE_KEYS);
  if (!selected.length || selected.some((profile) => !(profile in PROFILE_KEYS))) {
    throw new Error('Unknown inventory profile; use standard, warehouses, strict or uom');
  }
  console.log(`Inventory environment: ${runtime.environment}`);
  console.log(`Browser URL: ${runtime.baseURL}`);
  console.log(`API URL: ${runtime.apiBaseURL}`);
  console.log(`Auth state: ${runtime.storageState}`);
  let browserSession = false;
  try { browserSession = hasValidBrowserSession(JSON.parse(fs.readFileSync(runtime.storageState, 'utf8')), runtime.baseURL); } catch {}
  console.log(`Browser session: ${browserSession ? 'valid for selected frontend' : 'missing, expired or outside the selected frontend domain; browser login required for UI cases'}`);
  let missing = false;
  for (const [name, browser] of Object.entries({ chromium, firefox, webkit })) {
    console.log(`${name}: ${fs.existsSync(browser.executablePath()) ? 'installed' : 'not installed'}`);
  }
  const pdf = spawnSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-v'], { encoding: 'utf8' });
  console.log(`pdftotext: ${pdf.status === 0 ? 'available' : 'missing (needed for PDF assertions)'}`);
  for (const profile of selected) {
    const key = PROFILE_KEYS[profile as Profile];
    const value = process.env[key] || (profile === 'standard' ? process.env.DEFAULT_URL_KEY : '');
    const configured = !!value && !value.startsWith('your-');
    console.log(`${profile}: ${configured ? 'business key configured' : `missing ${key}`}`);
    if (!configured) missing = true;
  }
  const credentials = !!((process.env.QA_EMAIL || process.env.TEST_EMAIL) && (process.env.QA_PASSWORD || process.env.TEST_PASSWORD));
  console.log(`QA credentials: ${credentials ? 'configured' : 'missing'}`);
  console.log(`Mutating tests: ${process.env.INVENTORY_ALLOW_MUTATIONS === 'true' ? 'enabled' : 'disabled'}`);
  if (!credentials || missing) {
    throw new Error('Complete the inventory profile keys and QA credentials in the ignored .env file. No remote requests were made.');
  }
  const api = await connectInventory();
  try {
    for (const profile of selected as Profile[]) {
      await inspectProfile(api, profile);
      console.log(`${profile}: business settings verified`);
    }
  } finally { await api.context.dispose(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
