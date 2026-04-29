#!/usr/bin/env node
/**
 * compare-reports.js
 *
 * Compares INP reports for stage (with fix) vs prod (without fix) and writes:
 *   reports/comparison/latest.json
 *
 * Semantics:
 *   diff     = prodDur - stageDur
 *   improved = diff > 0  → stage is faster → fix is working
 *   regressed= diff < 0  → stage is slower → fix introduced a regression
 *
 * Usage:
 *   node scripts/compare-reports.js
 *
 * Prerequisites:
 *   - ENV=stage node scripts/organize-reports.js  (after stage test run)
 *   - ENV=prod  node scripts/organize-reports.js  (after prod test run)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT         = path.resolve(__dirname, '..');
const STAGE_DIR    = path.join(ROOT, 'reports', 'stage', 'latest');
const PROD_DIR     = path.join(ROOT, 'reports', 'prod',  'latest');
const COMPARE_DIR  = path.join(ROOT, 'reports', 'comparison');
const OUTPUT_FILE  = path.join(COMPARE_DIR, 'latest.json');

const today = new Date().toISOString().slice(0, 10);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readInpFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Could not parse ${filePath}: ${e.message}`);
    return null;
  }
}

function listInpFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^inp-.+\.json$/.test(f));
}

/** Extract the suite name from a filename like inp-due-date.json → "due-date" */
function suiteSlug(filename) {
  return filename.replace(/^inp-/, '').replace(/\.json$/, '');
}

function ratingOf(ms) {
  if (ms >= 500) return 'CRITICAL';
  if (ms >= 200) return 'WARN';
  return 'PASS';
}

// ─── Main ────────────────────────────────────────────────────────────────────

for (const [label, dir] of [['stage', STAGE_DIR], ['prod', PROD_DIR]]) {
  if (!fs.existsSync(dir)) {
    console.error(`ERROR: ${label} report directory not found: ${dir}`);
    console.error(`  Run: ENV=${label} node scripts/organize-reports.js`);
    process.exit(1);
  }
}

const stageFiles = new Set(listInpFiles(STAGE_DIR));
const prodFiles  = new Set(listInpFiles(PROD_DIR));

// Only compare files present in both envs
const commonFiles = [...stageFiles].filter(f => prodFiles.has(f));
const onlyStage   = [...stageFiles].filter(f => !prodFiles.has(f));
const onlyProd    = [...prodFiles].filter(f => !stageFiles.has(f));

if (onlyStage.length) console.warn(`\nWARN: Only in stage (skipped): ${onlyStage.join(', ')}`);
if (onlyProd.length)  console.warn(`WARN: Only in prod  (skipped): ${onlyProd.join(', ')}`);

if (commonFiles.length === 0) {
  console.error('ERROR: No matching inp-*.json files found between stage and prod.');
  process.exit(1);
}

const comparisons = [];

for (const file of commonFiles.sort()) {
  const slug  = suiteSlug(file);
  const stage = readInpFile(path.join(STAGE_DIR, file));
  const prod  = readInpFile(path.join(PROD_DIR,  file));
  if (!stage || !prod) continue;

  // Build a map of prod entries by label for O(1) lookup
  const prodByLabel = new Map(
    (prod.entries || []).map(e => [e.label, e])
  );

  for (const stageEntry of (stage.entries || [])) {
    const prodEntry = prodByLabel.get(stageEntry.label);
    if (!prodEntry) continue; // interaction only measured on one side

    const stageDur = stageEntry.durationMs ?? 0;
    const prodDur  = prodEntry.durationMs  ?? 0;
    const diff     = prodDur - stageDur;                 // negative = prod faster
    const absDiff  = Math.abs(diff);

    let status = 'unchanged';
    if (absDiff >= 5) {                                  // ignore sub-5 ms noise
      // diff > 0 → prod is slower → stage fix is working → improved
      // diff < 0 → stage is slower → fix introduced a regression
      status = diff > 0 ? 'improved' : 'regressed';
    }

    comparisons.push({
      suite:       slug,
      interaction: stageEntry.label,
      stage:       Math.round(stageDur),
      prod:        Math.round(prodDur),
      diff:        Math.round(diff),
      status,
      stageRating: ratingOf(stageDur),
      prodRating:  ratingOf(prodDur),
    });
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const improved  = comparisons.filter(c => c.status === 'improved');
const regressed = comparisons.filter(c => c.status === 'regressed');
const unchanged = comparisons.filter(c => c.status === 'unchanged');

// biggest improvement = largest positive diff (stage most faster than prod)
const biggestImprovement = improved.length
  ? improved.reduce((a, b) => b.diff > a.diff ? b : a)
  : null;

// worst regression introduced by the fix = most negative diff (stage most slower than prod)
const worstFixRegression = regressed.length
  ? regressed.reduce((a, b) => b.diff < a.diff ? b : a)
  : null;

// interaction with worst prod INP value (still useful to track)
const worstProdOverall = comparisons.length
  ? comparisons.reduce((a, b) => b.prod > a.prod ? b : a)
  : null;

const summary = {
  totalInteractions:  comparisons.length,
  improved:           improved.length,
  regressed:          regressed.length,
  unchanged:          unchanged.length,
  biggestImprovement: biggestImprovement
    ? { interaction: biggestImprovement.interaction, suite: biggestImprovement.suite, diff: biggestImprovement.diff }
    : null,
  worstFixRegression: worstFixRegression
    ? { interaction: worstFixRegression.interaction, suite: worstFixRegression.suite, diff: worstFixRegression.diff }
    : null,
  worstProdOverall:   worstProdOverall
    ? { interaction: worstProdOverall.interaction, suite: worstProdOverall.suite, prodMs: worstProdOverall.prod }
    : null,
};

const output = { date: today, summary, comparisons };

fs.mkdirSync(COMPARE_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

// ─── Console output ──────────────────────────────────────────────────────────

const hr = '─'.repeat(76);
console.log(`\n${hr}`);
console.log('  INP COMPARISON — stage (fix) vs prod (baseline)');
console.log('  ✅ improved = stage fixed it   🔴 regressed = fix made it worse');
console.log(hr);

const colW = 38;
for (const c of comparisons) {
  const icon =
    c.status === 'improved'  ? '✅' :
    c.status === 'regressed' ? '🔴' : '➖';

  const diffStr = c.diff === 0 ? '  ±0 ms'
    : c.diff < 0 ? `  ${c.diff} ms` : ` +${c.diff} ms`;

  console.log(
    `  ${icon}  ${c.interaction.padEnd(colW)}` +
    `  stage ${String(c.stage).padStart(5)} ms` +
    `  prod ${String(c.prod).padStart(5)} ms` +
    `  ${diffStr}`
  );
}

console.log(hr);
console.log(`  ${comparisons.length} interactions compared across ${commonFiles.length} suite(s)`);
console.log(`  ✅ ${improved.length} improved   🔴 ${regressed.length} regressed   ➖ ${unchanged.length} unchanged`);

if (biggestImprovement) {
  console.log(`\n  Biggest fix      : ${biggestImprovement.interaction} (stage faster by +${biggestImprovement.diff} ms)`);
}
if (worstFixRegression) {
  console.log(`  Fix regression   : ${worstFixRegression.interaction} (stage slower by ${Math.abs(worstFixRegression.diff)} ms)`);
}
if (worstProdOverall) {
  console.log(`  Worst prod INP   : ${worstProdOverall.interaction} (${worstProdOverall.prod} ms)`);
}

console.log(hr);
console.log(`\n  Report written → ${path.relative(ROOT, OUTPUT_FILE)}\n`);
