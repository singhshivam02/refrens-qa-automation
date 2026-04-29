import dotenv from 'dotenv';
import path from 'path';

try {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {
  console.warn('dotenv not available, using process.env directly');
}

// ============================================================================
// TYPES
// ============================================================================

export type EnvironmentType = 'production' | 'staging' | 'development';
export type LocaleType = 'en' | 'es';

export interface EnvironmentConfig {
  locale: LocaleType;
  baseUrl: string;
  environment: EnvironmentType;
  headless: boolean;
  timeout: number;
  testPassword: string;
}

// ============================================================================
// ENVIRONMENT → URL MAPPING
// ============================================================================

const environmentUrls: Record<EnvironmentType, string> = {
  production:  'https://www.refrens.com',
  staging:     'https://staging.bizsuggest.com',
  development: 'http://localhost:3000',
};

// ============================================================================
// LOADER
// ============================================================================

function loadConfig(): EnvironmentConfig {
  const environment = (process.env.ENVIRONMENT || 'staging') as EnvironmentType;
  const locale      = (process.env.LOCALE       || 'en')      as LocaleType;

  const supportedEnvs: EnvironmentType[] = ['production', 'staging', 'development'];
  const supportedLocales: LocaleType[]   = ['en', 'es'];

  if (!supportedEnvs.includes(environment)) {
    throw new Error(`Unsupported ENVIRONMENT "${environment}". Use: ${supportedEnvs.join(' | ')}`);
  }
  if (!supportedLocales.includes(locale)) {
    throw new Error(`Unsupported LOCALE "${locale}". Use: ${supportedLocales.join(' | ')}`);
  }

  return {
    locale,
    environment,
    baseUrl:      process.env.BASE_URL      || environmentUrls[environment],
    headless:     process.env.HEADLESS      !== 'false',
    timeout:      parseInt(process.env.TIMEOUT || '30000', 10),
    testPassword: process.env.TEST_PASSWORD || '',
  };
}

export const config = loadConfig();
export default config;