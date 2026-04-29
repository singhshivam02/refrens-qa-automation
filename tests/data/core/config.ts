/**
 * Central environment configuration.
 *
 * Loaded once at process start; all other modules import constants from here.
 * Add DEFAULT_URL_KEY to .env to avoid passing --urlKey on every CLI call.
 */

import path from 'path';
import dotenv from 'dotenv';

const envName = process.env.ENVIRONMENT || 'staging';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${envName}`) });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE_URL_DEFAULTS: Record<string, string> = {
  staging:    'https://serana.qa01.bizsuggest.com',
  production: 'https://www.refrens.com',
};

export const ENV = envName;

export const API_BASE_URL = (
  process.env.API_BASE_URL || API_BASE_URL_DEFAULTS[envName] || 'https://serana.qa01.bizsuggest.com'
).replace(/\/$/, '');

export const BASE_URL = process.env.BASE_URL || 'https://qa01.bizsuggest.com';

/**
 * Fallback urlKey for CLI commands — set DEFAULT_URL_KEY in .env to skip --urlKey every time.
 * @example
 *   const urlKey = options.urlKey || DEFAULT_URL_KEY;
 */
export const DEFAULT_URL_KEY = process.env.DEFAULT_URL_KEY ?? '';
