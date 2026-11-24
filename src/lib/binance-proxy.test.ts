import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBinanceUpstreamUrl, getCacheSeconds, getCorsHeaders, handleRequest, isAllowedOrigin } from '../../supabase/functions/volterra-binance-market-data/index.ts';

const TEST_SUPABASE_URL = 'https://project.supabase.co';
const TEST_SERVICE_ROLE_KEY = 'server-only-test-key';

function installTestDenoEnv(values: Record<string, string>): () => void {
  const runtimeGlobal = globalThis as unknown as {
    Deno?: { env?: { get(name: string): string | undefined } };
  };
  const original = runtimeGlobal.Deno;
  runtimeGlobal.Deno = { env: { get: (name) => values[name] } };
  return () => {
    if (original === undefined) delete runtimeGlobal.Deno;
    else runtimeGlobal.Deno = original;
  };
}

function installConfiguredTestDenoEnv(): () => void {
  return installTestDenoEnv({
    SUPABASE_URL: TEST_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: TEST_SERVICE_ROLE_KEY,
  });
}

async function expectedClientHash(address: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(TEST_SERVICE_ROLE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(address));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

test('Binance proxy maps only approved market-data endpoints to the fixed Binance host', () => {
  const cases = [
    ['endpoint=exchangeInfo', '/eapi/v1/exchangeInfo'],
    ['endpoint=mark', '/eapi/v1/mark'],
    ['endpoint=ticker', '/eapi/v1/ticker'],
    ['endpoint=index&underlying=BTCUSDT', '/eapi/v1/index?underlying=BTCUSDT'],
    ['endpoint=openInterest&underlyingAsset=BTC&expiration=261225', '/eapi/v1/openInterest?underlyingAsset=BTC&expiration=261225'],
    ['endpoint=depth&symbol=BTC-261225-100000-C&limit=20', '/eapi/v1/depth?symbol=BTC-261225-100000-C&limit=20'],
  ];

  for (const [query, expected] of cases) {
    const upstream = buildBinanceUpstreamUrl(new URLSearchParams(query));
    assert.equal(upstream.origin, 'https://eapi.binance.com');
    assert.equal(`${upstream.pathname}${upstream.search}`, expected);
  }
});

test('Binance proxy rejects trade paths, arbitrary URLs, unknown and malformed parameters', () => {
  const invalidQueries = [
    'endpoint=order',
    'endpoint=toString',
    'endpoint=exchangeInfo&url=https%3A%2F%2Fevil.example',
    'endpoint=index&underlying=BTC%2F..%2Forder',
    'endpoint=openInterest&underlyingAsset=BTC&expiration=tomorrow',
    'endpoint=mark&symbol=BTC-261225-100000-C',
    'endpoint=depth&symbol=BTC-261225-100000-C&limit=1000',
    'endpoint=depth&symbol=BTC-261225-100000-C&limit=20&url=https%3A%2F%2Fevil.example',
    'endpoint=depth&symbol=BTC-261225-%2Fdepth-C&limit=20',
    'endpoint=depth&limit=20',
    'endpoint=depth&symbol=BTC-261225-100000-C&limit=20&limit=20',
    'endpoint=mark&endpoint=ticker',
  ];

  for (const query of invalidQueries) {
    assert.throws(() => buildBinanceUpstreamUrl(new URLSearchParams(query)));
  }
});

test('Binance proxy enables browser CORS only for the published app origin', () => {
  const appOrigin = 'https://raawaa93.github.io';
  assert.equal(isAllowedOrigin(appOrigin), true);
  assert.equal(isAllowedOrigin('http://localhost:5173'), false);
  assert.equal(isAllowedOrigin('http://localhost:4173'), false);
  assert.equal(isAllowedOrigin('https://attacker.example'), false);
  assert.equal(getCorsHeaders(appOrigin).get('Access-Control-Allow-Origin'), appOrigin);
  assert.equal(getCorsHeaders('http://localhost:5173').get('Access-Control-Allow-Origin'), null);
  assert.equal(getCorsHeaders('http://localhost:4173').get('Access-Control-Allow-Origin'), null);
  assert.equal(getCorsHeaders('https://attacker.example').get('Access-Control-Allow-Origin'), null);
  assert.equal(getCorsHeaders(null).get('Access-Control-Allow-Origin'), null);
  assert.match(getCorsHeaders(appOrigin).get('Access-Control-Allow-Headers') ?? '', /x-region/i);
  assert.equal(getCacheSeconds('exchangeInfo'), 60);
  assert.equal(getCacheSeconds('openInterest'), 15);
  assert.equal(getCacheSeconds('depth'), 2);
});

test('Binance proxy answers preflight and serves fixed-host JSON with the app CORS origin', async () => {
  const origin = 'https://raawaa93.github.io';
  const preflight = await handleRequest(new Request('https://function.example/?endpoint=exchangeInfo', {
    method: 'OPTIONS',
    headers: { origin },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.match(preflight.headers.get('Access-Control-Allow-Methods') ?? '', /GET/);

  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let upstreamUrl: URL | undefined;
  let upstreamInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/volterra_check_rate_limit')) {
      return new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 60 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    upstreamUrl = url;
    upstreamInit = init;
    return new Response(JSON.stringify([{ underlying: 'BTCUSDT', indexPrice: '100000' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=index&underlying=BTCUSDT', {
      headers: { origin, 'cf-connecting-ip': '198.51.100.10', 'x-forwarded-for': '203.0.113.10' },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=5, s-maxage=5, stale-while-revalidate=10');
    assert.deepEqual(await response.json(), [{ underlying: 'BTCUSDT', indexPrice: '100000' }]);
    assert.equal(upstreamUrl?.origin, 'https://eapi.binance.com');
    assert.equal(upstreamUrl?.pathname, '/eapi/v1/index');
    assert.equal(upstreamUrl?.searchParams.get('underlying'), 'BTCUSDT');
    assert.equal(upstreamInit?.method, 'GET');
    assert.equal(new Headers(upstreamInit?.headers).get('authorization'), null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('public requests without an Origin header still pass through the shared limiter', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let rateLimiterCalled = false;
  let upstreamCalled = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/volterra_check_rate_limit')) {
      rateLimiterCalled = true;
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${TEST_SERVICE_ROLE_KEY}`);
      return new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 60 }]), { status: 200 });
    }
    upstreamCalled = true;
    return new Response(JSON.stringify({ underlying: 'ETHUSDT', indexPrice: '2500' }), { status: 200 });
  };

  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=index&underlying=ETHUSDT', {
      headers: { 'cf-connecting-ip': '198.51.100.13' },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(rateLimiterCalled, true);
    assert.equal(upstreamCalled, true);
    assert.deepEqual(await response.json(), { underlying: 'ETHUSDT', indexPrice: '2500' });
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('Binance proxy serves hot cache reads without repeated shared-database calls', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let rateLimiterCalls = 0;
  let upstreamCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/volterra_check_rate_limit')) {
      rateLimiterCalls += 1;
      return new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 60 }]), { status: 200 });
    }
    upstreamCalls += 1;
    return new Response(JSON.stringify({ underlying: 'CACHEHITUSDT', indexPrice: '123' }), { status: 200 });
  };

  try {
    const request = () => new Request('https://function.example/?endpoint=index&underlying=CACHEHITUSDT', {
      headers: { origin: 'https://raawaa93.github.io', 'cf-connecting-ip': '198.51.100.240' },
    });
    const first = await handleRequest(request());
    const second = await handleRequest(request());

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { underlying: 'CACHEHITUSDT', indexPrice: '123' });
    assert.equal(rateLimiterCalls, 1, 'only the cache miss should call the shared database limiter');
    assert.equal(upstreamCalls, 1, 'the second request should be served from the in-memory cache');
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('Binance proxy refuses unknown browser origins and passes through upstream HTTP 451 without treating it as account eligibility', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let rateLimiterCalled = false;
  let upstreamCalled = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/volterra_check_rate_limit')) {
      rateLimiterCalled = true;
      return new Response(JSON.stringify([{ allowed: true, retry_after_seconds: 60 }]), { status: 200 });
    }
    upstreamCalled = true;
    return new Response(JSON.stringify({ code: 0, msg: 'Service unavailable from a restricted location.' }), { status: 451 });
  };
  try {
    const deniedOrigin = await handleRequest(new Request('https://function.example/?endpoint=mark', {
      headers: { origin: 'https://attacker.example', 'cf-connecting-ip': '198.51.100.11' },
    }));
    assert.equal(deniedOrigin.status, 403);
    assert.equal(rateLimiterCalled, false);
    assert.equal(upstreamCalled, false);

    const deniedLocalPreflight = await handleRequest(new Request('https://function.example/?endpoint=exchangeInfo', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    }));
    assert.equal(deniedLocalPreflight.status, 403);
    assert.equal(rateLimiterCalled, false);

    const upstreamDenial = await handleRequest(new Request('https://function.example/?endpoint=exchangeInfo', {
      headers: { origin: 'https://raawaa93.github.io', 'cf-connecting-ip': '198.51.100.12' },
    }));
    assert.equal(upstreamDenial.status, 451);
    assert.equal(upstreamDenial.headers.get('Access-Control-Allow-Origin'), 'https://raawaa93.github.io');
    assert.deepEqual(await upstreamDenial.json(), { code: 0, msg: 'Service unavailable from a restricted location.' });
    assert.equal(rateLimiterCalled, true);
    assert.equal(upstreamCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('shared rate limiting uses a keyed client hash and blocks upstream calls over quota', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let upstreamCalled = false;
  let rpcBody: Record<string, unknown> | undefined;
  let rpcHeaders: Headers | undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/volterra_check_rate_limit')) {
      rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      rpcHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify([{ allowed: false, retry_after_seconds: 17 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    upstreamCalled = true;
    return new Response('[]', { status: 200 });
  };

  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=mark', {
      headers: {
        origin: 'https://raawaa93.github.io',
        'cf-connecting-ip': '198.51.100.88',
        'x-forwarded-for': '203.0.113.88, 198.51.100.88',
        'x-real-ip': '203.0.113.89',
      },
    }));

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '17');
    assert.equal(upstreamCalled, false);
    assert.equal(rpcBody?.p_limit, 240);
    assert.equal(rpcBody?.p_window_seconds, 60);
    assert.equal(rpcBody?.p_client_hash, await expectedClientHash('198.51.100.88'));
    assert.notEqual(rpcBody?.p_client_hash, await expectedClientHash('203.0.113.88'));
    assert.equal(rpcHeaders?.get('authorization'), `Bearer ${TEST_SERVICE_ROLE_KEY}`);
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('proxy fails closed when the configured shared limiter is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let upstreamCalled = false;
  globalThis.fetch = async (input) => {
    if (new URL(String(input)).pathname.endsWith('/rpc/volterra_check_rate_limit')) {
      return new Response('{"error":"unavailable"}', { status: 503 });
    }
    upstreamCalled = true;
    return new Response('[]', { status: 200 });
  };

  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=mark', {
      headers: { origin: 'https://raawaa93.github.io', 'cf-connecting-ip': '198.51.100.89' },
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '30');
    assert.equal(upstreamCalled, false);
    assert.deepEqual(await response.json(), { error: 'Shared rate limiter is temporarily unavailable.' });
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('proxy fails closed when the Supabase limiter secrets are missing', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installTestDenoEnv({});
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('[]', { status: 200 });
  };

  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=mark', {
      headers: { origin: 'https://raawaa93.github.io', 'cf-connecting-ip': '198.51.100.90' },
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '30');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});

test('proxy does not use caller-supplied forwarding headers when the trusted address is missing', async () => {
  const originalFetch = globalThis.fetch;
  const restoreRuntime = installConfiguredTestDenoEnv();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('[]', { status: 200 });
  };

  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=mark', {
      headers: {
        origin: 'https://raawaa93.github.io',
        'x-forwarded-for': '203.0.113.90',
        'x-real-ip': '198.51.100.91',
      },
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '30');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreRuntime();
  }
});
