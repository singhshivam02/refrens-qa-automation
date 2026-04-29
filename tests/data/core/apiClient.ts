/**
 * ApiClient — JWT-token-based HTTP wrapper for the Refrens public API.
 *
 * Auth strategy: app-secret (appId + appSecret → JWT).
 * The token is cached per process so authentication happens once per run.
 *
 * Setup:
 *   1. Copy .env.example to .env
 *   2. Set API_APP_ID and API_APP_SECRET (from Refrens → Settings → API Keys)
 *   3. Call ApiClient.create() in tests or beforeAll hooks
 *
 * Usage:
 *   const api = await ApiClient.create();
 *   const invoice = await api.post('/businesses/my-biz/invoices', payload);
 */

import { API_BASE_URL } from './config';

// Per-process token cache — keyed by `${baseUrl}::${appId}`
const _tokenCache = new Map<string, string>();

export class ApiClient {
  private constructor(
    readonly baseUrl: string,
    private readonly token: string,
  ) {}

  // ── Authentication ────────────────────────────────────────────────────────

  /**
   * Authenticate and return a ready-to-use ApiClient.
   * Reads API_APP_ID and API_APP_SECRET from the environment by default.
   * The JWT is cached so each test process authenticates at most once.
   *
   * @example
   *   const api = await ApiClient.create();                          // uses env vars
   *   const api = await ApiClient.create('myId', 'mySecret');       // explicit
   */
  static async create(
    appId     = process.env.API_APP_ID,
    appSecret = process.env.API_APP_SECRET,
    baseUrl   = API_BASE_URL,
  ): Promise<ApiClient> {
    if (!appId || !appSecret) {
      throw new Error(
        '[ApiClient] API_APP_ID and API_APP_SECRET must be set.\n' +
        'Copy .env.example to .env and fill in your Refrens API credentials.\n' +
        'Get them from: Refrens app → Settings → API Keys.',
      );
    }

    const cacheKey = `${baseUrl}::${appId}`;
    const cached = _tokenCache.get(cacheKey);
    if (cached) return new ApiClient(baseUrl, cached);

    const res = await fetch(`${baseUrl}/authentication`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ strategy: 'app-secret', appId, appSecret }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `[ApiClient] Authentication failed: HTTP ${res.status}\n${body}\n` +
        'Check that API_APP_ID and API_APP_SECRET are correct.',
      );
    }

    const { accessToken } = await res.json() as { accessToken: string };
    _tokenCache.set(cacheKey, accessToken);
    console.log('[ApiClient] ✓ authenticated');
    return new ApiClient(baseUrl, accessToken);
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private get _headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };
  }

  async get<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, { headers: this._headers });
    await _assertOk(res, 'GET', endpoint);
    return res.json() as Promise<T>;
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method:  'POST',
      headers: this._headers,
      body:    JSON.stringify(body),
    });
    await _assertOk(res, 'POST', endpoint);
    return res.json() as Promise<T>;
  }

  async patch<T>(
    endpoint: string,
    body:     unknown,
    query?:   Record<string, string>,
  ): Promise<T> {
    const qs  = query ? '?' + new URLSearchParams(query).toString() : '';
    const res = await fetch(`${this.baseUrl}${endpoint}${qs}`, {
      method:  'PATCH',
      headers: this._headers,
      body:    JSON.stringify(body),
    });
    await _assertOk(res, 'PATCH', endpoint);
    return res.json() as Promise<T>;
  }

  async delete(endpoint: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method:  'DELETE',
      headers: this._headers,
    });
    await _assertOk(res, 'DELETE', endpoint);
  }
}

async function _assertOk(res: Response, method: string, endpoint: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '(unreadable body)');
  const hint = (res.status === 401 || res.status === 403)
    ? '\nHint: check API_APP_ID and API_APP_SECRET in your .env file.'
    : '';
  throw new Error(`[ApiClient] ${method} ${endpoint} → HTTP ${res.status}\n${body}${hint}`);
}
