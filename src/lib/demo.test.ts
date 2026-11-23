import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_QUOTES } from './demo.ts';

test('generated demo chain contains unique BTC and ETH call/put rows with two-sided markets', () => {
  assert.equal(DEMO_QUOTES.length, 144);
  assert.equal(new Set(DEMO_QUOTES.map((quote) => quote.id)).size, DEMO_QUOTES.length);
  assert.ok(DEMO_QUOTES.some((quote) => quote.underlying === 'BTC' && quote.type === 'CALL'));
  assert.ok(DEMO_QUOTES.some((quote) => quote.underlying === 'ETH' && quote.type === 'PUT'));
  assert.ok(DEMO_QUOTES.every((quote) => quote.bid > 0 && quote.ask > quote.bid));
});
