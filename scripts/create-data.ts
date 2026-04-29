#!/usr/bin/env ts-node
/**
 * QA Test Data Creator  —  `qa` CLI
 *
 * ─── Quick reference ───────────────────────────────────────────────────────
 *
 *  BUSINESS CONTEXT  (set once, skip --urlKey forever)
 *    qa use business peaky-blinders
 *    qa use business                    # show currently selected business
 *
 *  CREATE BUSINESS
 *    qa create business
 *    qa create business --name="My Test Co"
 *    qa create business --dry-run
 *
 *  CREATE CLIENT
 *    qa create client
 *    qa create client --name="Jay Oza" --gstState=37
 *    qa create client --urlKey=peaky-blinders
 *
 *  CREATE INVOICE
 *    qa create invoice                  # GST, unpaid, ₹10 000 @ 18%
 *    qa create invoice --preset=paid
 *    qa create invoice --preset=overdue
 *    qa create invoice --preset=premium
 *    qa create invoice --type=basic
 *    qa create invoice --count=5 --preset=paid-shipping
 *
 *  MODIFIER FLAGS  (fine-grained, override preset)
 *    qa create invoice --paid
 *    qa create invoice --partial=5000
 *    qa create invoice --shipping
 *    qa create invoice --overdue
 *    qa create invoice --draft
 *
 *  SCENARIO COMMANDS  (batteries-included — creates its own business)
 *    qa scenario gst-invoice
 *    qa scenario paid-invoice
 *    qa scenario overdue-invoice
 *    qa scenario invoice-with-shipping
 *    qa scenario premium-invoice
 *    qa scenario basic-paid
 *
 *  CUSTOM DATA
 *    qa create invoice --items='[{"name":"Web Dev","quantity":1,"rate":50000,"gstRate":18}]'
 *    qa create invoice --payload=./my-invoice.json
 *
 *  PRESETS
 *    paid | overdue | draft | shipping
 *    paid-shipping | premium | overdue-partial | paid-overdue
 *
 *  SHOW HELP
 *    qa help
 *    qa create invoice --help
 *
 *  DRY RUN (print payload, no API calls)
 *    qa create invoice --dry-run
 *
 * ─── Priority for urlKey ───────────────────────────────────────────────────
 *
 *   1. --urlKey=<flag>
 *   2. DEFAULT_URL_KEY in .env
 *   3. urlKey saved via `qa use business <urlKey>`
 *
 * ─── All flags ─────────────────────────────────────────────────────────────
 *
 *  --urlKey=<string>       Business urlKey  (or use the priority chain above)
 *  --type=gst|basic        Invoice type                         (default: gst)
 *  --count=<n>             Number of invoices to create         (default: 1)
 *  --preset=<name>         Named modifier preset
 *  --paid                  Record full payment after creation
 *  --partial=<amount>      Record partial payment of N amount
 *  --shipping              Add shipping + transport details
 *  --overdue               Set due date 30 days in the past
 *  --draft                 Skip payment recording
 *  --client=<id>           Link to existing client _id
 *  --bank-account=<id>     Set bank account _id
 *  --items=<json>          Custom line items (JSON array)
 *  --payload=<path|json>   JSON file OR inline JSON — merged into payload
 *  --dry-run               Print the full payload without making API calls
 */

import path   from 'path';
import fs     from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), `.env.${process.env.ENVIRONMENT || 'staging'}`) });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { ApiClient }         from '../tests/data/core/apiClient';
import { DEFAULT_URL_KEY }   from '../tests/data/core/config';
import { createBusiness }    from '../tests/data/factories/business.factory';
import { createClient }      from '../tests/data/factories/client.factory';
import { createInvoiceBulk } from '../tests/data/services/invoice.service';
import { MODIFIER_PRESETS }  from '../tests/data/services/modifier.service';
import { getScenario, SCENARIOS } from '../tests/data/cli/scenario.registry';
import type { InvoiceInput, InvoiceLineItemInput } from '../tests/data/factories/invoice.factory';
import type { Business }       from '../tests/data/factories/business.factory';
import type { Client }         from '../tests/data/factories/client.factory';
import type { InvoiceModifiers } from '../tests/data/services/modifier.service';
import type { InvoiceResult }    from '../tests/data/services/invoice.service';

// ─── context file ─────────────────────────────────────────────────────────

const CONTEXT_FILE = path.resolve(process.cwd(), '.qa-context.json');

interface QAContext { urlKey?: string }

function readContext(): QAContext {
  try {
    return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf-8')) as QAContext;
  } catch {
    return {};
  }
}

function writeContext(ctx: QAContext): void {
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(ctx, null, 2) + '\n', 'utf-8');
}

// ─── arg parser ───────────────────────────────────────────────────────────

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { subcommand: string; flags: Flags; positionals: string[] } {
  const [subcommand, ...rest] = argv;
  const flags: Flags       = {};
  const positionals: string[] = [];
  for (const arg of rest) {
    if (arg.startsWith('--') && !arg.includes('=')) {
      flags[arg.slice(2)] = true;
    } else {
      const m = arg.match(/^--([^=]+)=(.*)$/s);
      if (m) {
        flags[m[1]] = m[2];
      } else if (!arg.startsWith('--')) {
        positionals.push(arg);
      }
    }
  }
  return { subcommand: subcommand ?? '', flags, positionals };
}

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}

function num(flags: Flags, key: string, fallback: number): number {
  const v = str(flags, key);
  if (!v) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function bool(flags: Flags, key: string): boolean {
  return flags[key] === true || flags[key] === 'true';
}

/**
 * Resolve urlKey with priority:
 *   1. --urlKey flag
 *   2. DEFAULT_URL_KEY in .env
 *   3. urlKey saved via `qa use business`
 */
function resolveUrlKey(flags: Flags, required = true): string {
  const urlKey =
    str(flags, 'urlKey') ||
    DEFAULT_URL_KEY       ||
    readContext().urlKey  ||
    '';

  if (!urlKey && required) {
    console.error('\n  ✗  No business selected. Do one of:\n');
    console.error('     qa use business <urlKey>        (saves for future commands)');
    console.error('     qa create invoice --urlKey=<k>  (one-time override)');
    console.error('     DEFAULT_URL_KEY=<k> in .env     (project-wide default)\n');
    process.exit(1);
  }
  return urlKey;
}

// ─── payload loader ───────────────────────────────────────────────────────

function loadPayload(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  const raw = (trimmed.startsWith('{') || trimmed.startsWith('['))
    ? trimmed
    : fs.readFileSync(path.resolve(process.cwd(), trimmed), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ─── display helpers ──────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

function fmtAmount(amount: number, currency = 'INR'): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${sym}${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

// ─── result printers ──────────────────────────────────────────────────────

function printInvoiceSingle(r: InvoiceResult): void {
  const total = (r.invoice.finalTotal?.total as number | undefined) ?? 0;
  const curr  = r.invoice.currency ?? 'INR';
  console.log(`
┌────────────────────────────────────────────────────┐
│  Invoice Created                                   │
├────────────────────────────────────────────────────┤
│  ID       : ${r.invoice._id}
│  Number   : ${r.invoice.invoiceNumber}
│  Status   : ${(r.invoice.status as string | undefined) ?? 'DRAFT'}
│  Payment  : ${r.paymentStatus}${r.paymentAmount > 0 ? `  (${fmtAmount(r.paymentAmount, curr)} recorded)` : ''}
│  Currency : ${curr}
│  Total    : ${fmtAmount(total, curr)}
│  URL      : ${r.url || '(not returned in create response)'}
└────────────────────────────────────────────────────┘`);
}

function printInvoiceBulk(results: InvoiceResult[], type: string, urlKey: string): void {
  const curr = results[0]?.invoice.currency ?? 'INR';
  console.log(`\nCreated ${results.length} ${type.toUpperCase()} invoice(s) for ${urlKey}\n`);
  console.log(`  ${'#'.padEnd(3)}  ${'Invoice Number'.padEnd(26)}  ${'_id'.padEnd(26)}  ${'Total'.padEnd(12)}  ${'Payment'}`);
  console.log(`  ${'─'.repeat(3)}  ${'─'.repeat(26)}  ${'─'.repeat(26)}  ${'─'.repeat(12)}  ${'─'.repeat(10)}`);
  results.forEach((r, i) => {
    const total = (r.invoice.finalTotal?.total as number | undefined) ?? 0;
    console.log(
      `  ${pad(String(i + 1), 3)}  ` +
      `${pad(r.invoice.invoiceNumber, 26)}  ` +
      `${pad(r.invoice._id, 26)}  ` +
      `${pad(fmtAmount(total, curr), 12)}  ` +
      r.paymentStatus,
    );
  });
  console.log(`\n  IDs: ${results.map((r) => r.invoice._id).join(', ')}\n`);
}

function printBusiness(b: Business): void {
  console.log(`
┌────────────────────────────────────────────────────┐
│  Business Created                                  │
├────────────────────────────────────────────────────┤
│  ID       : ${b._id}
│  urlKey   : ${b.urlKey}
│  Name     : ${b.name}
│  Country  : ${b.country}
│  Currency : ${b.currency ?? 'INR'}
└────────────────────────────────────────────────────┘`);
}

function printClient(c: Client): void {
  console.log(`
┌────────────────────────────────────────────────────┐
│  Client Created                                    │
├────────────────────────────────────────────────────┤
│  ID       : ${c._id}
│  Name     : ${c.name}
│  Country  : ${c.country}
│  State    : ${c.state ?? '—'}
│  Email    : ${c.email ?? '—'}
│  Phone    : ${c.phone ?? '—'}
└────────────────────────────────────────────────────┘`);
}

// ─── subcommands ──────────────────────────────────────────────────────────

async function cmdBusiness(flags: Flags): Promise<void> {
  const dryRun = bool(flags, 'dry-run');

  const overrides: Record<string, unknown> = {};
  if (str(flags, 'name'))     overrides['name']     = str(flags, 'name');
  if (str(flags, 'country'))  overrides['country']  = str(flags, 'country');
  if (str(flags, 'currency')) overrides['currency'] = str(flags, 'currency');
  if (str(flags, 'alias'))    overrides['alias']    = str(flags, 'alias');
  if (str(flags, 'phone'))    overrides['billedTo'] = { phone: str(flags, 'phone') };

  const payloadArg = str(flags, 'payload');
  if (payloadArg) {
    try   { Object.assign(overrides, loadPayload(payloadArg)); }
    catch (e) { die(`Could not load --payload: ${e instanceof Error ? e.message : e}`); }
  }

  if (dryRun) {
    console.log('\n[dry-run] would create 1 business');
    console.log('\n[dry-run] effective overrides:\n' + JSON.stringify(overrides, null, 2));
    return;
  }

  console.log('\nAuthenticating...');
  printBusiness(await createBusiness(await ApiClient.create(), overrides));
}

async function cmdClient(flags: Flags): Promise<void> {
  const urlKey = resolveUrlKey(flags);
  const dryRun = bool(flags, 'dry-run');

  const overrides: Record<string, unknown> = {};
  if (str(flags, 'name'))     overrides['name']     = str(flags, 'name');
  if (str(flags, 'email'))    overrides['email']    = str(flags, 'email');
  if (str(flags, 'phone'))    overrides['phone']    = str(flags, 'phone');
  if (str(flags, 'country'))  overrides['country']  = str(flags, 'country');
  if (str(flags, 'state'))    overrides['state']    = str(flags, 'state');
  if (str(flags, 'gstState')) overrides['gstState'] = str(flags, 'gstState');
  if (str(flags, 'city'))     overrides['city']     = str(flags, 'city');
  if (str(flags, 'gstin'))    overrides['gstin']    = str(flags, 'gstin');

  const payloadArg = str(flags, 'payload');
  if (payloadArg) {
    try   { Object.assign(overrides, loadPayload(payloadArg)); }
    catch (e) { die(`Could not load --payload: ${e instanceof Error ? e.message : e}`); }
  }

  if (dryRun) {
    console.log(`\n[dry-run] would create 1 client for urlKey: ${urlKey}`);
    console.log('\n[dry-run] effective overrides:\n' + JSON.stringify(overrides, null, 2));
    return;
  }

  console.log('\nAuthenticating...');
  printClient(await createClient(await ApiClient.create(), urlKey, overrides));
}

async function cmdInvoice(flags: Flags): Promise<void> {
  const urlKey  = resolveUrlKey(flags);
  const type    = (str(flags, 'type') ?? 'gst') as 'gst' | 'basic';
  const count   = Math.max(1, num(flags, 'count', 1));
  const dryRun  = bool(flags, 'dry-run');
  const preset  = str(flags, 'preset');

  const baseModifiers: InvoiceModifiers = preset
    ? (MODIFIER_PRESETS[preset] ?? (() => { die(`Unknown preset: "${preset}". Available: ${Object.keys(MODIFIER_PRESETS).join(', ')}`); return {}; })())
    : {};

  const modifiers: InvoiceModifiers = {
    ...baseModifiers,
    ...(bool(flags, 'paid')            ? { paid:     true }                        : {}),
    ...(num(flags, 'partial', 0) > 0   ? { partial:  num(flags, 'partial', 0) }    : {}),
    ...(bool(flags, 'shipping')        ? { shipping: true }                        : {}),
    ...(bool(flags, 'overdue')         ? { overdue:  true }                        : {}),
    ...(bool(flags, 'draft')           ? { draft:    true }                        : {}),
  };

  const input: InvoiceInput = {};
  if (str(flags, 'items'))        input.items       = JSON.parse(str(flags, 'items')!) as InvoiceLineItemInput[];
  if (str(flags, 'client'))       input.client      = str(flags, 'client');
  if (str(flags, 'bank-account')) input.bankAccount = str(flags, 'bank-account');

  const payloadArg = str(flags, 'payload');
  if (payloadArg) {
    try   { Object.assign(input, loadPayload(payloadArg)); }
    catch (e) { die(`Could not load --payload: ${e instanceof Error ? e.message : e}`); }
  }

  if (dryRun) {
    console.log(`\n[dry-run] would create ${count} × ${type} invoice(s) for urlKey: ${urlKey}`);
    if (preset) console.log(`[dry-run] preset: "${preset}"`, baseModifiers);
    console.log('[dry-run] effective modifiers:', modifiers);
    console.log('\n[dry-run] effective input:\n' + JSON.stringify(input, null, 2));
    return;
  }

  console.log('\nAuthenticating...');
  const api     = await ApiClient.create();
  const results = await createInvoiceBulk(api, urlKey, count, { type, modifiers, input });

  if (count === 1) printInvoiceSingle(results[0]);
  else             printInvoiceBulk(results, type, urlKey);
}

async function cmdScenario(flags: Flags, positionals: string[]): Promise<void> {
  const name = positionals[0];
  if (!name || bool(flags, 'help')) {
    console.log('\nAvailable scenarios:\n');
    for (const key of Object.keys(SCENARIOS)) {
      console.log(`  qa scenario ${key}`);
    }
    console.log('');
    if (!name) process.exit(1);
    return;
  }

  const dryRun = bool(flags, 'dry-run');
  if (dryRun) {
    console.log(`\n[dry-run] would run scenario: "${name}"\n`);
    return;
  }

  console.log('\nAuthenticating...');
  const api = await ApiClient.create();

  let scenarioFn: ReturnType<typeof getScenario>;
  try { scenarioFn = getScenario(name); }
  catch (e) { die(e instanceof Error ? e.message : String(e)); }

  console.log(`\n[scenario] running "${name}"...`);
  const result = await scenarioFn!(api);
  console.log('\n[scenario] ✓ result:\n' + JSON.stringify(result, null, 2));
}

/** `qa use business <urlKey>` — save context; no args → show current */
async function cmdUse(positionals: string[]): Promise<void> {
  const [resource, value] = positionals;

  if (!resource) {
    const ctx = readContext();
    if (ctx.urlKey) {
      console.log(`\n  Current business: ${ctx.urlKey}\n`);
    } else {
      console.log('\n  No business selected. Run: qa use business <urlKey>\n');
    }
    return;
  }

  if (resource !== 'business') {
    die(`Unknown resource: "${resource}". Currently supported: business`);
  }

  if (!value) {
    die('urlKey required: qa use business <urlKey>');
  }

  const ctx = readContext();
  const prev = ctx.urlKey;
  ctx.urlKey = value;
  writeContext(ctx);

  if (prev && prev !== value) {
    console.log(`\n  ✓  Business changed: ${prev} → ${value}`);
  } else {
    console.log(`\n  ✓  Business set to: ${value}`);
  }
  console.log(`     Saved to .qa-context.json\n`);
  console.log(`     Now you can run: qa create invoice  (no --urlKey needed)\n`);
}

// ─── error helper ─────────────────────────────────────────────────────────

function die(msg: string): never {
  console.error(`\n  ✗  ${msg}\n`);
  process.exit(1);
}

// ─── help ─────────────────────────────────────────────────────────────────

function printHelp(): void {
  const ctx     = readContext();
  const urlKey  = DEFAULT_URL_KEY || ctx.urlKey || '<not set>';
  const presets = Object.keys(MODIFIER_PRESETS).join(' | ');

  console.log(`
QA Data CLI
───────────
Selected business: ${urlKey}
  → Set once with: qa use business <urlKey>

Usage:
  qa <command> [subcommand] [flags]

Commands:
  use business <urlKey>   Save default business (skip --urlKey forever)
  create business         Create a new test business
  create client           Create a client for a business
  create invoice          Create one or more invoices
  scenario <name>         Run a named end-to-end scenario
  help                    Show this message

Invoice modifiers:
  --paid                  Record full payment after creation
  --partial=<amount>      Record partial payment of N
  --shipping              Add shipping + transport details
  --overdue               Set due date 30 days in the past
  --draft                 Skip payment recording
  --preset=<name>         Apply a named preset

Presets:
  ${presets}

Common flags:
  --urlKey=<string>       Override the selected business
  --count=<n>             How many to create            (default: 1)
  --type=gst|basic        Invoice type                  (default: gst)
  --items=<json>          Custom line items (JSON array)
  --payload=<path|json>   JSON file or inline JSON — merged last
  --dry-run               Print what would be sent, no API calls

Scenarios:
  ${Object.keys(SCENARIOS).join('\n  ')}

Examples:
  qa use business peaky-blinders
  qa create invoice
  qa create invoice --preset=paid
  qa create invoice --preset=premium --count=3
  qa create invoice --paid --shipping
  qa scenario paid-invoice
  qa scenario gst-invoice
  qa create client --name="Acme Corp"
  qa create business --dry-run

Legacy (still works):
  npm run qa:create -- invoice --urlKey=peaky-blinders --paid
`);
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === 'help' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  const { subcommand, flags, positionals } = parseArgs(args);

  // `create` is a namespace — the real subcommand is the first positional
  if (subcommand === 'create') {
    const entity = positionals[0];
    if (!entity) {
      console.error('\n  ✗  Specify what to create: qa create invoice | business | client\n');
      process.exit(1);
    }
    switch (entity) {
      case 'business': return cmdBusiness(flags);
      case 'client':   return cmdClient(flags);
      case 'invoice':  return cmdInvoice(flags);
      default:
        die(`Unknown entity: "${entity}". Use: invoice | business | client`);
    }
  }

  switch (subcommand) {
    // Direct subcommands (backwards-compatible)
    case 'business': return cmdBusiness(flags);
    case 'client':   return cmdClient(flags);
    case 'invoice':  return cmdInvoice(flags);
    case 'scenario': return cmdScenario(flags, positionals);
    case 'use':      return cmdUse(positionals);
    default:
      die(`Unknown command: "${subcommand}". Run "qa help" to see all options.`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('\n  ✗ ', msg);
  process.exit(1);
});
