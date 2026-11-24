import assert from 'node:assert/strict';
import test from 'node:test';
import { BinanceMarketDataError, fetchBinanceDepth, fetchBinanceOptions, normalizeBinanceDepth, normalizeBinanceSnapshot } from './binance.ts';
import { blackScholes, getMidPrice } from './options.ts';

function compactDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', year: '2-digit', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp)).split('/').reverse().join('');
}

test('Binance time to expiry uses exchange server time rather than the browser clock', () => {
  const serverTime = Date.UTC(2026, 10, 23, 12);
  const localFetchTime = serverTime + 2 * 86_400_000;
  const expiry = serverTime + 30 * 86_400_000;
  const symbol = `BTC-${compactDate(expiry)}-100000-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: localFetchTime,
    exchangeInfo: {
      serverTime,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
      optionSymbols: [{ symbol, underlying: 'BTCUSDT', side: 'CALL', strikePrice: 100000, expiryDate: expiry, unit: 1, status: 'TRADING' }],
    },
    marks: [{ symbol, markPrice: 5000, markIV: 0.5 }],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000 } }],
  });

  assert.equal(snapshot.quotes.length, 1);
  assert.equal(snapshot.quotes[0].daysToExpiry, 30);
  assert.equal(snapshot.quotes[0].underlyingKind, 'SPOT');
  assert.equal(snapshot.quotes[0].exerciseStyle, 'EUROPEAN');
  assert.equal(snapshot.quotes[0].settlementStyle, 'CASH');
  assert.equal(snapshot.quotes[0].pricingStatus, 'ASSUMED');
  assert.equal(snapshot.quotes[0].pricingModel, 'BLACK_SCHOLES_CARRY');
  assert.equal(snapshot.quotes[0].underlyingKind, 'SPOT');
  assert.equal(snapshot.quotes[0].exerciseStyle, 'EUROPEAN');
  assert.equal(snapshot.quotes[0].settlementStyle, 'CASH');
  assert.equal(snapshot.quotes[0].pricingStatus, 'ASSUMED');
  assert.equal(snapshot.quotes[0].pricingModel, 'BLACK_SCHOLES_CARRY');
});

test('Binance snapshot normalizer merges the active option universe and public market feeds', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const code = compactDate(expiry);
  const symbol = `BTC-${code}-100000-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT', settleAsset: 'USDT' }],
      optionSymbols: [
        { symbol, underlying: 'BTCUSDT', quoteAsset: 'USDT', side: 'CALL', strikePrice: '100000', expiryDate: expiry, unit: 1, minQty: '0.01', maxQty: '100', makerFeeRate: '0.0002', takerFeeRate: '0.0003', priceScale: 2, quantityScale: 2, status: 'TRADING', filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.1' }] },
        { symbol: `BTC-${code}-100000-P`, underlying: 'BTCUSDT', quoteAsset: 'USDT', side: 'PUT', strikePrice: '100000', expiryDate: expiry, unit: 1, status: 'HALT' },
      ],
    },
    marks: [{ symbol, markPrice: '5000', bidIV: '0.52', askIV: '0.58', markIV: '0.55', delta: '0.61', gamma: '0.00003', theta: '-25', vega: '49', riskFreeInterest: '0.02' }],
    tickers: [{ symbol, bidPrice: '4900', askPrice: '5100', volume: '12', amount: '60000', closeTime: now - 1000 }],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { underlying: 'BTCUSDT', indexPrice: '104000', time: now - 1000 } }],
    openInterest: [{ symbol, sumOpenInterest: '25', sumOpenInterestUsd: '2600000', timestamp: String(now - 2000) }],
  });

  assert.equal(snapshot.quotes.length, 1);
  assert.equal(snapshot.activeSymbols, 1);
  assert.deepEqual(snapshot.availableAssets, ['BTC']);
  assert.equal(snapshot.quotes[0].symbol, symbol);
  assert.equal(snapshot.quotes[0].spot, 104_000);
  assert.equal(snapshot.quotes[0].bid, 4_900);
  assert.equal(snapshot.quotes[0].ask, 5_100);
  assert.equal(snapshot.quotes[0].openInterest, 25);
  assert.equal(snapshot.quotes[0].openInterestUsd, 2_600_000);
  assert.equal(snapshot.quotes[0].unit, 1);
  assert.equal(snapshot.quotes[0].minQty, 0.01);
  assert.equal(snapshot.quotes[0].maxQty, 100);
  assert.equal(snapshot.quotes[0].priceSource, 'MARK');
  assert.equal(snapshot.quotes[0].delta, blackScholes(snapshot.quotes[0].spot, snapshot.quotes[0].strike, snapshot.quotes[0].daysToExpiry, snapshot.quotes[0].iv, 'CALL', 0.02).delta);
  assert.equal(snapshot.quotes[0].bidIv, 0.52);
  assert.equal(snapshot.quotes[0].askIv, 0.58);
  assert.deepEqual(snapshot.quotes[0].unverifiedSourceGreeks, {
    delta: 0.61, gamma: 0.00003, theta: -25, vega: 49,
  });
  assert.equal(snapshot.quotes[0].gamma, blackScholes(snapshot.quotes[0].spot, snapshot.quotes[0].strike, snapshot.quotes[0].daysToExpiry, snapshot.quotes[0].iv, 'CALL', 0.02).gamma);
  assert.equal(snapshot.quotes[0].quoteAsset, 'USDT');
  assert.equal(snapshot.quotes[0].filters?.[0].tickSize, '0.1');
});

test('Binance snapshot keeps every active crypto and commodity underlying returned by exchangeInfo', () => {
  const now = Date.now();
  const expiry = now + 35 * 86_400_000;
  const code = compactDate(expiry);
  const underlyings = [
    ['BTC', 'BTCUSDT'], ['ETH', 'ETHUSDT'], ['BNB', 'BNBUSDT'], ['XRP', 'XRPUSDT'],
    ['DOGE', 'DOGEUSDT'], ['SOL', 'SOLUSDT'], ['XAU', 'XAUUSDT'], ['XAG', 'XAGUSDT'],
    ['CL', 'CLUSDT'], ['BZ', 'BZUSDT'],
  ] as const;
  const contracts = underlyings.map(([baseAsset, underlying]) => ({ baseAsset, quoteAsset: 'USDT', underlying, settleAsset: 'USDT' }));
  const optionSymbols = underlyings.map(([baseAsset, underlying], index) => ({
    symbol: `${baseAsset}-${code}-${1000 + index}-C`,
    underlying,
    quoteAsset: 'USDT',
    side: 'CALL',
    strikePrice: 1000 + index,
    expiryDate: expiry,
    unit: 1,
    status: 'TRADING',
  }));
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: { serverTime: now, optionContracts: contracts, optionSymbols },
    marks: optionSymbols.map(({ symbol }) => ({ symbol, markPrice: '10', markIV: '0.5' })),
    indices: underlyings.map(([, underlying], index) => ({
      requestedUnderlying: underlying,
      item: { underlying, indexPrice: 1000 + index, time: now },
    })),
  });

  assert.equal(snapshot.quotes.length, underlyings.length);
  assert.deepEqual(snapshot.availableAssets, underlyings.map(([baseAsset]) => baseAsset).sort((a, b) => a.localeCompare(b)));
  assert.ok(snapshot.availableAssets.includes('DOGE'));
  assert.ok(snapshot.availableAssets.includes('SOL'));
  assert.ok(snapshot.availableAssets.includes('XAU'));
  assert.ok(snapshot.availableAssets.includes('XAG'));
  assert.ok(snapshot.availableAssets.includes('CL'));
  assert.ok(snapshot.availableAssets.includes('BZ'));
});

test('Binance normalizer avoids crossed bid/ask midpoints and preserves last-price provenance', () => {
  const now = Date.now();
  const expiry = now + 21 * 86_400_000;
  const code = compactDate(expiry);
  const symbol = `ETH-${code}-4000-P`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'ETH', quoteAsset: 'USDT', underlying: 'ETHUSDT' }],
      optionSymbols: [{ symbol, underlying: 'ETHUSDT', quoteAsset: 'USDT', side: 'PUT', strikePrice: 4000, expiryDate: expiry, unit: 1, status: 'TRADING', filters: [{ filterType: 'LOT_SIZE', minQty: '0.1', maxQty: '5', stepSize: '0.1' }] }],
    },
    marks: [{ symbol, markIV: 0.6 }],
    tickers: [{ symbol, bidPrice: 120, askPrice: 100, lastPrice: 111 }],
    indices: [{ requestedUnderlying: 'ETHUSDT', item: { indexPrice: 3500, time: now } }],
  });

  const quote = snapshot.quotes[0];
  assert.equal(quote.priceSource, 'LAST');
  assert.equal(quote.markPrice, 111);
  assert.equal(quote.minQty, 0.1);
  assert.equal(quote.maxQty, 5);
  assert.equal(getMidPrice(quote), 111);
  assert.ok(snapshot.warnings.some((warning) => warning.includes('تعارض Bid/Ask')));
  assert.ok(quote.estimatedFields?.includes('riskFreeRate'));
  assert.ok(!quote.estimatedFields?.includes('gamma'));
  assert.ok(!quote.estimatedFields?.includes('rho'));
  assert.equal(quote.pricingStatus, 'ASSUMED');
  assert.ok(Number.isFinite(quote.rho));
});

test('Binance client preserves HTTP 451 as a typed upstream access restriction', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('endpoint'), 'exchangeInfo');
    return new Response(JSON.stringify({
      code: 0,
      msg: 'Service unavailable from a restricted location according to b. Eligibility.',
    }), { status: 451, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await assert.rejects(fetchBinanceOptions('https://market-data-proxy.test/functions/v1/market-data'), (error: unknown) => {
      assert.ok(error instanceof BinanceMarketDataError);
      assert.equal(error.status, 451);
      assert.match(error.detail ?? '', /restricted location/);
      assert.match(error.message, /HTTP 451/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Binance client requests public exchange and market data endpoints and maps open interest by expiry', async () => {
  const now = Date.now();
  const expiry = now + 28 * 86_400_000;
  const expiryCode = compactDate(expiry);
  const symbol = `BTC-${expiryCode}-100000-C`;
  const requestedUrls: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    let payload: unknown;
    if (url.pathname.endsWith('/exchangeInfo')) {
      payload = {
        serverTime: now,
        optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
        optionSymbols: [{ symbol, underlying: 'BTCUSDT', quoteAsset: 'USDT', side: 'CALL', strikePrice: 100000, expiryDate: expiry, unit: 1, status: 'TRADING' }],
      };
    } else if (url.pathname.endsWith('/mark')) {
      payload = [{ symbol, markPrice: 5000, markIV: 0.5, delta: 0.55, riskFreeInterest: 0 }];
    } else if (url.pathname.endsWith('/ticker')) {
      payload = [{ symbol, bidPrice: 4900, askPrice: 5100, volume: 10, amount: 50000, closeTime: now }];
    } else if (url.pathname.endsWith('/index')) {
      payload = { indexPrice: 100000, time: now };
    } else if (url.pathname.endsWith('/openInterest')) {
      payload = { symbol, sumOpenInterest: 5, sumOpenInterestUsd: 500000, timestamp: now };
    } else {
      throw new Error(`Unexpected Binance URL ${url}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const snapshot = await fetchBinanceOptions();
    assert.equal(snapshot.activeSymbols, 1);
    assert.equal(snapshot.quotes.length, 1);
    assert.equal(snapshot.quotes[0].openInterestUsd, 500000);
    assert.ok(requestedUrls.some((url) => url.pathname.endsWith('/exchangeInfo')));
    assert.ok(requestedUrls.some((url) => url.pathname.endsWith('/mark')));
    assert.ok(requestedUrls.some((url) => url.pathname.endsWith('/ticker')));
    assert.ok(requestedUrls.some((url) => url.pathname.endsWith('/index') && url.searchParams.get('underlying') === 'BTCUSDT'));
    assert.ok(requestedUrls.some((url) => url.pathname.endsWith('/openInterest')
      && url.searchParams.get('underlyingAsset') === 'BTC'
      && url.searchParams.get('expiration') === expiryCode));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Binance client routes all public market data through the configured proxy', async () => {
  const now = Date.now();
  const expiry = now + 28 * 86_400_000;
  const expiryCode = compactDate(expiry);
  const symbol = `BTC-${expiryCode}-100000-C`;
  const proxyRoot = 'https://oyoyozdugicmnkfhjovo.supabase.co/functions/v1/volterra-binance-market-data';
  const requestedUrls: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    const endpoint = url.searchParams.get('endpoint');
    let payload: unknown;
    if (endpoint === 'exchangeInfo') {
      payload = {
        serverTime: now,
        optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
        optionSymbols: [{ symbol, underlying: 'BTCUSDT', quoteAsset: 'USDT', side: 'CALL', strikePrice: 100000, expiryDate: expiry, unit: 1, status: 'TRADING' }],
      };
    } else if (endpoint === 'mark') {
      payload = [{ symbol, markPrice: 5000, markIV: 0.5, delta: 0.55, riskFreeInterest: 0 }];
    } else if (endpoint === 'ticker') {
      payload = [{ symbol, bidPrice: 4900, askPrice: 5100, volume: 10, amount: 50000, closeTime: now }];
    } else if (endpoint === 'index') {
      payload = [{ underlying: 'BTCUSDT', indexPrice: 100000, time: now }];
    } else if (endpoint === 'openInterest') {
      payload = [{ symbol, sumOpenInterest: 5, sumOpenInterestUsd: 500000, timestamp: now }];
    } else {
      throw new Error(`Unexpected proxy URL ${url}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const snapshot = await fetchBinanceOptions(proxyRoot);
    assert.equal(snapshot.quotes.length, 1);
    assert.equal(snapshot.quotes[0].openInterestUsd, 500000);
    assert.ok(requestedUrls.length >= 5);
    assert.ok(requestedUrls.every((url) => url.origin === new URL(proxyRoot).origin));
    assert.ok(requestedUrls.every((url) => url.pathname === new URL(proxyRoot).pathname));
    assert.ok(requestedUrls.some((url) => url.searchParams.get('endpoint') === 'index' && url.searchParams.get('underlying') === 'BTCUSDT'));
    assert.ok(requestedUrls.some((url) => url.searchParams.get('endpoint') === 'openInterest'
      && url.searchParams.get('underlyingAsset') === 'BTC'
      && url.searchParams.get('expiration') === expiryCode));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Binance normalizer models a reference price only when IV is observed and no market price exists', () => {
  const now = Date.now();
  const expiry = now + 45 * 86_400_000;
  const symbol = `BTC-${compactDate(expiry)}-100000-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
      optionSymbols: [{ symbol, underlying: 'BTCUSDT', quoteAsset: 'USDT', side: 'CALL', strikePrice: 100000, expiryDate: expiry, unit: 1 }],
    },
    marks: [{ symbol, markIV: 0.55 }],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000 } }],
  });

  assert.equal(snapshot.quotes[0].priceSource, 'MODEL');
  assert.ok(snapshot.quotes[0].markPrice > 0);
  assert.ok(snapshot.quotes[0].estimatedFields?.includes('markPrice'));
});

test('Binance commodity options preserve perpetual-index mechanics and do not receive spot Greeks', () => {
  const now = Date.now();
  const expiry = now + 14 * 86_400_000;
  const code = compactDate(expiry);
  const symbol = `XAU-${code}-4000-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'XAU', quoteAsset: 'USDT', underlying: 'XAUUSDT', settleAsset: 'USDT', contractType: 'TRADFI_OPTIONS', underlyingType: 'COMMODITY' }],
      optionSymbols: [{
        symbol, underlying: 'XAUUSDT', quoteAsset: 'USDT', side: 'CALL', strikePrice: 4000,
        expiryDate: expiry, unit: 1, status: 'TRADING',
      }],
    },
    marks: [{ symbol, markPrice: 25, markIV: 0.22, delta: 0.61, gamma: 0.001, theta: -1.2, vega: 4.2 }],
    indices: [{ requestedUnderlying: 'XAUUSDT', item: { indexPrice: 3980, time: now } }],
  });

  assert.equal(snapshot.quotes.length, 1);
  const quote = snapshot.quotes[0];
  assert.equal(quote.underlyingKind, 'PERPETUAL');
  assert.equal(quote.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(quote.pricingModel, undefined);
  assert.ok(quote.pricingReason?.toLowerCase().includes('perpetual'));
  assert.equal(quote.delta, 0);
  assert.deepEqual(quote.unverifiedSourceGreeks, { delta: 0.61, gamma: 0.001, theta: -1.2, vega: 4.2 });
});

