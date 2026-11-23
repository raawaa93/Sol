const BINANCE_API_ROOT = 'https://eapi.binance.com';

const ENDPOINTS = {
  exchangeInfo: { path: '/eapi/v1/exchangeInfo', params: [] as const, cacheSeconds: 60 },
  mark: { path: '/eapi/v1/mark', params: [] as const, cacheSeconds: 5 },
  ticker: { path: '/eapi/v1/ticker', params: [] as const, cacheSeconds: 5 },
  index: { path: '/eapi/v1/index', params: ['underlying'] as const, cacheSeconds: 5 },
  openInterest: { path: '/eapi/v1/openInterest', params: ['underlyingAsset', 'expiration'] as const, cacheSeconds: 15 },
} as const;

export type BinanceMarketEndpoint = keyof typeof ENDPOINTS;

const ALLOWED_ORIGINS = new Set([
  'https://raawaa93.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
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
const RATE_WINDOW_MS = 60_000;

function jsonResponse(payload: unknown, status: number, origin: string | null, cacheControl = 'no-store'): Response {
  const headers = getCorsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', cacheControl);
  return new Response(JSON.stringify(payload), { status, headers });
}

function isRateLimited(request: Request): boolean {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientKey = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  if (rateWindows.size > 2_000) {
    for (const [key, window] of rateWindows) {
      if (now - window.startedAt >= RATE_WINDOW_MS) rateWindows.delete(key);
    }
  }
  const current = rateWindows.get(clientKey);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(clientKey, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_MINUTE;
}

function cacheControlFor(seconds: number): string {
  return `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`;
}

export async function handleRequest(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);

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
  if (isRateLimited(request)) {
    return jsonResponse({ error: 'Rate limit exceeded. Please wait before retrying.' }, 429, origin);
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
  if (cached && cached.expiresAt > now) {
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

interface EdgeRuntime {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
}

const edgeRuntime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
edgeRuntime?.serve(handleRequest);
