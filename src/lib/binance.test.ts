import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBinanceBookTicker, applyBinanceOptionMarkPrice, applyBinanceOptionTicker, BinanceMarketDataError, fetchBinanceDepth, fetchBinanceOptions, normalizeBinanceDepth, normalizeBinanceSnapshot, parseBinanceBookTickerMessage, parseBinanceOptionMarkPriceMessage, parseBinanceOptionTickerMessage } from './binance.ts';
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
  assert.equal(snapshot.quotes[0].markIvSource, 'REST_MARK');
  assert.equal(snapshot.quotes[0].riskFreeRateSource, 'REST_MARK');
  assert.equal(snapshot.quotes[0].sourceReceivedAt?.markIv, new Date(now).toISOString());
  assert.equal(snapshot.quotes[0].sourceReceivedAt?.riskFreeRate, new Date(now).toISOString());
  assert.equal(snapshot.quotes[0].sourceTimestamps?.markIv, undefined, 'REST mark endpoint has no exchange event timestamp; receive time is stored separately');
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


test('Binance preserves explicit crypto, commodity, and unknown contract metadata without unsafe model fallbacks', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const code = compactDate(expiry);
  const instruments = [
    { baseAsset: 'BTC', underlying: 'BTCUSDT', underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS', assetClass: 'CRYPTO', kind: 'SPOT', pricing: 'ASSUMED' },
    { baseAsset: 'XAU', underlying: 'XAUUSDT', underlyingType: 'COMMODITY', contractType: 'TRADFI_OPTIONS', assetClass: 'METALS', kind: 'PERPETUAL', pricing: 'OBSERVED_ONLY' },
    { baseAsset: 'RAT', underlying: 'RATUSDT', underlyingType: 'UNKNOWN', contractType: 'UNKNOWN_OPTIONS', assetClass: 'UNKNOWN', kind: 'UNKNOWN', pricing: 'OBSERVED_ONLY' },
  ] as const;
  const optionSymbols = instruments.map((item, index) => ({
    symbol: item.baseAsset + '-' + code + '-' + (100 + index) + '-C',
    underlying: item.underlying,
    quoteAsset: 'USDT',
    side: 'CALL',
    strikePrice: 100 + index,
    expiryDate: expiry,
    unit: 10,
    status: 'TRADING',
    underlyingType: item.underlyingType,
    contractType: item.contractType,
  }));
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: instruments.map(({ baseAsset, underlying, underlyingType, contractType }) => ({
        baseAsset, underlying, underlyingType, contractType, quoteAsset: 'USDT', settleAsset: 'USDT',
      })),
      optionSymbols,
    },
    marks: optionSymbols.map(({ symbol }) => ({ symbol, markPrice: 10, markIV: 0.5 })),
    indices: instruments.map(({ underlying }, index) => ({
      requestedUnderlying: underlying,
      item: { underlying, indexPrice: 100 + index, time: now },
    })),
  });

  for (const expected of instruments) {
    const quote = snapshot.quotes.find((item) => item.underlying === expected.baseAsset);
    assert.ok(quote, 'missing ' + expected.baseAsset + ' quote');
    assert.equal(quote.assetClass, expected.assetClass);
    assert.equal(quote.underlyingKind, expected.kind);
    assert.equal(quote.pricingStatus, expected.pricing);
    assert.equal(quote.quoteAsset, 'USDT');
    assert.equal(quote.settlementAsset, 'USDT');
    assert.equal(quote.unit, 10);
    assert.equal(quote.contractMultiplier, undefined);
  }

  const crypto = snapshot.quotes.find((item) => item.underlying === 'BTC');
  const commodity = snapshot.quotes.find((item) => item.underlying === 'XAU');
  const unknown = snapshot.quotes.find((item) => item.underlying === 'RAT');
  assert.equal(crypto?.exerciseStyle, 'EUROPEAN');
  assert.equal(crypto?.settlementStyle, 'CASH');
  assert.equal(crypto?.contractEconomics?.premium.multiplier, 1);
  assert.equal(crypto?.contractEconomics?.exercise.cashSettlement?.multiplier, 10);
  assert.equal(crypto?.contractEconomics?.provenance.status, 'PROVIDER_VERIFIED');
  assert.equal(crypto?.pricingModel, 'BLACK_SCHOLES_CARRY');
  assert.ok(crypto?.pricingReason?.includes('carry yield is assumed to be 0%'));
  assert.ok(Number.isFinite(crypto?.delta));
  assert.equal(crypto?.delta, blackScholes(crypto!.spot, crypto!.strike, crypto!.daysToExpiry, crypto!.iv, 'CALL', 0).delta);
  assert.equal(crypto?.ivStatus, 'OBSERVED');
  assert.equal(crypto?.iv, 0.5);
  assert.equal(commodity?.exerciseStyle, 'EUROPEAN');
  assert.equal(commodity?.settlementStyle, 'CASH');
  assert.equal(commodity?.pricingModel, undefined);
  assert.ok(commodity?.pricingReason?.includes('Perpetual Contract Index'));
  assert.ok(!snapshot.warnings.some((warning) => warning.includes('مقياس القسط غير مفصول')), 'verified canonical premium and settlement scales should not be reported as unverified');
  assert.equal(unknown?.exerciseStyle, undefined);
  assert.equal(unknown?.settlementStyle, undefined);
  assert.equal(unknown?.pricingModel, undefined);
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


test('Binance keeps ticker, index, and open-interest source timestamps separate', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const symbol = `BTC-${compactDate(expiry)}-100000-C`;
  const tickerTime = now - 1_000;
  const indexTime = now - 2_000;
  const openInterestTime = now - 60_000;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
      optionSymbols: [{
        symbol, underlying: 'BTCUSDT', side: 'CALL', strikePrice: 100000,
        expiryDate: expiry, unit: 1, status: 'TRADING',
      }],
    },
    marks: [{ symbol, markPrice: 10, markIV: 0.5 }],
    tickers: [{ symbol, bidPrice: 9, askPrice: 11, closeTime: tickerTime }],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000, time: indexTime } }],
    openInterest: [{ symbol, sumOpenInterest: 2, timestamp: openInterestTime }],
  });

  const quote = snapshot.quotes[0];
  assert.equal(quote.sourceTimestamp, new Date(tickerTime).toISOString());
  assert.deepEqual(quote.sourceTimestamps, {
    ticker: new Date(tickerTime).toISOString(),
    index: new Date(indexTime).toISOString(),
    openInterest: new Date(openInterestTime).toISOString(),
  });
});

test('Binance does not substitute index time for a missing ticker timestamp', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const symbol = `BTC-${compactDate(expiry)}-100000-C`;
  const indexTime = now - 2_000;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
      optionSymbols: [{
        symbol, underlying: 'BTCUSDT', side: 'CALL', strikePrice: 100000,
        expiryDate: expiry, unit: 1, status: 'TRADING',
      }],
    },
    marks: [{ symbol, markPrice: 10, markIV: 0.5 }],
    tickers: [{ symbol, bidPrice: 9, askPrice: 11 }],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000, time: indexTime } }],
  });

  assert.equal(snapshot.quotes[0].sourceTimestamp, undefined);
  assert.equal(snapshot.quotes[0].sourceTimestamps?.ticker, undefined);
  assert.equal(snapshot.quotes[0].sourceTimestamps?.index, new Date(indexTime).toISOString());
});

test('Binance quote diagnostics distinguish missing bid, ask, and both sides', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const code = compactDate(expiry);
  const symbols = [
    `BTC-${code}-100000-C`,
    `BTC-${code}-101000-C`,
    `BTC-${code}-102000-C`,
  ];
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT' }],
      optionSymbols: symbols.map((symbol, index) => ({
        symbol, underlying: 'BTCUSDT', side: 'CALL', strikePrice: 100000 + index * 1000,
        expiryDate: expiry, unit: 1, status: 'TRADING',
      })),
    },
    marks: symbols.map((symbol) => ({ symbol, markPrice: 10, markIV: 0.5 })),
    tickers: [
      { symbol: symbols[0], bidPrice: 9, lastPrice: 10 },
      { symbol: symbols[1], askPrice: 11, lastPrice: 10 },
      { symbol: symbols[2], lastPrice: 10 },
    ],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000, time: now } }],
  });

  assert.equal(snapshot.quotes.length, 3);
  assert.ok(snapshot.warnings.some((warning) =>
    warning.includes('Bid مفقود فقط: 1، Ask مفقود فقط: 1، كلاهما مفقود: 1')));
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


test('Binance client supports direct public market-data requests from the current browser network', async () => {
  const now = Date.now();
  const expiry = now + 28 * 86_400_000;
  const expiryCode = compactDate(expiry);
  const symbol = `BTC-${expiryCode}-100000-C`;
  const requestedUrls: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    assert.equal(url.origin, 'https://eapi.binance.com');
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
      payload = [{ underlying: 'BTCUSDT', indexPrice: 100000, time: now }];
    } else if (url.pathname.endsWith('/openInterest')) {
      payload = [{ symbol, sumOpenInterest: 5, sumOpenInterestUsd: 500000, timestamp: now }];
    } else if (url.pathname.endsWith('/depth')) {
      payload = { lastUpdateId: 7, bids: [['10', '2']], asks: [['11', '3']] };
    } else {
      throw new Error(`Unexpected direct Binance URL ${url}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const snapshot = await fetchBinanceOptions();
    assert.equal(snapshot.quotes.length, 1);
    assert.equal(snapshot.quotes[0].openInterestUsd, 500000);
    const depth = await fetchBinanceDepth(symbol);
    assert.equal(depth.bids[0].price, 10);
    assert.equal(depth.asks[0].price, 11);
    assert.ok(requestedUrls.length >= 6);
    assert.ok(requestedUrls.every((url) => url.origin === 'https://eapi.binance.com'));
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
  assert.equal(quote.assetClass, 'METALS');
  assert.equal(quote.exerciseStyle, 'EUROPEAN');
  assert.equal(quote.settlementStyle, 'CASH');
  assert.equal(quote.quoteAsset, 'USDT');
  assert.equal(quote.settlementAsset, 'USDT');
  assert.equal(quote.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(quote.pricingModel, undefined);
  assert.ok(quote.pricingReason?.toLowerCase().includes('perpetual'));
  assert.equal(quote.delta, 0);
  assert.deepEqual(quote.unverifiedSourceGreeks, { delta: 0.61, gamma: 0.001, theta: -1.2, vega: 4.2 });
});



test('Binance normalizer excludes contracts with unknown contract unit instead of assuming multiplier one', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const code = compactDate(expiry);
  const validSymbol = `BTC-${code}-100000-C`;
  const missingUnitSymbol = `BTC-${code}-100000-P`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{ baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT', settleAsset: 'USDT', contractType: 'CRYPTO_OPTIONS', underlyingType: 'CRYPTO' }],
      optionSymbols: [
        { symbol: validSymbol, underlying: 'BTCUSDT', side: 'CALL', strikePrice: 100000, expiryDate: expiry, unit: 1, status: 'TRADING' },
        { symbol: missingUnitSymbol, underlying: 'BTCUSDT', side: 'PUT', strikePrice: 100000, expiryDate: expiry, status: 'TRADING' },
      ],
    },
    marks: [
      { symbol: validSymbol, markPrice: 1200, markIV: 0.55 },
      { symbol: missingUnitSymbol, markPrice: 1100, markIV: 0.56 },
    ],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000, time: now } }],
  });

  assert.equal(snapshot.quotes.length, 1);
  assert.equal(snapshot.quotes[0].symbol, validSymbol);
  assert.equal(snapshot.quotes[0].unit, 1);
  assert.ok(snapshot.warnings.some((warning) => warning.includes('استُبعدت هذه العقود')));
});

test('Binance contract metadata classifies newly listed crypto assets and leaves unknown mechanics unassigned', () => {
  const now = Date.UTC(2026, 10, 24, 12);
  const expiry = now + 30 * 86_400_000;
  const code = compactDate(expiry);
  const cryptoSymbol = `AVAX-${code}-40-C`;
  const unknownSymbol = `ABC-${code}-100-C`;
  const equitySymbol = `NVDA-${code}-100-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [
        { baseAsset: 'AVAX', quoteAsset: 'USDT', underlying: 'AVAXUSDT', settleAsset: 'USDT', contractType: 'CRYPTO_OPTIONS', underlyingType: 'CRYPTO' },
        { baseAsset: 'ABC', quoteAsset: 'USD', underlying: 'ABCUSD', settleAsset: 'USD', contractType: 'UNRECOGNIZED_OPTIONS', underlyingType: 'UNRECOGNIZED' },
        { baseAsset: 'NVDA', quoteAsset: 'USD', underlying: 'NVDAUSD', settleAsset: 'USD', contractType: 'TRADFI_OPTIONS', underlyingType: 'EQUITY' },
      ],
      optionSymbols: [
        { symbol: cryptoSymbol, underlying: 'AVAXUSDT', side: 'CALL', strikePrice: 40, expiryDate: expiry, unit: 1, status: 'TRADING', contractType: 'CRYPTO_OPTIONS', underlyingType: 'CRYPTO' },
        { symbol: unknownSymbol, underlying: 'ABCUSD', side: 'CALL', strikePrice: 100, expiryDate: expiry, unit: 1, status: 'TRADING', contractType: 'UNRECOGNIZED_OPTIONS', underlyingType: 'UNRECOGNIZED' },
        { symbol: equitySymbol, underlying: 'NVDAUSD', side: 'CALL', strikePrice: 100, expiryDate: expiry, unit: 1, status: 'TRADING', contractType: 'TRADFI_OPTIONS', underlyingType: 'EQUITY' },
      ],
    },
    marks: [
      { symbol: cryptoSymbol, markPrice: 5, markIV: 0.7 },
      { symbol: unknownSymbol, markPrice: 8, markIV: 0.3 },
      { symbol: equitySymbol, markPrice: 7, markIV: 0.4 },
    ],
    indices: [
      { requestedUnderlying: 'AVAXUSDT', item: { indexPrice: 40, time: now } },
      { requestedUnderlying: 'ABCUSD', item: { indexPrice: 100, time: now } },
      { requestedUnderlying: 'NVDAUSD', item: { indexPrice: 100, time: now } },
    ],
  });

  const crypto = snapshot.quotes.find((quote) => quote.symbol === cryptoSymbol);
  const unknown = snapshot.quotes.find((quote) => quote.symbol === unknownSymbol);
  const equity = snapshot.quotes.find((quote) => quote.symbol === equitySymbol);
  assert.ok(crypto);
  assert.ok(unknown);
  assert.ok(equity);
  assert.equal(crypto.assetClass, 'CRYPTO');
  assert.equal(crypto.underlyingKind, 'SPOT');
  assert.equal(crypto.exerciseStyle, 'EUROPEAN');
  assert.equal(crypto.settlementStyle, 'CASH');
  assert.equal(crypto.settlementAsset, 'USDT');
  assert.equal(crypto.pricingStatus, 'ASSUMED');
  assert.equal(unknown.assetClass, 'UNKNOWN');
  assert.equal(unknown.underlyingKind, 'UNKNOWN');
  assert.equal(unknown.exerciseStyle, undefined);
  assert.equal(unknown.settlementStyle, undefined);
  assert.equal(unknown.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(unknown.pricingModel, undefined);
  assert.equal(equity.assetClass, 'EQUITY');
  assert.equal(equity.underlyingKind, 'UNKNOWN');
  assert.equal(equity.exerciseStyle, undefined);
  assert.equal(equity.settlementStyle, undefined);
  assert.equal(equity.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(equity.pricingModel, undefined);
});

test('Binance explicit underlyingType overrides legacy base-asset heuristics', () => {
  const now = Date.UTC(2026, 10, 24, 12);
  const expiry = now + 30 * 86_400_000;
  const symbol = `BTC-${compactDate(expiry)}-100-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{
        baseAsset: 'BTC', quoteAsset: 'USD', underlying: 'BTCUSD', settleAsset: 'USD',
        contractType: 'TRADFI_OPTIONS', underlyingType: 'EQUITY',
      }],
      optionSymbols: [{
        symbol, underlying: 'BTCUSD', side: 'CALL', strikePrice: 100, expiryDate: expiry, unit: 1,
        status: 'TRADING', contractType: '', underlyingType: '',
      }],
    },
    marks: [{ symbol, markPrice: 7, markIV: 0.4 }],
    indices: [{ requestedUnderlying: 'BTCUSD', item: { indexPrice: 100, time: now } }],
  });

  assert.equal(snapshot.quotes.length, 1);
  const quote = snapshot.quotes[0];
  assert.equal(quote.assetClass, 'EQUITY');
  assert.equal(quote.underlyingKind, 'UNKNOWN');
  assert.equal(quote.exerciseStyle, undefined);
  assert.equal(quote.settlementStyle, undefined);
  assert.equal(quote.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(quote.pricingModel, undefined);
});


test('Binance keeps contracts with a valid market price when implied volatility is unavailable', () => {
  const now = Date.now();
  const expiry = now + 30 * 86_400_000;
  const symbol = `BTC-${compactDate(expiry)}-100000-C`;
  const snapshot = normalizeBinanceSnapshot({
    fetchedAt: now,
    exchangeInfo: {
      serverTime: now,
      optionContracts: [{
        baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT',
        settleAsset: 'USDT', underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS',
      }],
      optionSymbols: [{
        symbol, underlying: 'BTCUSDT', side: 'CALL', strikePrice: 100000,
        expiryDate: expiry, unit: 10, status: 'TRADING',
        underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS',
      }],
    },
    marks: [{ symbol, markPrice: 1_000_001 }],
    indices: [{ requestedUnderlying: 'BTCUSDT', item: { indexPrice: 100000, time: now } }],
  });

  assert.equal(snapshot.quotes.length, 1);
  const quote = snapshot.quotes[0];
  assert.equal(quote.markPrice, 1_000_001);
  assert.equal(quote.bid, 0);
  assert.equal(quote.ask, 0);
  assert.equal(quote.iv, 0);
  assert.equal(quote.ivStatus, 'UNAVAILABLE');
  assert.equal(quote.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(quote.pricingModel, undefined);
  assert.ok(!quote.estimatedFields?.includes('iv'));
  assert.ok(snapshot.warnings.some((warning) => warning.includes('IV غير متاح لـ1 عقد')));
});


test('Binance bookTicker parser accepts combined events and preserves zero-sized sides', () => {
  const event = parseBinanceBookTickerMessage(JSON.stringify({
    stream: 'btc-261225-100000-c@bookTicker',
    data: {
      e: 'bookTicker', E: 1_800_000_001_000, T: 1_800_000_000_900,
      s: 'BTC-261225-100000-C', b: '0', B: '0', a: '12.5', A: '3',
    },
  }));
  assert.deepEqual(event, {
    symbol: 'BTC-261225-100000-C',
    bidPrice: 0,
    bidQuantity: 0,
    askPrice: 12.5,
    askQuantity: 3,
    eventTime: 1_800_000_001_000,
    transactionTime: 1_800_000_000_900,
  });
});

test('Binance bookTicker parser rejects malformed, unrelated, and negative quote events', () => {
  assert.equal(parseBinanceBookTickerMessage('{not-json'), null);
  assert.equal(parseBinanceBookTickerMessage({ e: 'trade', s: 'BTC-261225-100000-C' }), null);
  assert.equal(parseBinanceBookTickerMessage({
    e: 'bookTicker', s: 'BTC-261225-100000-C', b: '-1', B: '1', a: '2', A: '1',
  }), null);
});

test('Binance bookTicker updates only BBO fields and records its own source timestamp', () => {
  const quote = {
    id: 'BTC-261225-100000-C', symbol: 'BTC-261225-100000-C', underlying: 'BTC',
    expiry: '2026-12-25T08:00:00.000Z', daysToExpiry: 30, strike: 100000, type: 'CALL' as const,
    bid: 0, ask: 12, markPrice: 11, iv: 0.5, delta: 0.5, gamma: 0, theta: 0,
    vega: 0, rho: 0, openInterest: null, volume: null, spot: 100000, unit: 1,
    sourceTimestamps: { ticker: '2026-11-24T10:00:00.000Z' },
  };
  const event = {
    symbol: quote.symbol, bidPrice: 10, bidQuantity: 2, askPrice: 12, askQuantity: 3,
    transactionTime: 1_800_000_000_900,
  };
  const updated = applyBinanceBookTicker(quote, event);
  assert.equal(updated.bid, 10);
  assert.equal(updated.ask, 12);
  assert.equal(updated.markPrice, 11);
  assert.equal(updated.sourceTimestamps?.ticker, quote.sourceTimestamps.ticker);
  assert.equal(updated.sourceTimestamps?.bookTicker, new Date(event.transactionTime).toISOString());
});


test('Binance markPrice parser keeps venue vo separate from markIV', () => {
  const events = parseBinanceOptionMarkPriceMessage(JSON.stringify({
    stream: 'btc@markPrice',
    data: [{
      e: 'markPrice', E: 1_800_000_001_000, s: 'BTC-261225-100000-C',
      mp: '5200', i: '100500', bo: '5100', ao: '5300', bq: '1.25', aq: '2.5', b: '0.58', a: '0.62', vo: '0.60', rf: '0.02',
      d: '0.51', g: '0.00003', t: '-20', v: '45',
    }],
  }));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    symbol: 'BTC-261225-100000-C',
    eventTime: 1_800_000_001_000,
    markPrice: 5200,
    indexPrice: 100500,
    bestBid: 5100,
    bestAsk: 5300,
    bestBidQuantity: 1.25,
    bestAskQuantity: 2.5,
    bidIv: 0.58,
    askIv: 0.62,
    venueVolatility: 0.6,
    riskFreeRate: 0.02,
    sourceGreeks: { delta: 0.51, gamma: 0.00003, theta: -20, vega: 45 },
  });
  assert.deepEqual(parseBinanceOptionMarkPriceMessage('{bad-json'), []);
  assert.deepEqual(parseBinanceOptionMarkPriceMessage({ e: 'markPriceUpdate', s: 'BTC-TEST-C', E: 1, mp: 1 }), []);
});

test('Binance markPrice adapter refreshes index/rate and keeps venue vo out of markIV', () => {
  const eventTime = 1_800_000_001_000;
  const receivedAt = new Date(eventTime - 1000).toISOString();
  const quote = {
    id: 'BTC-261225-100000-C', symbol: 'BTC-261225-100000-C', underlying: 'BTC',
    expiry: '2026-12-25T08:00:00.000Z', daysToExpiry: 30, strike: 100000, type: 'CALL' as const,
    bid: 4900, ask: 5100, markPrice: 5000, priceSource: 'MARK' as const,
    iv: 0.5, ivStatus: 'OBSERVED' as const, markIvSource: 'REST_MARK' as const,
    riskFreeRateSource: 'REST_MARK' as const,
    sourceReceivedAt: { markIv: receivedAt, riskFreeRate: receivedAt },
    delta: 0.5, gamma: 0.00003, theta: -20, vega: 45, rho: 0,
    openInterest: 10, volume: 2, spot: 100000, unit: 1, riskFreeRate: 0.01, carryYield: 0,
    underlyingKind: 'SPOT' as const, exerciseStyle: 'EUROPEAN' as const, settlementStyle: 'CASH' as const,
    pricingStatus: 'ASSUMED' as const, pricingModel: 'BLACK_SCHOLES_CARRY' as const,
    sourceTimestamps: { markPrice: new Date(eventTime - 2000).toISOString(), index: new Date(eventTime - 2000).toISOString() },
    estimatedFields: ['markPrice', 'spot', 'riskFreeRate', 'delta'],
  };
  const event = {
    symbol: quote.symbol, eventTime, markPrice: 5200, indexPrice: 100500,
    bestBid: 5100, bestAsk: 5300, bestBidQuantity: 1.25, bestAskQuantity: 2.5,
    bidIv: 0.58, askIv: 0.62, venueVolatility: 0.6, riskFreeRate: 0.02,
    sourceGreeks: { delta: 0.99, gamma: 0.00004, theta: -30, vega: 55 },
  };
  const updated = applyBinanceOptionMarkPrice(quote, event, eventTime);
  assert.equal(updated.markPrice, 5200);
  assert.equal(updated.priceSource, 'MARK');
  assert.equal(updated.spot, 100500);
  assert.equal(updated.riskFreeRate, 0.02);
  assert.equal(updated.riskFreeRateSource, 'MARK_PRICE');
  assert.equal(updated.venueVolatility, 0.6);
  assert.equal(updated.bid, 5100);
  assert.equal(updated.ask, 5300);
  assert.equal(updated.bidAskSource, 'MARK_PRICE');
  assert.equal(updated.bidIv, 0.58);
  assert.equal(updated.askIv, 0.62);
  assert.equal(updated.iv, 0.5, 'venue vo must not be relabelled as observed markIV');
  assert.equal(updated.markIvSource, 'REST_MARK');
  assert.equal(updated.sourceTimestamps?.markPrice, new Date(eventTime).toISOString());
  assert.equal(updated.sourceTimestamps?.bidAsk, new Date(eventTime).toISOString());
  assert.equal(updated.sourceTimestamps?.index, new Date(eventTime).toISOString());
  assert.equal(updated.sourceTimestamps?.riskFreeRate, new Date(eventTime).toISOString());
  assert.equal(updated.sourceTimestamps?.venueVolatility, new Date(eventTime).toISOString());
  assert.equal(updated.sourceTimestamps?.bidIv, new Date(eventTime).toISOString());
  assert.equal(updated.sourceTimestamps?.askIv, new Date(eventTime).toISOString());
  assert.equal(updated.unverifiedSourceGreeks?.delta, 0.99);
  assert.notEqual(updated.delta, 0.99);
  assert.equal(updated.pricingStatus, 'ASSUMED');
  const stale = applyBinanceOptionMarkPrice(updated, { ...event, eventTime: eventTime - 1000, markPrice: 1 }, eventTime);
  assert.equal(stale, updated);
});

test('Binance underlying 24hr ticker preserves vo separately from explicit REST markIV', () => {
  const payload = {
    stream: 'btc@ticker@261225',
    data: [{
      e: '24hrTicker', E: 1_800_000_001_000, T: 1_800_000_000_950, C: 1_800_000_000_900,
      s: 'BTC-261225-100000-C', c: '5200', Q: '0.5', V: '12.5', A: '65000',
      vo: '0.60', mp: '5100', bo: '5000', ao: '5300', bq: '1.2', aq: '2.3', b: '0.58', a: '0.62', d: '0.51', g: '0.00003', t: '-20', v: '45',
    }],
  };
  const events = parseBinanceOptionTickerMessage(payload);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    symbol: 'BTC-261225-100000-C',
    eventTime: 1_800_000_001_000,
    transactionTime: 1_800_000_000_950,
    lastPrice: 5200,
    lastQuantity: 0.5,
    volume: 12.5,
    volumeQuote: 65000,
    closeTime: 1_800_000_000_900,
    markPrice: 5100,
    bestBid: 5000,
    bestAsk: 5300,
    bestBidQuantity: 1.2,
    bestAskQuantity: 2.3,
    bidIv: 0.58,
    askIv: 0.62,
    venueVolatility: 0.6,
    sourceGreeks: { delta: 0.51, gamma: 0.00003, theta: -20, vega: 45 },
  });
});

test('Binance 24hr ticker updates last trade and rolling volume only', () => {
  const quote = {
    id: 'BTC-261225-100000-C', symbol: 'BTC-261225-100000-C', underlying: 'BTC',
    expiry: '2026-12-25T08:00:00.000Z', daysToExpiry: 30, strike: 100000, type: 'CALL' as const,
    bid: 4900, ask: 5100, markPrice: 5000, priceSource: 'MARK' as const,
    iv: 0.5, ivStatus: 'OBSERVED' as const,
    delta: 0.5, gamma: 0.00003, theta: -20, vega: 45, rho: 0,
    openInterest: 10, volume: 2, volumeQuote: 10000, spot: 100000, unit: 1,
    sourceTimestamps: { markPrice: '2026-11-24T10:00:00.000Z' },
  };
  const event = {
    symbol: quote.symbol, eventTime: 1_800_000_001_000, transactionTime: 1_800_000_000_950, lastPrice: 5200,
    lastQuantity: 0.5, volume: 12.5, volumeQuote: 65000, closeTime: 1_800_000_000_900,
    markPrice: 5100, bestBid: 5000, bestAsk: 5300, bestBidQuantity: 1.2, bestAskQuantity: 2.3,
    bidIv: 0.58, askIv: 0.62, venueVolatility: 0.6,
    sourceGreeks: { delta: 0.99, gamma: 0.00004, theta: -30, vega: 55 },
  };
  const updated = applyBinanceOptionTicker(quote, event);
  assert.equal(updated.lastPrice, 5200);
  assert.equal(updated.lastQuantity, 0.5);
  assert.equal(updated.volume, 12.5);
  assert.equal(updated.volumeQuote, 65000);
  assert.equal(updated.markPrice, 5100);
  assert.equal(updated.bid, 5000);
  assert.equal(updated.ask, 5300);
  assert.equal(updated.bidAskSource, 'OPTION_TICKER');
  assert.equal(updated.bidIv, 0.58);
  assert.equal(updated.askIv, 0.62);
  assert.equal(updated.venueVolatility, 0.6);
  assert.equal(updated.unverifiedSourceGreeks?.delta, 0.99);
  assert.equal(updated.iv, 0.5, 'ticker vo must not be treated as explicit REST markIV');
  assert.equal(updated.sourceTimestamps?.markIv, undefined);
  assert.equal(updated.sourceTimestamps?.markPrice, new Date(event.transactionTime).toISOString());
  assert.equal(updated.sourceTimestamps?.venueVolatility, new Date(event.transactionTime).toISOString());
  assert.equal(updated.sourceTimestamps?.optionTicker, new Date(event.transactionTime).toISOString());
  assert.equal(updated.sourceTimestamps?.bidAsk, new Date(event.transactionTime).toISOString());
  assert.equal(updated.sourceTimestamps?.ticker, new Date(event.closeTime).toISOString());
});

test('Binance 24hr ticker never supplies markIV or model Greeks', () => {
  const quote = {
    id: 'BTC-261225-100000-C', symbol: 'BTC-261225-100000-C', underlying: 'BTC',
    expiry: '2026-12-25T08:00:00.000Z', daysToExpiry: 30, strike: 100000, type: 'CALL' as const,
    bid: 4900, ask: 5100, markPrice: 5000,
    iv: 0.5, ivStatus: 'OBSERVED' as const,
    delta: 0.5, gamma: 0.00003, theta: -20, vega: 45, rho: 0,
    openInterest: 10, volume: 2, spot: 100000, unit: 1, riskFreeRate: 0.02, carryYield: 0,
    underlyingKind: 'SPOT' as const, exerciseStyle: 'EUROPEAN' as const, settlementStyle: 'CASH' as const,
    pricingStatus: 'ASSUMED' as const, pricingModel: 'BLACK_SCHOLES_CARRY' as const,
    sourceTimestamps: { markPrice: '2026-11-24T10:00:00.000Z' },
  };
  const updated = applyBinanceOptionTicker(quote, {
    symbol: quote.symbol, eventTime: 1_800_000_001_000,
    lastPrice: 5200, volume: 12.5, volumeQuote: 65000,
  });
  assert.equal(updated.iv, 0.5);
  assert.equal(updated.delta, quote.delta);
  assert.equal(updated.pricingStatus, 'ASSUMED');
  assert.equal(updated.sourceTimestamps?.markIv, undefined);
});

test('Binance markPrice stream with stale REST markIV withholds model Greeks', () => {
  const eventTime = 1_800_000_001_000;
  const stale = new Date(eventTime - 120_000).toISOString();
  const quote = {
    id: 'BTC-261225-100000-C', symbol: 'BTC-261225-100000-C', underlying: 'BTC',
    expiry: '2026-12-25T08:00:00.000Z', daysToExpiry: 30, strike: 100000, type: 'CALL' as const,
    bid: 4900, ask: 5100, markPrice: 5000, iv: 0.5, ivStatus: 'OBSERVED' as const,
    markIvSource: 'REST_MARK' as const, riskFreeRateSource: 'REST_MARK' as const,
    sourceReceivedAt: { markIv: stale, riskFreeRate: stale },
    delta: 0.5, gamma: 0.00003, theta: -20, vega: 45, rho: 0,
    openInterest: 10, volume: 2, spot: 100000, unit: 1, riskFreeRate: 0.02,
    underlyingKind: 'SPOT' as const, exerciseStyle: 'EUROPEAN' as const, settlementStyle: 'CASH' as const,
    pricingStatus: 'ASSUMED' as const, pricingModel: 'BLACK_SCHOLES_CARRY' as const,
    sourceTimestamps: { markPrice: new Date(eventTime - 2000).toISOString() },
  };
  const updated = applyBinanceOptionMarkPrice(quote, {
    symbol: quote.symbol, eventTime, markPrice: 5200, indexPrice: 100500,
    venueVolatility: 0.6, riskFreeRate: 0.02, sourceGreeks: {},
  }, eventTime);
  assert.equal(updated.iv, 0.5);
  assert.equal(updated.venueVolatility, 0.6);
  assert.equal(updated.pricingStatus, 'OBSERVED_ONLY');
  assert.equal(updated.delta, 0);
  assert.equal(updated.gamma, 0);
  assert.equal(updated.vega, 0);
});
