import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBinanceDepth, normalizeBinanceDepth } from './binance.ts';
import { estimateBookFill } from './market-depth.ts';

const symbol = 'BTC-261225-100000-C';

test('Binance depth normalization validates, sorts and timestamps book levels', () => {
  const snapshot = normalizeBinanceDepth({
    lastUpdateId: '1842',
    T: '1798200000000',
    bids: [['99', '2'], ['100', '1'], ['bad', '5'], ['98', '-1'], ['97', '0']],
    asks: [['102', '3'], ['101', '1'], ['0', '4']],
  }, symbol, 1798200000100);

  assert.equal(snapshot.symbol, symbol);
  assert.equal(snapshot.lastUpdateId, 1842);
  assert.equal(snapshot.transactionTime, 1798200000000);
  assert.equal(snapshot.fetchedAt, 1798200000100);
  assert.deepEqual(snapshot.bids, [{ price: 100, quantity: 1 }, { price: 99, quantity: 2 }]);
  assert.deepEqual(snapshot.asks, [{ price: 101, quantity: 1 }, { price: 102, quantity: 3 }]);
});

test('order-book fill estimate reports full, partial and empty visible liquidity without extrapolating', () => {
  const asks = [
    { price: 10, quantity: 2 },
    { price: 11, quantity: 3 },
  ];
  const full = estimateBookFill(asks, 4);
  assert.equal(full?.requestedQuantity, 4);
  assert.equal(full?.visibleQuantity, 4);
  assert.equal(full?.complete, true);
  assert.equal(full?.averagePrice, 10.5);
  assert.equal(full?.worstPrice, 11);
  assert.ok(Math.abs((full?.slippageFromBestPct ?? 0) - 5) < 1e-10);

  const partial = estimateBookFill(asks, 7);
  assert.equal(partial?.complete, false);
  assert.equal(partial?.visibleQuantity, 5);
  assert.equal(partial?.averagePrice, undefined);
  assert.equal(partial?.worstPrice, undefined);
  const nearMiss = estimateBookFill([{ price: 10, quantity: 1 }], 1 + 5e-10);
  assert.equal(nearMiss?.complete, false);
  assert.equal(nearMiss?.visibleQuantity, 1);
  assert.equal(nearMiss?.averagePrice, undefined);

  assert.equal(estimateBookFill(asks, 0), null);
  assert.equal(estimateBookFill([], 1), null);
});

test('Binance depth client requests only a validated option symbol and 20 levels', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return new Response(JSON.stringify({
      lastUpdateId: 42,
      T: 1798200000000,
      bids: [['99', '2']],
      asks: [['101', '3']],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const snapshot = await fetchBinanceDepth(symbol, 'https://proxy.example/functions/v1/market-data');
    assert.equal(requestedUrl?.searchParams.get('endpoint'), 'depth');
    assert.equal(requestedUrl?.searchParams.get('symbol'), symbol);
    assert.equal(requestedUrl?.searchParams.get('limit'), '20');
    assert.equal(snapshot.bids[0].price, 99);
    assert.equal(snapshot.asks[0].quantity, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Binance depth client refuses symbols that could escape the fixed endpoint contract', async () => {
  await assert.rejects(() => fetchBinanceDepth('BTC-261225-100000-C&url=https://evil.example'), /Invalid Binance option symbol/);
});
