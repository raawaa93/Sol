import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBinanceUpstreamUrl, getCacheSeconds, getCorsHeaders, handleRequest, isAllowedOrigin } from '../../supabase/functions/volterra-binance-market-data/index.ts';

test('Binance proxy maps only approved market-data endpoints to the fixed Binance host', () => {
  const cases = [
    ['endpoint=exchangeInfo', '/eapi/v1/exchangeInfo'],
    ['endpoint=mark', '/eapi/v1/mark'],
    ['endpoint=ticker', '/eapi/v1/ticker'],
    ['endpoint=index&underlying=BTCUSDT', '/eapi/v1/index?underlying=BTCUSDT'],
    ['endpoint=openInterest&underlyingAsset=BTC&expiration=261225', '/eapi/v1/openInterest?underlyingAsset=BTC&expiration=261225'],
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
  assert.equal(getCacheSeconds('exchangeInfo'), 60);
  assert.equal(getCacheSeconds('openInterest'), 15);
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
  let upstreamUrl: URL | undefined;
  let upstreamInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(String(input));
    upstreamInit = init;
    return new Response(JSON.stringify([{ underlying: 'BTCUSDT', indexPrice: '100000' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await handleRequest(new Request('https://function.example/?endpoint=index&underlying=BTCUSDT', {
      headers: { origin, 'x-forwarded-for': 'proxy-test-success' },
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
  }
});

test('Binance proxy refuses unknown browser origins and passes through regional denial', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(JSON.stringify({ code: 0, msg: 'Service unavailable from a restricted location.' }), { status: 451 });
  };
  try {
    const deniedOrigin = await handleRequest(new Request('https://function.example/?endpoint=mark', {
      headers: { origin: 'https://attacker.example', 'x-forwarded-for': 'proxy-test-origin' },
    }));
    assert.equal(deniedOrigin.status, 403);
    assert.equal(called, false);

    const deniedLocalPreflight = await handleRequest(new Request('https://function.example/?endpoint=exchangeInfo', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    }));
    assert.equal(deniedLocalPreflight.status, 403);

    const upstreamDenial = await handleRequest(new Request('https://function.example/?endpoint=exchangeInfo', {
      headers: { origin: 'https://raawaa93.github.io', 'x-forwarded-for': 'proxy-test-region' },
    }));
    assert.equal(upstreamDenial.status, 451);
    assert.equal(upstreamDenial.headers.get('Access-Control-Allow-Origin'), 'https://raawaa93.github.io');
    assert.deepEqual(await upstreamDenial.json(), { code: 0, msg: 'Service unavailable from a restricted location.' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
