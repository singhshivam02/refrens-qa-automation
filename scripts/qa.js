#!/usr/bin/env node
/**
 * `qa` CLI entry point — delegates to create-data.ts via ts-node.
 *
 * Setup (one-time per machine):
 *   npm install   # installs ts-node
 *   npm link      # registers `qa` as a global command
 *
 * Then you can run from anywhere inside the repo:
 *   qa use business peaky-blinders
 *   qa create invoice --preset=paid
 *   qa scenario paid-invoice
 */
const path       = require('path');
const { spawnSync } = require('child_process');

const tsNode = path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node');
const script = path.join(__dirname, 'create-data.ts');
const args   = process.argv.slice(2);

const result = spawnSync(tsNode, [script, ...args], {
  stdio: 'inherit',
  cwd:   process.cwd(),
});

process.exit(result.status ?? 0);
