const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
function normalizeEnvironment(value = 'staging') {
  const name = value === 'prod' ? 'production' : value;
  if (!['staging', 'production', 'development'].includes(name)) {
    throw new Error(`Unsupported ENVIRONMENT: ${value}`);
  }
  return name;
}

// Select using the shell first, then .env. Merge without mutating the shell.
function loadRuntime(root = ROOT, shell = process.env) {
  const read = (name) => {
    const file = path.join(root, name);
    return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  };
  const defaults = read('.env');
  const environment = normalizeEnvironment(shell.ENVIRONMENT || defaults.ENVIRONMENT);
  const preferred = `.env.${environment}`;
  const selected = environment === 'production' && !fs.existsSync(path.join(root, preferred))
    ? '.env.prod' : preferred;
  const values = { ...defaults, ...read(selected), ...shell, ENVIRONMENT: environment };
  const browserDefaults = {
    staging: 'https://staging.bizsuggest.com',
    production: 'https://www.refrens.com',
    development: 'http://localhost:7000',
  };
  const apiDefaults = {
    staging: 'https://serana.staging.bizsuggest.com',
    production: 'https://www.refrens.com',
    development: 'http://localhost:7100',
  };
  return {
    environment, values,
    baseURL: (values.BASE_URL || browserDefaults[environment]).replace(/\/$/, ''),
    apiBaseURL: (values.API_BASE_URL || apiDefaults[environment]).replace(/\/$/, ''),
    storageState: path.join(root, `storageState.${environment}.json`),
  };
}

function initializeRuntime() {
  const runtime = loadRuntime();
  Object.assign(process.env, runtime.values);
  return runtime;
}

module.exports = { loadRuntime, initializeRuntime, normalizeEnvironment };
