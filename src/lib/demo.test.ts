import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_MARKETS, DEMO_QUOTES } from './demo.ts';

test('synthetic demo markets cover crypto, major altcoins and commodity underlyings', () => {
  assert.deepEqual(Object.keys(DEMO_MARKETS), ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'XAU', 'XAG', 'CL', 'BZ']);
  assert.ok(DEMO_MARKETS.DOGE.spot < 1);
  assert.ok(DEMO_MARKETS.XRP.spot < 2);
  assert.ok(DEMO_MARKETS.SOL.spot > 0);
  assert.ok(DEMO_MARKETS.XAU.spot > 1000);
  assert.ok(Object.values(DEMO_MARKETS).every((market) => market.iv30 !== null && market.rv30 !== null));
});

test('generated demo chains contain unique two-sided call/put quotes with finite Greeks for every asset', () => {
  const underlyingSet = new Set(Object.keys(DEMO_MARKETS));
  assert.equal(DEMO_QUOTES.length, underlyingSet.size * 4 * 9 * 2);
  assert.equal(new Set(DEMO_QUOTES.map((quote) => quote.id)).size, DEMO_QUOTES.length);
  assert.deepEqual(new Set(DEMO_QUOTES.map((quote) => quote.underlying)), underlyingSet);
  assert.ok(DEMO_QUOTES.every((quote) => quote.bid > 0 && quote.ask > quote.bid && quote.strike > 0));
  assert.ok(DEMO_QUOTES.every((quote) => ['delta', 'gamma', 'theta', 'vega', 'rho'].every((greek) => Number.isFinite(quote[greek as keyof typeof quote] as number))));
  assert.ok(DEMO_QUOTES.some((quote) => quote.underlying === 'XRP' && quote.type === 'CALL'));
  assert.ok(DEMO_QUOTES.some((quote) => quote.underlying === 'DOGE' && quote.type === 'PUT'));
  assert.ok(DEMO_QUOTES.some((quote) => quote.underlying === 'SOL' && quote.type === 'CALL'));
  assert.ok(DEMO_QUOTES.some((quote) => quote.underlying === 'XAU' && quote.type === 'PUT'));
  assert.ok(DEMO_QUOTES.filter((quote) => quote.underlying === 'DOGE').every((quote) => quote.strike < 1));
});
