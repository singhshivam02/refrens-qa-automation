/**
 * Central environment configuration.
 *
 * Loaded once at process start; all other modules import constants from here.
 * Add DEFAULT_URL_KEY to .env to avoid passing --urlKey on every CLI call.
 */

const { initializeRuntime } = require('../../../config/runtime.cjs');
const runtime = initializeRuntime();
export const ENV = runtime.environment;
export const API_BASE_URL = runtime.apiBaseURL;
export const BASE_URL = runtime.baseURL;

/**
 * Fallback urlKey for CLI commands — set DEFAULT_URL_KEY in .env to skip --urlKey every time.
 * @example
 *   const urlKey = options.urlKey || DEFAULT_URL_KEY;
 */
export const DEFAULT_URL_KEY = process.env.DEFAULT_URL_KEY ?? '';
