#!/usr/bin/env node
/**
 * organize-reports.js
 *
 * Moves inp-*.json files from reports/raw/ into:
 *   reports/{ENV}/latest/
 *   reports/{ENV}/history/YYYY-MM-DD/
 *
 * Usage:
 *   ENV=stage node scripts/organize-reports.js
 *   ENV=prod  node scripts/organize-reports.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const ENV = (process.env.ENV || '').trim();

if (!ENV) {
  console.error('ERROR: ENV environment variable is required (stage | prod)');
  process.exit(1);
}

const ROOT    = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'reports', 'raw');

const today      = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const LATEST_DIR = path.join(ROOT, 'reports', ENV, 'latest');
const HIST_DIR   = path.join(ROOT, 'reports', ENV, 'history', today);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, destDir) {
  const dest = path.join(destDir, path.basename(src));
  fs.copyFileSync(src, dest);
  return dest;
}

// ─── Main ────────────────────────────────────────────────────────────────────

if (!fs.existsSync(RAW_DIR)) {
  console.error(`ERROR: Raw report directory not found: ${RAW_DIR}`);
  console.error('  Run the performance tests first so inp-*.json files are generated.');
  process.exit(1);
}

const files = fs.readdirSync(RAW_DIR).filter(f => /^inp-.+\.json$/.test(f));

if (files.length === 0) {
  console.error(`ERROR: No inp-*.json files found in ${RAW_DIR}`);
  process.exit(1);
}

ensureDir(LATEST_DIR);
ensureDir(HIST_DIR);

console.log(`\nOrganizing ${files.length} INP report(s) for ENV="${ENV}"\n`);

for (const file of files) {
  const src = path.join(RAW_DIR, file);

  const latestDest = copyFile(src, LATEST_DIR);
  const histDest   = copyFile(src, HIST_DIR);

  console.log(`  ✓ ${file}`);
  console.log(`      latest  → ${path.relative(ROOT, latestDest)}`);
  console.log(`      history → ${path.relative(ROOT, histDest)}`);
}

// Clear raw dir after organizing so the next test run starts clean
for (const file of files) {
  fs.unlinkSync(path.join(RAW_DIR, file));
}

console.log(`\nDone. Raw directory cleared.\n`);
