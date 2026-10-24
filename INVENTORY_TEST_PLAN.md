# Inventory checklist setup

The inventory regression specs extend the existing Lydia Playwright projects.
They share authentication setup, browser configuration, HTML reports, screenshots,
videos and traces. There is no separate runner or scheduler.

This is a new draft implementation based on the supplied inventory plan. The
supplied document described another implementation that was not present in the
checkout or upstream history. Its claims about prior validation do not apply to
these files. The tests below are discoverable and type checked; live application
workflows still require configured test businesses and verification.

## Local setup

Requires Node 22.18+ and npm. Use your existing environment file, or create one:

```bash
npm ci
npx playwright install chromium firefox webkit
cp .env.example .env # only if no .env already exists
```

Set QA_EMAIL and QA_PASSWORD in the ignored .env (TEST_EMAIL/TEST_PASSWORD are
accepted fallbacks). Initial browser login opens headed for CAPTCHA; subsequent
runs reuse valid environment-specific authentication. Inventory fixtures separately
authenticate using local JWT credentials, through the same internal endpoints used
by the app. They do not use the public API app-secret facade or database writes.

The invoice PDF assertion requires Poppler's pdftotext on PATH, or PDFTOTEXT_BIN.

## Test businesses

All business keys must identify dedicated Indian regression businesses in the
selected environment. The suite creates documents, stock movements, batches,
serials and imports. Do not point it at an operational business.

| Profile | Variable | Required configuration |
| --- | --- | --- |
| standard | INVENTORY_URL_KEY (DEFAULT_URL_KEY fallback) | Inventory on; warehouses off; business strict control off |
| warehouses | INVENTORY_WAREHOUSE_URL_KEY | Inventory and warehouses on; strict control off; two active warehouses |
| strict | INVENTORY_STRICT_URL_KEY | Inventory, warehouses and business strict control on; two active warehouses |
| uom | INVENTORY_UOM_URL_KEY | Inventory, warehouses and UOM on; strict control off; two active warehouses |

The QA user must have access to these businesses and the necessary paid/trial
features: adjustments, warehouses, batch/serial tracking, strict control, UOM,
packages, imports, reports, CSV exports and invoice PDF downloads. Business settings,
plans and subscriptions are never toggled by the tests. Profile mismatches fail
with configuration errors instead of silently skipping scenarios. The UI invoice
case also requires invoice[0].manageInventory=UPDATE in the standard business.

For custom-field cases, enable indexed fields and configure active TEXT fields in:

- Standard: configuration.indexedCustomFields.INVENTORY.
- Warehouse: configuration.indexedCustomFields.INVENTORY_BATCHES and INVENTORY_TRANSACTIONS.
- Make the transaction field visible in the item transaction table.

The preflight command reads settings only. It reports missing local configuration
before making remote requests. Once every business key and QA credentials is
present, it authenticates and reads each business and its active warehouses.

```bash
npm run test:inventory:preflight
npm run test:inventory:contracts
npm run test:inventory -- --list
```

After verifying the businesses are dedicated to regression testing, set
INVENTORY_ALLOW_MUTATIONS=true in the ignored .env. Fixture setup fails if this
flag is absent. A browser authentication dependency can still run before fixture
setup, so run preflight first.

```bash
npm run test:inventory -- --headed
npm run test:inventory -- --grep INV-010
npm run test:inventory:firefox
npm run test:inventory:webkit
npm run test:report
```

Select environments with ENVIRONMENT=staging, ENVIRONMENT=prod or
ENVIRONMENT=production. Shell values override .env.<environment>, which overrides
.env. ENVIRONMENT in .env selects the environment file when the shell does not
specify one. Production prefers .env.production and falls back to .env.prod.
BASE_URL and API_BASE_URL retain their independent override roles. The prod alias
now resolves to production for browser and API defaults, rather than the staging
API. Authentication files are storageState.<environment>.json; legacy
storageState.json is not adopted because its environment cannot be determined.

## Implemented coverage

Run discovery for the current count and exact case titles. Many cases deliberately
use API fixtures and API assertions; they are not presented as browser journeys.

| IDs | Implemented assertions |
| --- | --- |
| 001–008 | UI product creation and editing/reload; required name and negative-price UI validation; duplicate SKU; service stock classification; stock-toggle persistence; invalid thresholds |
| 010–012 | Incoming/outgoing deltas and transaction history; non-strict negative stock and settlement; zero-quantity rejection; adjustment-modal cancellation |
| 020–021 | Two warehouse allocations, isolated adjustment and stock-conserving transfer |
| 030–033 | Batch creation, duplicate-code rejection, isolated batch deduction and migration of existing stock |
| 040–041 | Exact serial receipt/availability and duplicate receipt rejection |
| 050–053 | Warehouse insufficiency, exact-stock boundary, concurrent last-unit document sales and batch insufficiency |
| 059 | UI invoice creation using inventory suggestions; UI quantity edit; persisted inventory linkage and stock deltas |
| 060–066 | UPDATE/BLOCK/IGNORE creation and API quantity edits/cancellation; purchase/sale/edit/return lifecycle; replacing items; deletion; five reservation document types; credit/debit-note per-line physical return; service and one-time lines |
| 070–071 | Oversubscribed reservation without physical deduction; strict rejection of consumed-purchase reduction/cancellation/deletion |
| 072–073 | Split batch-allocation edits and stored batch metadata snapshots |
| 080–081 | Serial-specific sales; reusable/damaged/scrapped returns; warranty starts on sale and clears/recomputes after reusable return for days/months/years |
| 090–091 | Package component ratios, recomputed package availability and whole-sale rejection for insufficient strict component stock |
| 100–102 | Alternate-unit purchase/sales conversion, price-only edits, factor bounds and serial-UOM UI incompatibility |
| 110–116 | CSV preview before mutation; error CSV; field-preserving edit; final/delta adjustments; conflicting columns; package grouping; inventory TEXT field template and import |
| 120–125 | Valuation API and CSV values; six stock-status boundaries; known profitability quantities/margin; actual invoice PDF text; historical outward-movement inclusion and recent-sale removal; invalid unsold-day UI filter bounds |
| 130–132 | Expired/future batch buckets; two-warehouse batch import and TEXT field; transaction TEXT field persistence and table visibility |

UPDATE changes physical stockInHand and stock; BLOCK changes stock only; IGNORE
changes neither. Reservations may exceed physical availability. Strict control
rejects physical deductions and purchase reversals that would create negative
stock. Tests assert both physical and reservation-inclusive balances.

## Remaining requested coverage

This draft does not claim full parity with every journey in the supplied plan.
The following require further implementation or stronger assertions:

- Warehouse/address creation through the UI (022).
- Full/partial reserved-proforma conversion through the UI (067).
- Same-request/idempotency-key replay returning the original document (068).
  No supported request-key contract was identified in the inspected invoice source;
  duplicate invoice numbers currently reject. Confirm the deployment contract first.
- Single-batch column restriction; the current 073 case verifies snapshot persistence.
- Stock-toggle confirmation cancellation and UI quantity edits in all three document modes.
- UI batch/serial receipt and package creation; current fixture paths use APIs.
- Exact business-calendar warranty end dates and month-end boundaries; current 081
  checks activation, ordering, reset and recomputation.
- Unsold-report CSV and expiry-report drilldown/CSV exports.

Permissions, accounting-ledger reconciliation, combined batch+serial tracking,
country-specific tax matrices, tenant migrations, bulk seed/prune tooling,
scheduling and load testing are outside this setup.

## Data ownership and diagnostics

Every test uses a UUID prefix and owns its items/documents. API fixture data is
polled into the search index before UI selection. No test chooses an arbitrary
existing invoice or inventory item. Imports are submitted once, then polled;
writes are not retried after ambiguous transport failures. Fixture calls treat
HTTP 200 success:false as a failure, and validation-rejection assertions cannot
pass on authentication errors or server errors.

Each test attaches inventory-records.json with its profile, business, prefix and
created IDs, without credentials or tokens. Failed tests retain records for
diagnosis. Successful tests cancel documents in reverse creation order, then
soft-remove owned inventory and contacts. Created warehouses, when used by future
cases, are deactivated last. Cleanup errors are attached separately and annotated;
they do not hide workflow failures. Batches/serials can remain associated with
soft-removed items; this is application cleanup, not database deletion.

INVENTORY_POLL_TIMEOUT_MS controls ordinary stock/index polling.
INVENTORY_BULK_TIMEOUT_MS controls imported-record polling. Missing settings or
unsupported deployment contracts should be investigated rather than replaced
with sleeps, arbitrary record selection or silent skips.

## Validation

Verified locally for this draft:

- Locked dependencies installed successfully.
- `npx tsc --noEmit` passed, including playwright.config.ts.
- All 25 local contract/configuration/fixture checks passed.
- Each Lydia browser project discovered 88 inventory cases plus authentication
  setup (89 tests across eight files).
- Chromium, Firefox and WebKit launched and rendered a local HTML page.
- Preflight correctly reported missing warehouse, strict and UOM business keys
  before making any remote request. Mutations remain disabled locally.

Local validation covers runtime aliases/precedence/auth-state separation, stock
mode expectations, populated references, CSV round trips, timeout validation,
HTTP failure classification, no write retries, configuration failures, and cleanup
ownership/order/retention. These checks use local fixtures or fake HTTP responses.

Live E2E execution remains unverified. Credentials are locally configured, but
dedicated inventory profiles still need to be supplied and verified. Browser
discovery and local rendering checks are not substitutes for a real application run.
