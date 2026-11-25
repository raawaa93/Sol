const BINANCE_API_ROOT = 'https://eapi.binance.com';

const ENDPOINTS = {
  exchangeInfo: { path: '/eapi/v1/exchangeInfo', params: [] as const, cacheSeconds: 60 },
  mark: { path: '/eapi/v1/mark', params: [] as const, cacheSeconds: 5 },
  ticker: { path: '/eapi/v1/ticker', params: [] as const, cacheSeconds: 5 },
  index: { path: '/eapi/v1/index', params: ['underlying'] as const, cacheSeconds: 5 },
  openInterest: { path: '/eapi/v1/openInterest', params: ['underlyingAsset', 'expiration'] as const, cacheSeconds: 15 },
  depth: { path: '/eapi/v1/depth', params: ['symbol', 'limit'] as const, cacheSeconds: 2 },
} as const;

export type BinanceMarketEndpoint = keyof typeof ENDPOINTS;

const ALLOWED_ORIGINS = new Set([
  'https://raawaa93.github.io',
]);

export class ProxyRequestError extends Error {}

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}

export function getCorsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'accept, content-type',
    'Access-Control-Max-Age': '3600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && isAllowedOrigin(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function getCacheSeconds(endpoint: BinanceMarketEndpoint): number {
  return ENDPOINTS[endpoint].cacheSeconds;
}

export function buildBinanceUpstreamUrl(query: URLSearchParams): URL {
  const endpointValues = query.getAll('endpoint');
  if (endpointValues.length !== 1 || !Object.prototype.hasOwnProperty.call(ENDPOINTS, endpointValues[0])) {
    throw new ProxyRequestError('A single supported endpoint is required.');
  }

  const endpoint = endpointValues[0] as BinanceMarketEndpoint;
  const definition = ENDPOINTS[endpoint];
  const allowedParams = new Set<string>(['endpoint', ...definition.params]);
  const seen = new Set<string>();
  for (const [key] of query) {
    if (!allowedParams.has(key) || seen.has(key)) throw new ProxyRequestError('Unsupported or repeated query parameter.');
    seen.add(key);
  }

  const upstream = new URL(definition.path, BINANCE_API_ROOT);
  for (const name of definition.params) {
    const values = query.getAll(name);
    if (values.length !== 1) throw new ProxyRequestError(`Exactly one ${name} value is required.`);
    const value = values[0];
    if (name === 'underlying' && !/^[A-Z0-9]{3,16}$/.test(value)) {
      throw new ProxyRequestError('Invalid underlying symbol.');
    }
    if (name === 'underlyingAsset' && !/^[A-Z0-9]{2,10}$/.test(value)) {
      throw new ProxyRequestError('Invalid underlying asset.');
    }
    if (name === 'expiration' && (value.length !== 6 || [...value].some((character) => character < '0' || character > '9'))) {
      throw new ProxyRequestError('Invalid expiration date.');
    }
    if (name === 'symbol' && !/^[A-Z0-9]{2,16}-\d{6}-\d+(?:\.\d+)?-[CP]$/.test(value)) {
      throw new ProxyRequestError('Invalid option symbol for order-book depth.');
    }
    if (name === 'limit' && value !== '20') {
      throw new ProxyRequestError('Only a 20-level order-book snapshot is supported.');
    }
    upstream.searchParams.set(name, value);
  }
  return upstream;
}

interface CachedResponse {
  status: number;
  body: string;
  expiresAt: number;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

const responseCache = new Map<string, CachedResponse>();
const rateWindows = new Map<string, RateWindow>();
const MAX_REQUESTS_PER_MINUTE = 240;
const RATE_WINDOW_SECONDS = 60;
const RATE_WINDOW_MS = RATE_WINDOW_SECONDS * 1000;
const MAX_TRACKED_CLIENTS = 2_000;
const RATE_LIMIT_TIMEOUT_MS = 2_500;

function jsonResponse(payload: unknown, status: number, origin: string | null, cacheControl = 'no-store'): Response {
  const headers = getCorsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', cacheControl);
  return new Response(JSON.stringify(payload), { status, headers });
}

function normalizeIpAddress(value: string | null): string | null {
  const address = value?.trim();
  if (!address || address.includes(',') || address.includes('%')) return null;

  if (address.includes(':')) {
    try {
      const hostname = new URL(`http://[${address}]/`).hostname;
      return hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : null;
    } catch {
      return null;
    }
  }

  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return null;
  const normalizedOctets = octets.map(Number);
  if (normalizedOctets.some((octet) => octet > 255)) return null;
  return normalizedOctets.join('.');
}

function getTrustedClientAddress(request: Request): string | null {
  // Supabase's hosted edge gateway supplies this Cloudflare-managed header.
  // Do not fall back to X-Forwarded-For or X-Real-IP: callers can forge those.
  return normalizeIpAddress(request.headers.get('cf-connecting-ip'));
}

function getLocalRateLimitRetryAfter(clientHash: string): number | null {
  const now = Date.now();
  if (rateWindows.size >= MAX_TRACKED_CLIENTS) {
    for (const [key, window] of rateWindows) {
      if (now - window.startedAt >= RATE_WINDOW_MS) rateWindows.delete(key);
    }
    while (rateWindows.size >= MAX_TRACKED_CLIENTS) {
      const oldestKey = rateWindows.keys().next().value;
      if (!oldestKey) break;
      rateWindows.delete(oldestKey);
    }
  }

  const current = rateWindows.get(clientHash);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(clientHash, { startedAt: now, count: 1 });
    return null;
  }
  current.count = Math.min(MAX_REQUESTS_PER_MINUTE + 1, current.count + 1);
  return current.count > MAX_REQUESTS_PER_MINUTE
    ? Math.max(1, Math.ceil((current.startedAt + RATE_WINDOW_MS - now) / 1000))
    : null;
}

interface RateLimitDecision {
  limited: boolean;
  retryAfterSeconds: number;
  unavailable: boolean;
}

interface EdgeRuntime {
  env?: { get(name: string): string | undefined };
  serve?: (handler: (request: Request) => Response | Promise<Response>) => void;
}

function getEdgeRuntime(): EdgeRuntime | undefined {
  return (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
}

function getRuntimeEnv(name: string): string | undefined {
  try {
    return getEdgeRuntime()?.env?.get(name);
  } catch {
    return undefined;
  }
}

async function hashClientAddress(address: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(address));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function checkRateLimit(request: Request, checkSharedLimiter = true): Promise<RateLimitDecision> {
  const supabaseUrl = getRuntimeEnv('SUPABASE_URL');
  const serviceRoleKey = getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return { limited: false, retryAfterSeconds: 30, unavailable: true };
  }

  const clientAddress = getTrustedClientAddress(request);
  if (!clientAddress) {
    return { limited: false, retryAfterSeconds: 30, unavailable: true };
  }

  let clientHash: string;
  try {
    clientHash = await hashClientAddress(clientAddress, serviceRoleKey);
  } catch (error) {
    console.error('Volterra shared rate limiter is unavailable.', error instanceof Error ? error.name : 'unknown error');
    return { limited: false, retryAfterSeconds: 30, unavailable: true };
  }

  const localRetryAfter = getLocalRateLimitRetryAfter(clientHash);
  if (localRetryAfter !== null) {
    return { limited: true, retryAfterSeconds: localRetryAfter, unavailable: false };
  }

  // Cached responses do not reach the upstream API. Keep the per-isolate client
  // guard, but avoid a database round-trip for every hot-cache read.
  if (!checkSharedLimiter) {
    return { limited: false, retryAfterSeconds: RATE_WINDOW_SECONDS, unavailable: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_LIMIT_TIMEOUT_MS);
  try {
    const rpcUrl = new URL('/rest/v1/rpc/volterra_check_rate_limit', supabaseUrl);
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        p_client_hash: clientHash,
        p_limit: MAX_REQUESTS_PER_MINUTE,
        p_window_seconds: RATE_WINDOW_SECONDS,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Rate-limit RPC returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || typeof row !== 'object' || !('allowed' in row) || typeof row.allowed !== 'boolean') {
      throw new Error('Rate-limit RPC returned an invalid response.');
    }
    const retryAfter = 'retry_after_seconds' in row && typeof row.retry_after_seconds === 'number'
      ? Math.max(1, Math.ceil(row.retry_after_seconds))
      : RATE_WINDOW_SECONDS;
    return { limited: !row.allowed, retryAfterSeconds: retryAfter, unavailable: false };
  } catch (error) {
    console.error('Volterra shared rate limiter is unavailable.', error instanceof Error ? error.name : 'unknown error');
    return { limited: false, retryAfterSeconds: 30, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }
}

function cacheControlFor(seconds: number): string {
  return `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`;
}

export async function handleRequest(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);

  // Supabase's hosted ingress is fronted by Cloudflare. Accept only its
  // server-populated country metadata; never trust a client-side country field.
  const sourceCountry = request.headers.get('cf-ipcountry')?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(sourceCountry)) {
    return jsonResponse({ error: 'Trusted source-country metadata is unavailable; market data is denied.', code: 'SOURCE_COUNTRY_UNVERIFIED' }, 503, origin);
  }
  if (sourceCountry !== 'SY') {
    return jsonResponse({ error: 'Only requests classified as Syria by the trusted edge are allowed.', code: 'SOURCE_COUNTRY_NOT_ALLOWED' }, 403, origin);
  }

  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin)) return new Response(null, { status: 403, headers });
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Only GET requests are supported.' }, 405, origin);
  }
  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse({ error: 'This browser origin is not allowed.' }, 403, origin);
  }

  const incoming = new URL(request.url);
  let upstreamUrl: URL;
  let endpoint: BinanceMarketEndpoint;
  try {
    const endpointValue = incoming.searchParams.get('endpoint');
    if (!endpointValue) throw new ProxyRequestError('A supported endpoint is required.');
    endpoint = endpointValue as BinanceMarketEndpoint;
    upstreamUrl = buildBinanceUpstreamUrl(incoming.searchParams);
  } catch (error) {
    const message = error instanceof ProxyRequestError ? error.message : 'Invalid request.';
    return jsonResponse({ error: message }, 400, origin);
  }

  const now = Date.now();
  const cacheKey = upstreamUrl.toString();
  const cached = responseCache.get(cacheKey);
  const hasFreshCache = Boolean(cached && cached.expiresAt > now);

  const rateLimit = await checkRateLimit(request, !hasFreshCache);
  if (rateLimit.limited) {
    const response = jsonResponse({ error: 'Rate limit exceeded. Please wait before retrying.' }, 429, origin);
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }
  if (rateLimit.unavailable) {
    const response = jsonResponse({ error: 'Shared rate limiter is temporarily unavailable.' }, 503, origin);
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }

  if (hasFreshCache && cached) {
    return jsonResponse(JSON.parse(cached.body), cached.status, origin, cacheControlFor(getCacheSeconds(endpoint)));
  }
  if (cached) responseCache.delete(cacheKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const rawBody = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Binance returned an invalid or non-JSON response.' }, 502, origin);
    }

    const body = JSON.stringify(payload);
    const cacheSeconds = getCacheSeconds(endpoint);
    if (upstream.ok) {
      if (responseCache.size >= 128) {
        for (const [key, entry] of responseCache) {
          if (entry.expiresAt <= now) responseCache.delete(key);
        }
        if (responseCache.size >= 128) {
          const oldestKey = responseCache.keys().next().value;
          if (oldestKey) responseCache.delete(oldestKey);
        }
      }
      responseCache.set(cacheKey, { status: upstream.status, body, expiresAt: now + cacheSeconds * 1000 });
    }
    return jsonResponse(payload, upstream.status, origin, upstream.ok ? cacheControlFor(cacheSeconds) : 'no-store');
  } catch (error) {
    const detail = error instanceof Error && error.name === 'AbortError'
      ? 'The Binance market-data request timed out.'
      : 'Could not reach the Binance public market-data API.';
    return jsonResponse({ error: detail }, 502, origin);
  } finally {
    clearTimeout(timeout);
  }
}

getEdgeRuntime()?.serve?.(handleRequest);
