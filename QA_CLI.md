# QA Data CLI — Usage Guide

A command-line tool for creating test data in Refrens without touching the UI.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Set Your Default Business](#3-set-your-default-business)
4. [Commands](#4-commands)
   - [create invoice](#create-invoice)
   - [create business](#create-business)
   - [create client](#create-client)
   - [scenario](#scenario)
   - [use business](#use-business)
5. [Presets Reference](#5-presets-reference)
6. [Scenarios Reference](#6-scenarios-reference)
7. [Advanced Usage](#7-advanced-usage)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

- Node.js 18+
- Access to the repo
- API credentials (get from business settings)

---

## 2. Installation

Run these once after cloning the repo:

```bash
# Install dependencies (includes ts-node)
npm install

# Register the `qa` command globally on your machine
npm link
```

After `npm link`, you can type `qa` from any terminal in the repo directory.

**Verify it works:**
```bash
qa help
```

You should see the full command list printed.

> **Note:** If `qa` is not found after `npm link`, restart your terminal or use the fallback:
> ```bash
> npm run qa:create -- help
> ```

---

## 3. Set Your Default Business

Set this once and never pass `--urlKey` again.

```bash
qa use business peaky-blinders
```

This saves your selection to `.qa-context.json` (gitignored — personal to you).

**Check which business is currently selected:**
```bash
qa use
```

**Switch to a different business:**
```bash
qa use business another-business-urlkey
```

**Priority order for urlKey resolution:**

| Priority | Source | How to set |
|---|---|---|
| 1 (highest) | `--urlKey` flag | Pass it explicitly on each command |
| 2 | `DEFAULT_URL_KEY` in `.env` | Edit your `.env` file |
| 3 (fallback) | `.qa-context.json` | Run `qa use business <urlKey>` |

---

## 4. Commands

### `create invoice`

Creates a GST invoice (default) or basic invoice for your selected business.

**Basic usage:**
```bash
qa create invoice
```

**With a preset (recommended):**
```bash
qa create invoice --preset=paid
qa create invoice --preset=overdue
qa create invoice --preset=premium
qa create invoice --preset=draft
```

**With individual modifier flags:**
```bash
qa create invoice --paid
qa create invoice --overdue
qa create invoice --shipping
qa create invoice --draft 
qa create invoice --partial=5000
```

**Combine preset + extra flag:**
```bash
qa create invoice --preset=paid --shipping
```

**Invoice type:**
```bash
qa create invoice --type=gst      # Indian GST (INR, 18% tax) — default
qa create invoice --type=basic    # Global (USD, no tax)
```

**Bulk creation:**
```bash
qa create invoice --count=5
qa create invoice --count=3 --preset=paid
```

**Override the business for one command:**
```bash
qa create invoice --urlKey=another-business
```

**Dry run (see what would be sent, no API call):**
```bash
qa create invoice --preset=premium --dry-run
```

---

### `create business`

Creates a new test business. Returns `_id`, `urlKey`, and `name`.

```bash
qa create business
qa create business --name="My QA Business"
qa create business --country=US --currency=USD
qa create business --dry-run
```

Use the returned `urlKey` with `qa use business <urlKey>` to select it.

---

### `create client`

Creates a client (contact) under your selected business.

```bash
qa create client
qa create client --name="Acme Corp"
qa create client --name="Jay Oza" --gstState=37
qa create client --email=test@example.com --phone=+919876543210
qa create client --urlKey=peaky-blinders --name="Override Business"
qa create client --dry-run
```

---

### `scenario`

Runs a complete end-to-end scenario. Each scenario creates its own isolated business + invoice — no `--urlKey` needed.

```bash
qa scenario gst-invoice
qa scenario paid-invoice
qa scenario overdue-invoice
qa scenario premium-invoice
qa scenario basic-paid
```

**List all scenarios:**
```bash
qa scenario --help
```

**Dry run:**
```bash
qa scenario paid-invoice --dry-run
```

---

### `use business`

Saves your default business so you never have to pass `--urlKey`.

```bash
qa use business peaky-blinders    # save
qa use                            # show currently selected
qa use business another-urlkey    # switch
```

---

## 5. Presets Reference

Use with `--preset=<name>` on `qa create invoice`.

| Preset | What it does |
|---|---|
| `paid` | Creates invoice + records full payment |
| `overdue` | Creates invoice with due date 30 days in the past |
| `draft` | Creates invoice, skips payment step |
| `shipping` | Creates invoice with shipping + transport details |
| `paid-shipping` | Paid + shipping details |
| `premium` | Alias for `paid-shipping` |
| `overdue-partial` | Overdue + ₹5,000 partial payment recorded |
| `paid-overdue` | Full payment + overdue due date |

**Examples:**
```bash
qa create invoice --preset=paid
qa create invoice --preset=overdue
qa create invoice --preset=premium
qa create invoice --preset=overdue-partial
```

---

## 6. Scenarios Reference

Each scenario creates a fresh business + invoice in one command. Use these for isolated test runs.

| Scenario | Business | Invoice type | Payment |
|---|---|---|---|
| `gst` / `gst-invoice` | New | GST (INR, 18%) | None |
| `basic` / `basic-invoice` | New | Basic (USD) | None |
| `paid-invoice` | New | GST | Full payment |
| `overdue-invoice` | New | GST | None, due date past |
| `invoice-with-shipping` | New | GST | None, with shipping |
| `draft-invoice` | New | GST | No payment step |
| `premium-invoice` | New | GST | Full payment + shipping |
| `basic-paid` | New | Basic (USD) | Full payment |
| `basic-overdue` | New | Basic (USD) | None, due date past |

**Usage:**
```bash
qa scenario gst-invoice
qa scenario paid-invoice
qa scenario premium-invoice
qa scenario invoice-with-shipping
```

---

## 7. Advanced Usage

### Custom line items

Pass a JSON array of items:

```bash
qa create invoice --items='[{"name":"Web Design","quantity":1,"rate":50000,"gstRate":18}]'
```

Multiple items:

```bash
qa create invoice --items='[
  {"name":"Design","quantity":1,"rate":40000,"gstRate":18},
  {"name":"Hosting","quantity":12,"rate":1000,"gstRate":18}
]'
```

---

### Custom payload from a JSON file

Create a file (e.g. `my-invoice.json`):
```json
{
  "billedTo": {
    "name": "Custom Client",
    "country": "IN",
    "gstState": "27",
    "gstin": "27AAPBT1234H1Z6"
  }
}
```

Then pass it:
```bash
qa create invoice --payload=./my-invoice.json
```

Or inline:
```bash
qa create invoice --payload='{"billedTo":{"name":"Acme","country":"IN"}}'
```

---

### Bulk creation with presets

```bash
# 5 paid invoices
qa create invoice --count=5 --preset=paid

# 3 overdue invoices, basic type
qa create invoice --count=3 --type=basic --preset=overdue

# 10 invoices with shipping
qa create invoice --count=10 --preset=paid-shipping
```

---

### Partial payment

```bash
# Record ₹3,000 partial payment
qa create invoice --partial=3000

# Overdue + partial
qa create invoice --overdue --partial=2500
```

---

## 8. Troubleshooting

**`qa: command not found`**

Run `npm link` from inside the repo. If that still doesn't work, use the fallback:
```bash
npm run qa:create -- create invoice --preset=paid
```

---

**`✗ No business selected`**

You haven't set a default business. Fix it:
```bash
qa use business peaky-blinders
# or pass it explicitly:
qa create invoice --urlKey=peaky-blinders
# or set in .env:
DEFAULT_URL_KEY=peaky-blinders
```

---

**`✗ 401 Unauthorized`**

Your API credentials are missing or expired. Check your `.env`:
```
API_APP_ID=...
API_APP_SECRET=...
```

Get fresh credentials from your team lead.

---

**`✗ Unknown preset`**

Check the available presets:
```bash
qa help
```

Or use one of: `paid`, `overdue`, `draft`, `shipping`, `paid-shipping`, `premium`, `overdue-partial`, `paid-overdue`

---

**`✗ Unknown scenario`**

List all available scenarios:
```bash
qa scenario --help
```

---

## Quick Reference Card

```
SETUP (once)
  npm install && npm link
  qa use business peaky-blinders

INVOICE
  qa create invoice                        # GST, unpaid
  qa create invoice --preset=paid          # paid
  qa create invoice --preset=overdue       # overdue
  qa create invoice --preset=premium       # paid + shipping
  qa create invoice --count=5 --preset=paid

SCENARIO (self-contained, no --urlKey needed)
  qa scenario paid-invoice
  qa scenario overdue-invoice
  qa scenario premium-invoice

BUSINESS / CLIENT
  qa create business
  qa create client --name="Acme Corp"

SWITCH BUSINESS
  qa use business another-urlkey

HELP
  qa help
  qa scenario --help
```
